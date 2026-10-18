import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLES } from "@/lib/db-tables";
import { addDaysToDateKey, kstDateKey } from "@/lib/format";
import { combinedNotes, instructorDisplay } from "@/lib/workshops";
import type { EmailLogType, EmailSettings, EmailTemplateRow, EmailType } from "@/lib/types";
import { buildVars, sampleSessions, SAMPLE_RECIPIENT, type MailSession, type StatusChange } from "./content";
import { sendMailWithRetry } from "./mailer";
import { renderEmail, resolveTemplate } from "./templates";

/**
 * 자동 안내 메일 발송 서비스(PRD §9). Cron(M1·M3·M5·M4)·관리자 상태변경(M2)·수동/테스트 발송이 공유한다.
 *  - 멱등: (application_id, type) 성공 로그가 있으면 Cron에서 다시 보내지 않는다.
 *  - 재시도: 즉시 1회(mailer) + 다음 Cron 주기, 실패 3회 누적 건은 Cron 대상에서 제외(관리자 수동 재발송).
 *  - 통합: 같은 수신자(이메일) 복수 세션은 1통(M1: 전체, M3·M5·M4: 운영일 단위).
 *  - 성공 시 notice1~3_confirmed 자동 갱신(M1→1차, M3→2차, M4→3차).
 */

export const MAX_FAILURES = 3;

const NOTICE_FIELD_BY_TYPE: Partial<Record<EmailType, string>> = {
  M1: "notice1_confirmed",
  M3: "notice2_confirmed",
  M4: "notice3_confirmed",
};

const APP_SELECT =
  "id, name, email, status, created_at, workshop:workshops(id, round, round_label, topic, start_at, end_at, notes, zoom_link, prelearning_url, day:workshop_days(day_code, day_label, location, location_url, is_online, instructor, instructor_title, instructor_org, notes))";

// 세션 시작일 조건을 걸기 위해 workshop 임베드를 inner join으로 지정한다.
const APP_SELECT_INNER = APP_SELECT.replace("workshop:workshops(", "workshop:workshops!inner(");

interface AppRow {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
  workshop: {
    id: string;
    round: number;
    round_label: string;
    topic: string;
    start_at: string;
    end_at: string;
    notes: string;
    zoom_link: string | null;
    prelearning_url: string | null;
    day: {
      day_code: string;
      day_label: string;
      location: string;
      location_url: string | null;
      is_online: boolean;
      instructor: string;
      instructor_title: string;
      instructor_org: string;
      notes: string;
    };
  };
}

interface Recipient {
  appId: string;
  name: string;
  email: string;
  session: MailSession;
}

export interface SendOutcome {
  sent: number;
  failed: number;
  skipped: number;
  held: number;
  messages: string[];
}

function emptyOutcome(): SendOutcome {
  return { sent: 0, failed: 0, skipped: 0, held: 0, messages: [] };
}

function mergeOutcome(a: SendOutcome, b: SendOutcome): SendOutcome {
  return {
    sent: a.sent + b.sent,
    failed: a.failed + b.failed,
    skipped: a.skipped + b.skipped,
    held: a.held + b.held,
    messages: [...a.messages, ...b.messages],
  };
}

export function portalUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "";
}

function toRecipient(row: AppRow): Recipient {
  const w = row.workshop;
  const d = w.day;
  return {
    appId: row.id,
    name: row.name,
    email: row.email.trim().toLowerCase(),
    session: {
      applicationId: row.id,
      round: w.round,
      roundLabel: w.round_label,
      topic: w.topic,
      startAt: w.start_at,
      endAt: w.end_at,
      dayCode: d.day_code,
      dayLabel: d.day_label,
      location: d.location,
      locationUrl: d.location_url,
      isOnline: d.is_online,
      instructor: instructorDisplay(d),
      notes: combinedNotes(d.notes, w.notes),
      status: row.status,
      zoomLink: w.zoom_link,
      prelearningUrl: w.prelearning_url,
    },
  };
}

export async function loadSettings(db: SupabaseClient): Promise<EmailSettings> {
  const { data } = await db.from(TABLES.EMAIL_SETTINGS).select("*").eq("id", 1).maybeSingle<EmailSettings>();
  return (
    data ?? {
      id: 1,
      enabled: true,
      m1_send_time: "18:00",
      m3_days_before: 3,
      m5_send_time: "09:00",
      m4_send_time: "08:00",
      send_on_self_cancel: false,
      daily_limit: 450,
      admin_alert_email: process.env.GMAIL_USER ?? "",
      updated_at: new Date().toISOString(),
    }
  );
}

async function loadTemplateRow(db: SupabaseClient, type: EmailType): Promise<EmailTemplateRow | null> {
  const { data } = await db
    .from(TABLES.EMAIL_TEMPLATES)
    .select("*")
    .eq("type", type)
    .maybeSingle<EmailTemplateRow>();
  return data;
}

/** 오늘(KST) 성공 발송 통수 — 통합 발송 1통 = batch_key 1개 */
async function sentTodayCount(db: SupabaseClient, now: Date): Promise<number> {
  const since = new Date(`${kstDateKey(now)}T00:00:00+09:00`).toISOString();
  const { data } = await db
    .from(TABLES.EMAIL_LOGS)
    .select("batch_key")
    .eq("status", "성공")
    .gte("created_at", since);
  return new Set((data ?? []).map((r: { batch_key: string }) => r.batch_key)).size;
}

/** (application_id, type)별 성공 여부·실패 누적 */
async function logSummary(db: SupabaseClient, appIds: string[], type: EmailType) {
  const summary = new Map<string, { success: boolean; failures: number }>();
  for (let i = 0; i < appIds.length; i += 200) {
    const { data } = await db
      .from(TABLES.EMAIL_LOGS)
      .select("application_id, status")
      .eq("type", type)
      .in("application_id", appIds.slice(i, i + 200));
    for (const row of (data ?? []) as { application_id: string; status: string }[]) {
      const cur = summary.get(row.application_id) ?? { success: false, failures: 0 };
      if (row.status === "성공") cur.success = true;
      if (row.status === "실패") cur.failures += 1;
      summary.set(row.application_id, cur);
    }
  }
  return summary;
}

async function queryApps(
  db: SupabaseClient,
  opts: { ids?: string[]; statuses?: string[]; createdBefore?: string; startFrom?: string; startTo?: string }
): Promise<AppRow[]> {
  let query = db.from(TABLES.APPLICATIONS).select(APP_SELECT_INNER);
  if (opts.ids) query = query.in("id", opts.ids);
  if (opts.statuses) query = query.in("status", opts.statuses);
  if (opts.createdBefore) query = query.lte("created_at", opts.createdBefore);
  if (opts.startFrom) query = query.gte("workshop.start_at", opts.startFrom);
  if (opts.startTo) query = query.lt("workshop.start_at", opts.startTo);
  const { data, error } = await query.neq("email", "").returns<AppRow[]>();
  if (error) throw new Error(`신청 데이터 조회 실패: ${error.message}`);
  return (data ?? []).filter((r) => r.workshop && r.workshop.day);
}

interface DeliverInput {
  type: EmailLogType;
  templateType: EmailType;
  to: string;
  name: string;
  sessions: MailSession[];
  changes?: StatusChange[];
  appIds: string[];
  priorFailures?: number;
}

async function deliver(db: SupabaseClient, input: DeliverInput): Promise<boolean> {
  const row = await loadTemplateRow(db, input.templateType);
  const template = resolveTemplate(input.templateType, row);
  const vars = buildVars(input.templateType, { name: input.name, email: input.to }, input.sessions, input.changes);
  const mail = renderEmail(template, vars, portalUrl());
  const batchKey = `${input.type}-${kstDateKey(new Date())}-${crypto.randomUUID()}`;

  let status: "성공" | "실패" = "성공";
  let errorMessage: string | null = null;
  try {
    await sendMailWithRetry({ to: input.to, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    status = "실패";
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const now = new Date().toISOString();
  const logRows = (input.appIds.length ? input.appIds : [null]).map((appId) => ({
    application_id: appId,
    batch_key: batchKey,
    type: input.type,
    to_email: input.to,
    subject: mail.subject,
    status,
    error_message: errorMessage,
    retry_count: input.priorFailures ?? 0,
    sent_at: status === "성공" ? now : null,
  }));
  await db.from(TABLES.EMAIL_LOGS).insert(logRows);

  const noticeField = status === "성공" ? NOTICE_FIELD_BY_TYPE[input.type as EmailType] : undefined;
  if (noticeField && input.appIds.length) {
    await db.from(TABLES.APPLICATIONS).update({ [noticeField]: true }).in("id", input.appIds);
  }
  return status === "성공";
}

/** 수신자 묶음 발송 공통 루프(일 발송 한도 확인 포함) */
async function deliverGroups(
  db: SupabaseClient,
  type: EmailType,
  groups: Map<string, Recipient[]>,
  settings: EmailSettings,
  failures: Map<string, { success: boolean; failures: number }> | null,
  now: Date
): Promise<SendOutcome> {
  const outcome = emptyOutcome();
  let todayCount = await sentTodayCount(db, now);

  for (const recipients of groups.values()) {
    if (todayCount >= settings.daily_limit) {
      outcome.skipped += recipients.length;
      outcome.messages.push(`일 발송 한도(${settings.daily_limit}통) 도달 — 남은 건은 다음 주기로 이월`);
      break;
    }
    const sorted = [...recipients].sort((a, b) => a.session.startAt.localeCompare(b.session.startAt));
    const ok = await deliver(db, {
      type,
      templateType: type,
      to: sorted[0].email,
      name: sorted[sorted.length - 1].name,
      sessions: sorted.map((r) => r.session),
      appIds: sorted.map((r) => r.appId),
      priorFailures: Math.max(0, ...sorted.map((r) => failures?.get(r.appId)?.failures ?? 0)),
    });
    if (ok) {
      outcome.sent += 1;
      todayCount += 1;
    } else {
      outcome.failed += 1;
    }
  }
  return outcome;
}

function groupBy(recipients: Recipient[], key: (r: Recipient) => string): Map<string, Recipient[]> {
  const map = new Map<string, Recipient[]>();
  for (const r of recipients) {
    const k = key(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return map;
}

/** Cron 대상 필터: 이미 성공했거나 실패 3회 누적 건 제외 */
async function filterPending(db: SupabaseClient, type: EmailType, recipients: Recipient[]) {
  const summary = await logSummary(db, recipients.map((r) => r.appId), type);
  const pending = recipients.filter((r) => {
    const s = summary.get(r.appId);
    return !s?.success && (s?.failures ?? 0) < MAX_FAILURES;
  });
  return { pending, summary, skipped: recipients.length - pending.length };
}

async function guard(db: SupabaseClient, type: EmailType): Promise<{ settings: EmailSettings; reason?: string }> {
  const settings = await loadSettings(db);
  if (!settings.enabled) return { settings, reason: "메일 발송이 꺼져 있습니다(email_settings.enabled=false)." };
  const row = await loadTemplateRow(db, type);
  if (row && !row.enabled) return { settings, reason: `${type} 템플릿이 비활성화되어 있습니다.` };
  return { settings };
}

/** M1 신청 결과 안내 — 매일 18:00 KST, 미발송 신청 건을 이메일 기준 1통으로 통합 */
export async function runM1(db: SupabaseClient, now = new Date()): Promise<SendOutcome> {
  const { settings, reason } = await guard(db, "M1");
  if (reason) return { ...emptyOutcome(), messages: [reason] };

  const rows = await queryApps(db, { statuses: ["신청완료", "대기", "이수"], createdBefore: now.toISOString() });
  const { pending, summary, skipped } = await filterPending(db, "M1", rows.map(toRecipient));
  const outcome = await deliverGroups(db, "M1", groupBy(pending, (r) => r.email), settings, summary, now);
  return { ...outcome, skipped: outcome.skipped + skipped };
}

/** 운영일(KST 날짜 키) 목록에 해당하는 '신청완료' 건 */
async function recipientsForDates(db: SupabaseClient, dateKeys: string[]): Promise<Recipient[]> {
  if (dateKeys.length === 0) return [];
  const sorted = [...dateKeys].sort();
  const rows = await queryApps(db, {
    statuses: ["신청완료"],
    startFrom: new Date(`${sorted[0]}T00:00:00+09:00`).toISOString(),
    startTo: new Date(`${addDaysToDateKey(sorted[sorted.length - 1], 1)}T00:00:00+09:00`).toISOString(),
  });
  const wanted = new Set(dateKeys);
  return rows.map(toRecipient).filter((r) => wanted.has(kstDateKey(r.session.startAt)));
}

async function sendAdminAlert(db: SupabaseClient, settings: EmailSettings, key: string, subject: string, body: string) {
  const to = settings.admin_alert_email || process.env.GMAIL_USER;
  if (!to) return;
  const { data } = await db.from(TABLES.EMAIL_LOGS).select("id").eq("batch_key", key).eq("status", "성공").limit(1);
  if (data && data.length) return; // 같은 알림은 하루 1회
  let status: "성공" | "실패" = "성공";
  let errorMessage: string | null = null;
  try {
    await sendMailWithRetry({ to, subject, text: body, html: `<p>${body.replace(/\n/g, "<br>")}</p>` });
  } catch (err) {
    status = "실패";
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  await db.from(TABLES.EMAIL_LOGS).insert({
    application_id: null,
    batch_key: key,
    type: "ALERT",
    to_email: to,
    subject,
    status,
    error_message: errorMessage,
    sent_at: status === "성공" ? new Date().toISOString() : null,
  });
}

async function runSessionNotice(
  db: SupabaseClient,
  type: "M3" | "M5" | "M4",
  dateKeys: string[],
  now: Date
): Promise<SendOutcome> {
  const { settings, reason } = await guard(db, type);
  if (reason) return { ...emptyOutcome(), messages: [`${type}: ${reason}`] };

  const recipients = await recipientsForDates(db, dateKeys);
  const { pending, summary, skipped } = await filterPending(db, type, recipients);

  let sendable = pending;
  let held = 0;
  const messages: string[] = [];
  if (type === "M5") {
    // Zoom 링크 미입력 온라인 세션은 발송 보류 + 관리자 알림(PRD §9.2, §9.4)
    const missing = pending.filter((r) => r.session.isOnline && !r.session.zoomLink);
    if (missing.length) {
      held = missing.length;
      sendable = pending.filter((r) => !(r.session.isOnline && !r.session.zoomLink));
      const rounds = Array.from(new Set(missing.map((r) => r.session.roundLabel))).join(", ");
      messages.push(`M5: Zoom 링크 미입력으로 ${rounds} ${held}건 발송 보류`);
      await sendAdminAlert(
        db,
        settings,
        `ALERT-M5-ZOOM-${kstDateKey(now)}`,
        `[AI-X 워크숍] Zoom 링크 미입력 — ${rounds} D-1 안내 발송 보류`,
        `${rounds} 세션의 Zoom 링크가 입력되지 않아 D-1 준비 안내(M5) ${held}건의 발송을 보류했습니다.\n관리자 포털 [세션 관리]에서 Zoom 링크를 입력한 뒤 [메일 발송 관리] 또는 신청자 관리에서 M5를 수동 발송해 주세요.`
      );
    }
  }

  const outcome = await deliverGroups(
    db,
    type,
    groupBy(sendable, (r) => `${r.email}|${r.session.dayCode}`),
    settings,
    summary,
    now
  );
  return { ...outcome, skipped: outcome.skipped + skipped, held: outcome.held + held, messages: [...messages, ...outcome.messages] };
}

/**
 * 09:00 KST Cron — M3(운영 안내, D-N) + M5(준비 안내, D-1).
 * M3는 D-N ~ D-2 구간의 미발송 건을 대상으로 해, 전날 실패·D-3 이후 신청 건도 다음 주기에 안내된다.
 */
export async function runDaily(db: SupabaseClient, now = new Date()): Promise<SendOutcome> {
  const settings = await loadSettings(db);
  const today = kstDateKey(now);
  const m3Dates: string[] = [];
  for (let d = 2; d <= Math.max(2, settings.m3_days_before); d++) m3Dates.push(addDaysToDateKey(today, d));
  const m3 = await runSessionNotice(db, "M3", m3Dates, now);
  const m5 = await runSessionNotice(db, "M5", [addDaysToDateKey(today, 1)], now);
  return mergeOutcome(m3, m5);
}

/** 08:00 KST(23:00 UTC 전날) Cron — M4 운영 당일 최종 안내 */
export async function runM4(db: SupabaseClient, now = new Date()): Promise<SendOutcome> {
  return runSessionNotice(db, "M4", [kstDateKey(now)], now);
}

/** M2 상태 변경 안내 — 관리자 상태변경 직후 즉시 발송, 동일 신청자는 1통으로 통합 */
export async function sendStatusChangeNotices(
  db: SupabaseClient,
  changes: { applicationId: string; from: string; to: string }[]
): Promise<SendOutcome> {
  if (changes.length === 0) return emptyOutcome();
  const { reason } = await guard(db, "M2");
  if (reason) return { ...emptyOutcome(), skipped: changes.length, messages: [reason] };

  const rows = await queryApps(db, { ids: changes.map((c) => c.applicationId) });
  const byId = new Map(rows.map((r) => [r.id, toRecipient(r)]));
  const outcome = emptyOutcome();

  const groups = new Map<string, { recipient: Recipient; change: StatusChange }[]>();
  for (const c of changes) {
    const recipient = byId.get(c.applicationId);
    if (!recipient) {
      outcome.skipped += 1; // 이메일 미입력(관리자 대리등록) 등
      continue;
    }
    const entry = { recipient, change: { session: recipient.session, from: c.from, to: c.to } };
    groups.set(recipient.email, [...(groups.get(recipient.email) ?? []), entry]);
  }

  for (const entries of groups.values()) {
    const ok = await deliver(db, {
      type: "M2",
      templateType: "M2",
      to: entries[0].recipient.email,
      name: entries[0].recipient.name,
      sessions: entries.map((e) => e.recipient.session),
      changes: entries.map((e) => e.change),
      appIds: entries.map((e) => e.recipient.appId),
    });
    if (ok) outcome.sent += 1;
    else outcome.failed += 1;
  }
  return outcome;
}

/** 관리자 수동 (재)발송 — 멱등·실패 누적 제한을 무시하고 선택 건을 유형별 규칙으로 묶어 보낸다. */
export async function sendManual(
  db: SupabaseClient,
  type: Exclude<EmailType, "M2">,
  applicationIds: string[]
): Promise<SendOutcome> {
  const settings = await loadSettings(db);
  const rows = await queryApps(db, { ids: applicationIds });
  const recipients = rows.map(toRecipient);
  const skipped = applicationIds.length - recipients.length;
  const groups =
    type === "M1"
      ? groupBy(recipients, (r) => r.email)
      : groupBy(recipients, (r) => `${r.email}|${r.session.dayCode}`);
  const outcome = await deliverGroups(db, type, groups, settings, null, new Date());
  return { ...outcome, skipped: outcome.skipped + skipped };
}

/** 테스트 발송 — 샘플 데이터로 렌더링해 관리자 본인 주소로 보낸다(로그 type=TEST). */
export async function sendTest(db: SupabaseClient, type: EmailType, to: string): Promise<boolean> {
  const sessions = sampleSessions(type);
  return deliver(db, {
    type: "TEST",
    templateType: type,
    to,
    name: SAMPLE_RECIPIENT.name,
    sessions,
    changes:
      type === "M2"
        ? sessions.map((s) => ({ session: s, from: "대기", to: "신청완료" }))
        : undefined,
    appIds: [],
  });
}
