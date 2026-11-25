// 동영상 강의 탭 진입 — 성명+연락처로 동영상 세션 신청 건을 확인하고 차시·진도를 반환한다.
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import type { VideoSessionResponse } from "@/lib/types";
import {
  findVideoApplication,
  identitySchema,
  loadLessons,
  loadProgressRows,
  progressView,
  videoErrorResponse,
} from "@/lib/videoServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = identitySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("성명과 연락처를 확인해 주세요.", 400);

  try {
    const db = createServiceClient();
    const app = await findVideoApplication(db, parsed.data.name, parsed.data.phone);
    const [lessons, rows] = await Promise.all([loadLessons(db, app.workshopId), loadProgressRows(db, app.id)]);
    const byLesson = new Map(rows.map((r) => [r.lesson_id, r]));

    const body: VideoSessionResponse = {
      applicationId: app.id,
      name: app.name,
      status: app.status,
      courseTitle: app.courseTitle,
      lessons: lessons.map((l) => ({ ...l, progress: progressView(byLesson.get(l.id)) })),
      courseCompleted: app.status === "이수",
    };
    return NextResponse.json(body);
  } catch (err) {
    const { message, status } = videoErrorResponse(err);
    return jsonError(message, status);
  }
}
