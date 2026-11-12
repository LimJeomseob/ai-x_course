// 공개 신청(PRD §5.2) — 요청 횟수 제한 → 입력 검증 → RPC apply_sessions(service role).
// 브라우저(anon key)의 RPC 직접 호출은 0007에서 차단하고, 신청은 이 경로로만 받는다.
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { issueMessage, jsonError, normalizePhone, readJsonBody } from "@/lib/api";
import { getDict } from "@/lib/i18n/dict";
import { allowPublicRequest } from "@/lib/rateLimit";
import { getSchemas } from "@/lib/validation";
import type { ApplySessionsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { body, locale } = await readJsonBody(req);
  const t = getDict(locale).api;

  const parsed = getSchemas(locale).applicationSchema.safeParse(body);
  if (!parsed.success) return jsonError(issueMessage(parsed.error.issues, t.invalidInput), 400);
  const v = parsed.data;

  const db = createServiceClient();
  // 학내망 공용 IP를 고려해 IP 한도는 넉넉히, 같은 연락처의 반복 제출은 좁게 제한한다.
  const allowed = await allowPublicRequest(
    db,
    req,
    "apply",
    { limit: 120, windowSec: 600 },
    { value: normalizePhone(v.phone), rule: { limit: 10, windowSec: 3600 } }
  );
  if (!allowed) return jsonError(t.tooMany, 429);

  const { data, error } = await db.rpc("apply_sessions", {
    p_payload: {
      name: v.name,
      affiliation: v.affiliation,
      id_number: v.idNumber,
      axis_participant: v.axisParticipant,
      phone: v.phone,
      email: v.email,
      consent: v.consent,
      locale,
    },
    p_session_ids: v.workshopIds,
  });
  if (error || !data) {
    console.error("[apply] RPC 실패:", error?.message);
    return jsonError(t.applyFailed, 500);
  }

  // DB가 돌려준 한국어 사유 대신 오류 코드로 화면 언어 문구를 만든다.
  const response = data as ApplySessionsResponse;
  response.results = response.results.map((r) =>
    r.ok ? r : { ...r, message: (r.code && t.applyCodes[r.code]) || t.applyUnknown }
  );
  return NextResponse.json(response);
}
