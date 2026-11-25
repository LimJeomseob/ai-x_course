// 시청 기록 저장 — 재생 시작·주기(30초)·일시정지·화면 이탈 시 브라우저가 누적 상태를 보낸다.
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import type { VideoProgressResponse } from "@/lib/types";
import {
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
    const { row } = await saveWatchState(db, app, lesson, input);
    const body: VideoProgressResponse = { lessonId: lesson.id, progress: progressView(row) };
    return NextResponse.json(body);
  } catch (err) {
    const { message, status } = videoErrorResponse(err);
    return jsonError(message, status);
  }
}
