// 본인 신청 취소(PRD §5.3) — 2단계 본인확인.
//   1단계: 성명+연락처 확인 → 신청 이메일로 6자리 확인 코드 발송(10분 유효)
//   2단계: 확인 코드 일치 → 세션 신청 건을 '취소'로 변경(행 삭제 없음)
// 성명·연락처는 주변인이 알 수 있는 정보이므로, 신청자 본인의 메일함으로만 전달되는 코드를 추가로 요구한다.
// '취소'는 정원 집계에서 제외되므로 즉시 자리가 반환된다. 세션 시작 이후·이수 건은 취소 불가.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { jsonError, normalizePhone, PHONE_REGEX, readJsonBody } from "@/lib/api";
import { getDict, roundLabel } from "@/lib/i18n/dict";
import { allowPublicRequest } from "@/lib/rateLimit";
import { isMailerConfigured, sendMailWithRetry } from "@/lib/email/mailer";
import { renderCancelCodeMail } from "@/lib/email/cancelCode";
import { loadSettings, sendStatusChangeNotices } from "@/lib/email/service";
import type { CancelApplicationResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cancelSchema = z.object({
  name: z.string().trim().min(1).max(50),
  phone: z.string().trim().regex(PHONE_REGEX),
  applicationId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional(),
});

const CANCELLABLE_STATUSES = ["신청완료", "대기"];
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

interface AppRow {
  id: string;
  name: string;
  phone_digits: string;
  email: string;
  status: string;
  workshop: { round: number; round_label: string; topic: string; topic_en: string | null; start_at: string } | null;
}

interface CodeRow {
  code_hash: string;
  attempts: number;
  expires_at: string;
  created_at: string;
}

function hashCode(applicationId: string, code: string): string {
  return createHash("sha256").update(`${applicationId}:${code}`).digest("hex");
}

/** 메일 주소 가림: ab***@gnu.ac.kr */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, Math.min(2, Math.max(1, local.length - 1)))}***@${domain}`;
}

export async function POST(req: Request) {
  const { body, locale } = await readJsonBody(req);
  const t = getDict(locale).api;

  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) return jsonError(t.invalidInput, 400);

  const { name, phone, applicationId, code } = parsed.data;
  const db = createServiceClient();

  const allowed = await allowPublicRequest(
    db,
    req,
    "cancel",
    { limit: 60, windowSec: 600 },
    { value: applicationId, rule: { limit: 15, windowSec: 600 } }
  );
  if (!allowed) return jsonError(t.tooMany, 429);

  const { data: app, error } = await db
    .from("applications")
    .select("id, name, phone_digits, email, status, workshop:workshops(round, round_label, topic, topic_en, start_at)")
    .eq("id", applicationId)
    .maybeSingle<AppRow>();

  if (error) {
    console.error("[cancel] 조회 실패:", error.message);
    return jsonError(t.lookupFailed, 500);
  }

  // 존재 여부를 드러내지 않도록 미존재/본인 불일치를 같은 메시지로 처리한다.
  if (!app || app.name !== name || app.phone_digits !== normalizePhone(phone)) {
    return jsonError(t.notFound, 404);
  }
  if (app.status === "취소") return jsonError(t.alreadyCancelled, 400);
  if (!CANCELLABLE_STATUSES.includes(app.status)) return jsonError(t.completedNotCancellable, 400);
  if (!app.workshop) return jsonError(t.sessionInfoMissing, 500);
  if (Date.now() >= new Date(app.workshop.start_at).getTime()) {
    return jsonError(t.startedNotCancellable, 400);
  }

  const { data: codeRow } = await db
    .from("cancel_codes")
    .select("code_hash, attempts, expires_at, created_at")
    .eq("application_id", applicationId)
    .maybeSingle<CodeRow>();

  // ── 1단계: 확인 코드 발송 ────────────────────────────────────────────────
  if (!code) {
    const email = app.email.trim();
    if (!email) return jsonError(t.noEmailOnFile, 400);
    if (codeRow && Date.now() - new Date(codeRow.created_at).getTime() < RESEND_COOLDOWN_MS) {
      return jsonError(t.codeRecentlySent, 429);
    }
    if (!isMailerConfigured()) {
      console.error("[cancel] 메일 발송 환경변수 미설정 — 확인 코드를 보낼 수 없습니다.");
      return jsonError(t.codeSendFailed, 503);
    }

    const newCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { error: saveError } = await db.from("cancel_codes").upsert({
      application_id: applicationId,
      code_hash: hashCode(applicationId, newCode),
      attempts: 0,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      created_at: new Date().toISOString(),
    });
    if (saveError) {
      console.error("[cancel] 확인 코드 저장 실패:", saveError.message);
      return jsonError(t.codeSendFailed, 500);
    }

    const sessionLabel = `${roundLabel(locale, app.workshop.round, app.workshop.round_label)} · ${
      locale === "en" ? app.workshop.topic_en || app.workshop.topic : app.workshop.topic
    }`;
    try {
      await sendMailWithRetry({ to: email, ...renderCancelCodeMail(locale, app.name, sessionLabel, newCode) });
    } catch (err) {
      console.error("[cancel] 확인 코드 발송 실패:", err);
      await db.from("cancel_codes").delete().eq("application_id", applicationId);
      return jsonError(t.codeSendFailed, 502);
    }
    const sent: CancelApplicationResponse = { step: "code_sent", maskedEmail: maskEmail(email) };
    return NextResponse.json(sent);
  }

  // ── 2단계: 확인 코드 검증 → 취소 ──────────────────────────────────────────
  if (!codeRow || Date.now() > new Date(codeRow.expires_at).getTime()) {
    return jsonError(t.codeExpired, 400);
  }
  if (codeRow.attempts >= MAX_ATTEMPTS) return jsonError(t.codeTooManyAttempts, 400);

  const given = Buffer.from(hashCode(applicationId, code));
  const expected = Buffer.from(codeRow.code_hash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    await db
      .from("cancel_codes")
      .update({ attempts: codeRow.attempts + 1 })
      .eq("application_id", applicationId);
    return jsonError(t.codeMismatch, 400);
  }

  // 조회-갱신 사이 상태가 바뀌어도 덮어쓰지 않도록 상태 조건을 다시 건다.
  const { data: updated, error: updateError } = await db
    .from("applications")
    .update({ status: "취소" })
    .eq("id", applicationId)
    .in("status", CANCELLABLE_STATUSES)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("[cancel] 취소 갱신 실패:", updateError.message);
    return jsonError(t.cancelFailed, 500);
  }
  if (!updated) return jsonError(t.cancelStateChanged, 400);

  await db.from("cancel_codes").delete().eq("application_id", applicationId);

  // 본인 취소는 화면 안내로 갈음(M2 미발송) — 설정 send_on_self_cancel=true일 때만 발송(PRD §9.2)
  const settings = await loadSettings(db);
  if (settings.send_on_self_cancel) {
    await sendStatusChangeNotices(db, [{ applicationId, from: app.status, to: "취소" }]).catch(() => null);
  }

  const done: CancelApplicationResponse = { step: "cancelled", applicationId };
  return NextResponse.json(done);
}
