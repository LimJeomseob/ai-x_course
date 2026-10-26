// 대기자 자동 승급(PRD §5.3, §8) — 자리가 비는 상태 전이 직후 서버 API에서 호출한다.
// 승급 자체는 DB 함수 promote_waitlist(advisory lock)가 처리하고, 여기서는 M2 상태 변경 안내를 보낸다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendStatusChangeNotices } from "@/lib/email/service";

const SEAT_HOLDING_STATUSES = ["신청완료", "이수"];
const SEAT_FREEING_STATUSES = ["취소", "대기"];

/** from → to 전이가 정원 자리를 비우는지(승급 검사가 필요한지) */
export function freesSeat(from: string, to: string): boolean {
  return SEAT_HOLDING_STATUSES.includes(from) && SEAT_FREEING_STATUSES.includes(to);
}

export interface PromotedChange {
  applicationId: string;
  from: string;
  to: string;
}

/**
 * 세션의 결원만큼 대기자를 접수 순서대로 신청완료로 전환하고 M2를 보낸다.
 * 승급자 메일은 본인 취소 설정(send_on_self_cancel)·관리자 notify 옵션과 무관하게 항상 발송한다.
 * 메일 실패는 승급 결과에 영향을 주지 않는다.
 */
export async function promoteWaitlist(db: SupabaseClient, workshopId: string): Promise<PromotedChange[]> {
  const { data, error } = await db.rpc("promote_waitlist", { p_workshop_id: workshopId });
  const rows = (data ?? []) as { application_id: string; from_status: string; to_status: string }[];
  if (error || rows.length === 0) return [];

  const changes = rows.map((row) => ({ applicationId: row.application_id, from: row.from_status, to: row.to_status }));
  await sendStatusChangeNotices(db, changes).catch(() => null);
  return changes;
}

/** 여러 세션에 대해 순서대로 승급을 실행하고 승급 건수를 반환한다(중복 세션 id 제거). */
export async function promoteWaitlists(db: SupabaseClient, workshopIds: Iterable<string>): Promise<number> {
  let promoted = 0;
  for (const id of new Set(workshopIds)) {
    promoted += (await promoteWaitlist(db, id)).length;
  }
  return promoted;
}
