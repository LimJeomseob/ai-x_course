// 「다음 강의로 이동」 확인 기록 — 수강자가 차시 사이 안내 화면에서 직접 버튼을 눌렀음을 남긴다.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { TABLES } from "@/lib/db-tables";
import { findVideoApplication, identitySchema, videoErrorResponse } from "@/lib/videoServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nextSchema = identitySchema.extend({
  applicationId: z.string().uuid(),
  lessonId: z.string().uuid(),
});

export async function POST(req: Request) {
  const parsed = nextSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("요청 형식이 올바르지 않습니다.", 400);
  const input = parsed.data;

  try {
    const db = createServiceClient();
    const app = await findVideoApplication(db, input.name, input.phone, input.applicationId);
    const { error } = await db
      .from(TABLES.VIDEO_PROGRESS)
      .update({ next_confirmed_at: new Date().toISOString() })
      .eq("application_id", app.id)
      .eq("lesson_id", input.lessonId)
      .eq("status", "이수");
    if (error) return jsonError("기록 중 오류가 발생했습니다.", 500);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { message, status } = videoErrorResponse(err);
    return jsonError(message, status);
  }
}
