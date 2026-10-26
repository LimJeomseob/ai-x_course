// 본인 신청 취소(PRD §5.3) — 성명+연락처 본인확인 후 세션 신청 건을 '취소'로 변경(행 삭제 없음).
// '취소'는 정원 집계에서 제외되므로 즉시 자리가 반환되고, 신청완료 건 취소 시 대기 1순위가 자동 승급된다(M2 발송).
// 세션 시작 이후·이수 건은 취소 불가.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { jsonError, normalizePhone, PHONE_REGEX } from "@/lib/api";
import { loadSettings, sendStatusChangeNotices } from "@/lib/email/service";
import { freesSeat, promoteWaitlist } from "@/lib/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cancelSchema = z.object({
  name: z.string().trim().min(1).max(50),
  phone: z.string().trim().regex(PHONE_REGEX),
  applicationId: z.string().uuid(),
});

const CANCELLABLE_STATUSES = ["신청완료", "대기"];

export async function POST(req: Request) {
  const parsed = cancelSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("입력값을 확인해 주세요.", 400);

  const { name, phone, applicationId } = parsed.data;
  const db = createServiceClient();

  const { data: app, error } = await db
    .from("applications")
    .select("id, name, phone_digits, status, workshop_id, workshop:workshops(start_at)")
    .eq("id", applicationId)
    .maybeSingle<{
      id: string;
      name: string;
      phone_digits: string;
      status: string;
      workshop_id: string;
      workshop: { start_at: string } | null;
    }>();

  if (error) return jsonError("조회 중 오류가 발생했습니다.", 500);

  // 존재 여부를 드러내지 않도록 미존재/본인 불일치를 같은 메시지로 처리한다.
  if (!app || app.name !== name || app.phone_digits !== normalizePhone(phone)) {
    return jsonError("일치하는 신청 내역이 없습니다. 성명과 연락처를 확인해 주세요.", 404);
  }
  if (app.status === "취소") return jsonError("이미 취소된 신청입니다.", 400);
  if (!CANCELLABLE_STATUSES.includes(app.status)) return jsonError("이수 완료된 신청은 취소할 수 없습니다.", 400);
  if (!app.workshop) return jsonError("세션 정보를 확인할 수 없습니다.", 500);
  if (Date.now() >= new Date(app.workshop.start_at).getTime()) {
    return jsonError("세션이 시작된 이후에는 취소할 수 없습니다.", 400);
  }

  // 조회-갱신 사이 상태가 바뀌어도 덮어쓰지 않도록 상태 조건을 다시 건다.
  const { data: updated, error: updateError } = await db
    .from("applications")
    .update({ status: "취소" })
    .eq("id", applicationId)
    .in("status", CANCELLABLE_STATUSES)
    .select("id")
    .maybeSingle();

  if (updateError) return jsonError("취소 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", 500);
  if (!updated) return jsonError("취소할 수 없는 상태로 변경되었습니다. 다시 조회해 주세요.", 400);

  // 본인 취소는 화면 안내로 갈음(M2 미발송) — 설정 send_on_self_cancel=true일 때만 발송(PRD §9.2)
  const settings = await loadSettings(db);
  if (settings.send_on_self_cancel) {
    await sendStatusChangeNotices(db, [{ applicationId, from: app.status, to: "취소" }]).catch(() => null);
  }

  // 신청완료 건 취소로 자리가 비면 대기자 자동 승급(승급자 M2는 설정과 무관하게 발송)
  const promoted = freesSeat(app.status, "취소") ? await promoteWaitlist(db, app.workshop_id) : [];

  return NextResponse.json({ ok: true, applicationId, status: "취소", promoted: promoted.length });
}
