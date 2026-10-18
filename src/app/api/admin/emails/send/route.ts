// 관리자 수동 (재)발송 — 선택 신청 건에 M1·M3·M5·M4를 유형별 통합 규칙으로 발송(PRD §9.4)
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, verifyAdminRequest } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { sendManual } from "@/lib/email/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  type: z.enum(["M1", "M3", "M5", "M4"]),
  applicationIds: z.array(z.string().uuid()).min(1).max(300),
});

export async function POST(req: Request) {
  if (!(await verifyAdminRequest(req))) return jsonError("관리자 인증이 필요합니다.", 401);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("입력값을 확인해 주세요.", 400);

  try {
    const outcome = await sendManual(createServiceClient(), parsed.data.type, parsed.data.applicationIds);
    return NextResponse.json(outcome);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "발송 중 오류가 발생했습니다.", 500);
  }
}
