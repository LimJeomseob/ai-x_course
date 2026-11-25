// 차시 이수 판정(서버 확정) — 기준(pass_ratio) 이상이면 차시 이수, 전 차시 이수 시 신청 상태를 '이수'로 바꾼다.
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import type { VideoProgressResponse } from "@/lib/types";
import { remainingSeconds, sanitizeRanges } from "@/lib/videoRanges";
import {
  finalizeCourse,
  findVideoApplication,
  loadLessonForApp,
  progressView,
  saveWatchState,
  videoErrorResponse,
  watchStateSchema,
} from "@/lib/videoServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = watchStateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("요청 형식이 올바르지 않습니다.", 400);
  const input = parsed.data;

  try {
    const db = createServiceClient();
    const app = await findVideoApplication(db, input.name, input.phone, input.applicationId);
    const lesson = await loadLessonForApp(db, app, input.lessonId);
    const { row } = await saveWatchState(db, app, lesson, input, { complete: true });
    const progress = progressView(row);

    if (!progress.completed) {
      const body: VideoProgressResponse = {
        lessonId: lesson.id,
        progress,
        remainingSec: remainingSeconds(
          sanitizeRanges(row.covered_ranges, lesson.duration_sec),
          Number(row.watched_sec),
          lesson.duration_sec,
          lesson.pass_ratio
        ),
      };
      return NextResponse.json(body);
    }

    const courseCompleted = await finalizeCourse(db, app.id);
    const body: VideoProgressResponse = { lessonId: lesson.id, progress, courseCompleted };
    return NextResponse.json(body);
  } catch (err) {
    const { message, status } = videoErrorResponse(err);
    return jsonError(message, status);
  }
}
