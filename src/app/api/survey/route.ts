// 만족도조사 제출(PRD §5.4) — 요청 횟수 제한 → 입력 검증 → service role INSERT.
// 공개 역할의 직접 INSERT 정책은 0007에서 제거한다. 응답은 익명으로 저장한다(IP 미저장).
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { issueMessage, jsonError, readJsonBody } from "@/lib/api";
import { AWARENESS_PATH_OPTIONS, COLLEGE_GROUP_OPTIONS } from "@/lib/constants";
import { TABLES } from "@/lib/db-tables";
import { getDict } from "@/lib/i18n/dict";
import { allowPublicRequest } from "@/lib/rateLimit";
import { getSchemas } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { body, locale } = await readJsonBody(req);
  const dict = getDict(locale);
  const t = dict.api;

  const parsed = getSchemas(locale).surveySchema.safeParse(body);
  if (!parsed.success) return jsonError(issueMessage(parsed.error.issues, t.invalidInput), 400);
  const v = parsed.data;

  // 선택지는 저장값(한국어) 허용 목록만 받는다 — 집계 기준이 흐트러지지 않도록.
  if (!COLLEGE_GROUP_OPTIONS.includes(v.collegeGroup)) return jsonError(dict.validation.collegeRequired, 400);
  if (!AWARENESS_PATH_OPTIONS.includes(v.awarenessPath)) return jsonError(dict.validation.awarenessRequired, 400);

  const db = createServiceClient();
  if (!(await allowPublicRequest(db, req, "survey", { limit: 60, windowSec: 600 }))) {
    return jsonError(t.tooMany, 429);
  }

  const { data: session } = await db
    .from(TABLES.WORKSHOPS)
    .select("round, round_label, topic")
    .eq("round", v.workshopRound)
    .maybeSingle<{ round: number; round_label: string; topic: string }>();
  if (!session) return jsonError(dict.validation.sessionRequired, 400);

  const { error } = await db.from(TABLES.SURVEY).insert({
    workshop_round: session.round,
    workshop: `${session.round_label} · ${session.topic}`,
    axis_participant: v.axisParticipant,
    college_group: v.collegeGroup,
    awareness_path: v.awarenessPath,
    q1: v.q1,
    q2: v.q2,
    q3: v.q3,
    q4: v.q4,
    q5: v.q5,
    q6: v.q6,
    q7: v.q7,
    o1: v.o1,
    o2: v.o2,
  });
  if (error) {
    console.error("[survey] 저장 실패:", error.message);
    return jsonError(t.surveyFailed, 500);
  }
  return NextResponse.json({ ok: true });
}
