// 테스트 발송 — 샘플 데이터로 렌더링한 메일을 관리자 본인 주소로 발송(PRD §9.4)
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, verifyAdminRequest } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { sendTest } from "@/lib/email/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ type: z.enum(["M1", "M2", "M3", "M5", "M4"]) });

export async function POST(req: Request) {
  const admin = await verifyAdminRequest(req);
  if (!admin) return jsonError("관리자 인증이 필요합니다.", 401);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("메일 유형을 선택해 주세요.", 400);

  const ok = await sendTest(createServiceClient(), parsed.data.type, admin.email);
  if (!ok) return jsonError("테스트 발송에 실패했습니다. 발송 이력의 오류 메시지를 확인해 주세요.", 502);
  return NextResponse.json({ ok: true, to: admin.email });
}
