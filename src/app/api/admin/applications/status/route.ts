// 관리자 상태 변경(단건·일괄) + M2 상태 변경 안내 즉시 발송(PRD §6.2, §9.2)
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, verifyAdminRequest } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api";
import { sendStatusChangeNotices } from "@/lib/email/service";
import { APPLICATION_STATUSES } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(APPLICATION_STATUSES as [string, ...string[]]),
  notify: z.boolean().default(true),
});

export async function POST(req: Request) {
  if (!(await verifyAdminRequest(req))) return jsonError("관리자 인증이 필요합니다.", 401);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("입력값을 확인해 주세요.", 400);
  const { ids, status, notify } = parsed.data;

  const db = createServiceClient();
  const { data: current, error } = await db
    .from("applications")
    .select("id, status")
    .in("id", ids)
    .returns<{ id: string; status: string }[]>();
  if (error) return jsonError("신청 건 조회에 실패했습니다.", 500);

  const targets = (current ?? []).filter((row) => row.status !== status);
  const changed: { applicationId: string; from: string; to: string }[] = [];
  const failures: { id: string; error: string }[] = [];

  // 행 단위로 갱신해 중복 제약(동일 세션 활성 신청) 위반 건만 실패로 남긴다.
  for (const row of targets) {
    const { error: updateError } = await db
      .from("applications")
      .update({ status })
      .eq("id", row.id)
      .eq("status", row.status);
    if (updateError) {
      failures.push({
        id: row.id,
        error:
          updateError.code === "23505"
            ? "같은 세션에 동일 연락처의 활성 신청이 있어 변경할 수 없습니다."
            : updateError.message,
      });
    } else {
      changed.push({ applicationId: row.id, from: row.status, to: status });
    }
  }

  const mail = notify ? await sendStatusChangeNotices(db, changed).catch((e: Error) => ({
    sent: 0,
    failed: changed.length,
    skipped: 0,
    held: 0,
    messages: [e.message],
  })) : null;

  return NextResponse.json({ updated: changed.length, unchanged: ids.length - targets.length, failures, mail });
}
