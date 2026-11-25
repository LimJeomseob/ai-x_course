import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { normalizePhone, PHONE_REGEX } from "@/lib/api";
import { TABLES } from "@/lib/db-tables";
import type { ApplicationStatus, VideoLesson, VideoLessonProgress } from "@/lib/types";
import { effectiveRatio, mergeRanges, sanitizeRanges, type Range } from "@/lib/videoRanges";

/**
 * 동영상 강의 API 공통(서버 전용). applications·video_progress는 공개 역할이 읽을 수 없으므로
 * 모든 요청을 service role로 처리하고, 매 요청마다 성명+연락처로 신청 건을 다시 확인한다(기존 /api/lookup과 같은 방식).
 */

/** 경과 시간보다 재생 누적이 이만큼(초) 넘으면 넘는 부분을 잘라낸다(시계 오차 여유) */
const ELAPSED_SLACK_SEC = 15;

export const identitySchema = z.object({
  name: z.string().trim().min(1).max(50),
  phone: z.string().trim().regex(PHONE_REGEX),
});

export const watchStateSchema = identitySchema.extend({
  applicationId: z.string().uuid(),
  lessonId: z.string().uuid(),
  watchedSec: z.number().min(0).max(24 * 3600),
  positionSec: z.number().min(0).max(24 * 3600),
  ranges: z.array(z.tuple([z.number(), z.number()])).max(1000),
});

export type WatchStateInput = z.infer<typeof watchStateSchema>;

export interface VideoApplication {
  id: string;
  name: string;
  status: ApplicationStatus;
  workshopId: string;
  courseTitle: string;
}

interface AppRow {
  id: string;
  name: string;
  status: ApplicationStatus;
  created_at: string;
  workshop: { id: string; round_label: string; topic: string; delivery: string } | null;
}

export class VideoApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * 성명+연락처(+선택: 신청 ID)로 동영상 세션 신청 건을 찾는다.
 * 취소 건은 수강할 수 없다. 같은 사람이 여러 번 신청했다면 유효한 최신 건을 쓴다.
 */
export async function findVideoApplication(
  db: SupabaseClient,
  name: string,
  phone: string,
  applicationId?: string
): Promise<VideoApplication> {
  let query = db
    .from(TABLES.APPLICATIONS)
    .select("id, name, status, created_at, workshop:workshops!inner(id, round_label, topic, delivery)")
    .eq("name", name)
    .eq("phone_digits", normalizePhone(phone))
    .eq("workshop.delivery", "video");
  if (applicationId) query = query.eq("id", applicationId);

  const { data, error } = await query.returns<AppRow[]>();
  if (error) throw new VideoApiError("조회 중 오류가 발생했습니다.", 500);

  const rows = (data ?? []).filter((r) => r.workshop);
  if (rows.length === 0) {
    throw new VideoApiError(
      "동영상 강의 신청 내역이 없습니다. 「신청」 탭에서 동영상 강의를 먼저 신청해 주세요. 신청 시 입력한 성명·연락처와 같아야 합니다.",
      404
    );
  }
  const active = rows
    .filter((r) => r.status !== "취소")
    .sort((a, b) => (a.status === "이수" ? -1 : 0) - (b.status === "이수" ? -1 : 0) || b.created_at.localeCompare(a.created_at));
  if (active.length === 0) {
    throw new VideoApiError("취소된 신청입니다. 「신청」 탭에서 다시 신청한 뒤 수강해 주세요.", 403);
  }
  const app = active[0];
  return {
    id: app.id,
    name: app.name,
    status: app.status,
    workshopId: app.workshop!.id,
    courseTitle: `${app.workshop!.round_label} · ${app.workshop!.topic}`,
  };
}

export async function loadLessons(db: SupabaseClient, workshopId: string): Promise<VideoLesson[]> {
  const { data, error } = await db
    .from(TABLES.VIDEO_LESSONS)
    .select("id, lesson_no, title, youtube_id, duration_sec, pass_ratio, intro_text")
    .eq("workshop_id", workshopId)
    .eq("enabled", true)
    .order("lesson_no")
    .returns<VideoLesson[]>();
  if (error) throw new VideoApiError("차시 정보를 불러오지 못했습니다.", 500);
  return (data ?? []).map((l) => ({ ...l, pass_ratio: Number(l.pass_ratio) }));
}

export interface ProgressRow {
  id: string;
  application_id: string;
  lesson_id: string;
  watched_sec: number | string;
  covered_ranges: Range[];
  coverage_ratio: number | string;
  last_position_sec: number | string;
  hb_count: number;
  started_at: string;
  status: "수강중" | "이수";
  completed_at: string | null;
  note: string | null;
}

export async function loadProgressRows(db: SupabaseClient, applicationId: string): Promise<ProgressRow[]> {
  const { data, error } = await db
    .from(TABLES.VIDEO_PROGRESS)
    .select("*")
    .eq("application_id", applicationId)
    .returns<ProgressRow[]>();
  if (error) throw new VideoApiError("시청 기록을 불러오지 못했습니다.", 500);
  return data ?? [];
}

export function progressView(row: ProgressRow | undefined): VideoLessonProgress {
  if (!row) {
    return { watchedSec: 0, ranges: [], coverageRatio: 0, lastPositionSec: 0, completed: false, completedAt: null };
  }
  return {
    watchedSec: Number(row.watched_sec),
    ranges: row.covered_ranges ?? [],
    coverageRatio: Number(row.coverage_ratio),
    lastPositionSec: Number(row.last_position_sec),
    completed: row.status === "이수",
    completedAt: row.completed_at,
  };
}

/** 요청한 차시가 이 신청 건의 수강 가능한 차시인지 확인 */
export async function loadLessonForApp(
  db: SupabaseClient,
  app: VideoApplication,
  lessonId: string
): Promise<VideoLesson> {
  const lessons = await loadLessons(db, app.workshopId);
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) throw new VideoApiError("차시를 찾을 수 없습니다.", 404);
  if (!lesson.youtube_id) throw new VideoApiError("아직 준비 중인 차시입니다.", 409);
  return lesson;
}

/**
 * 브라우저가 보낸 시청 상태를 저장한다(구간은 합집합, 재생 누적은 최댓값).
 * 재생 누적은 이 차시를 처음 연 시각부터의 경과 시간 + 여유를 넘지 못하게 잘라 조작된 요청을 무력화한다.
 */
export async function saveWatchState(
  db: SupabaseClient,
  app: VideoApplication,
  lesson: VideoLesson,
  input: Pick<WatchStateInput, "watchedSec" | "positionSec" | "ranges">,
  opts: { complete?: boolean } = {}
): Promise<{ row: ProgressRow; ratio: number }> {
  const now = new Date();
  const { data: existing, error: readError } = await db
    .from(TABLES.VIDEO_PROGRESS)
    .select("*")
    .eq("application_id", app.id)
    .eq("lesson_id", lesson.id)
    .maybeSingle<ProgressRow>();
  if (readError) throw new VideoApiError("시청 기록을 불러오지 못했습니다.", 500);

  const startedAt = existing ? new Date(existing.started_at) : now;
  const elapsedSec = Math.max(0, (now.getTime() - startedAt.getTime()) / 1000);
  const ceiling = elapsedSec + ELAPSED_SLACK_SEC;
  const clientWatched = Math.min(input.watchedSec, lesson.duration_sec * 3);
  const clipped = clientWatched > ceiling;
  const watched = Math.max(Number(existing?.watched_sec ?? 0), Math.min(clientWatched, ceiling));

  const ranges = mergeRanges([
    ...sanitizeRanges(existing?.covered_ranges ?? [], lesson.duration_sec),
    ...sanitizeRanges(input.ranges, lesson.duration_sec),
  ]);
  const ratio = effectiveRatio(ranges, watched, lesson.duration_sec);
  const alreadyDone = existing?.status === "이수";
  const markDone = !alreadyDone && opts.complete === true && ratio + 1e-9 >= lesson.pass_ratio;

  const values = {
    watched_sec: Math.round(watched * 10) / 10,
    covered_ranges: ranges,
    coverage_ratio: Math.round(ratio * 10000) / 10000,
    last_position_sec: Math.min(lesson.duration_sec, Math.round(input.positionSec * 10) / 10),
    hb_count: (existing?.hb_count ?? 0) + 1,
    last_heartbeat_at: now.toISOString(),
    ...(markDone ? { status: "이수", completed_at: now.toISOString() } : {}),
    ...(clipped
      ? { note: `재생 누적 ${Math.round(clientWatched)}초 → 경과 시간 기준 ${Math.round(ceiling)}초로 보정(${now.toISOString()})` }
      : {}),
  };

  const query = existing
    ? db.from(TABLES.VIDEO_PROGRESS).update(values).eq("id", existing.id)
    : db.from(TABLES.VIDEO_PROGRESS).insert({
        application_id: app.id,
        lesson_id: lesson.id,
        started_at: now.toISOString(),
        ...values,
      });
  const { data: saved, error } = await query.select("*").single<ProgressRow>();
  if (error || !saved) throw new VideoApiError("시청 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  return { row: saved, ratio };
}

/** 전 차시 이수 시 신청 상태를 '이수'로 바꾸고 결과를 돌려준다 */
export async function finalizeCourse(db: SupabaseClient, applicationId: string): Promise<boolean> {
  const { data, error } = await db.rpc("video_finalize_course", { p_application_id: applicationId });
  if (error) throw new VideoApiError("이수 처리 중 오류가 발생했습니다.", 500);
  return data === true;
}

export function videoErrorResponse(err: unknown): { message: string; status: number } {
  if (err instanceof VideoApiError) return { message: err.message, status: err.status };
  console.error("[video-api]", err);
  return { message: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", status: 500 };
}
