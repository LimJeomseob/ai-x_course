"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { adminFetch } from "@/lib/adminApi";
import { TABLES } from "@/lib/db-tables";
import { EMAIL_TYPE_LABELS, EMAIL_TYPES_ORDERED } from "@/lib/constants";
import { exportRowsAsCsv } from "@/lib/csv";
import { formatDateTime, kstDateKey } from "@/lib/format";
import { buildVars, SAMPLE_RECIPIENT, sampleSessions } from "@/lib/email/content";
import { DEFAULT_TEMPLATES, renderEmail, resolveTemplate } from "@/lib/email/templates";
import type { EmailLog, EmailSettings, EmailTemplateRow, EmailType } from "@/lib/types";

const SCHEDULE_NOTES: Record<EmailType, string> = {
  M1: "매일 18:00 KST — 당일 신청 건 통합 발송(이메일 기준 1통)",
  M2: "관리자 상태 변경 즉시 발송",
  M3: "매일 09:00 KST — 운영 D-3(미발송 시 D-2까지) 운영일 단위 통합",
  M5: "매일 09:00 KST — 운영 D-1, 3차 Zoom 링크 미입력 시 보류·관리자 알림",
  M4: "매일 08:00 KST — 운영 당일 최종 안내",
};

/** 메일 발송 관리(PRD §9.4) — 발송 이력·템플릿 편집·설정·테스트 발송 */
export function EmailManager() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [tab, setTab] = useState<"logs" | "templates" | "settings">("logs");
  const [flash, setFlash] = useState<{ type: "success" | "error"; text: string } | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">메일 발송 관리</h1>
        <p className="mt-1 text-sm text-slate-500">발송 계정: Gmail(eros4424@gmail.com) · 명의 임점섭(경상국립대학교 AI융합원) · 회신 240907@gnu.ac.kr</p>
      </div>
      <div role="tablist" aria-label="메일 관리 메뉴" className="flex gap-2 border-b border-slate-200">
        {([
          ["logs", "발송 이력"],
          ["templates", "템플릿"],
          ["settings", "설정"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={clsx("border-b-[3px] px-4 py-2 text-sm font-semibold", tab === key ? "border-accent text-brand" : "border-transparent text-slate-500")}
          >
            {label}
          </button>
        ))}
      </div>
      {flash && (
        <p role={flash.type === "error" ? "alert" : "status"} className={clsx("rounded-lg p-3 text-sm font-medium", flash.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800")}>
          {flash.text}
        </p>
      )}
      {tab === "logs" && <LogsPanel supabase={supabase} />}
      {tab === "templates" && <TemplatesPanel supabase={supabase} onFlash={setFlash} />}
      {tab === "settings" && <SettingsPanel supabase={supabase} onFlash={setFlash} />}
    </div>
  );
}

type Supabase = ReturnType<typeof createSupabaseBrowserClient>;
type Flash = (f: { type: "success" | "error"; text: string } | null) => void;

function LogsPanel({ supabase }: { supabase: Supabase }) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    supabase
      .from(TABLES.EMAIL_LOGS)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000)
      .returns<EmailLog[]>()
      .then(({ data }) => {
        setLogs(data ?? []);
        setLoading(false);
      });
  }, [supabase]);

  // 통합 발송은 신청 건마다 로그 행이 있으므로 화면에는 batch_key 단위(=메일 1통)로 묶는다.
  const mails = useMemo(() => {
    const map = new Map<string, EmailLog & { count: number }>();
    for (const log of logs) {
      const cur = map.get(log.batch_key);
      if (cur) cur.count += 1;
      else map.set(log.batch_key, { ...log, count: 1 });
    }
    const q = query.trim().toLowerCase();
    return Array.from(map.values()).filter(
      (m) => (!type || m.type === type) && (!status || m.status === status) && (!q || `${m.to_email} ${m.subject}`.toLowerCase().includes(q))
    );
  }, [logs, type, status, query]);

  const today = kstDateKey(new Date());
  const sentToday = new Set(logs.filter((l) => l.status === "성공" && kstDateKey(l.created_at) === today).map((l) => l.batch_key)).size;

  function exportCsv() {
    exportRowsAsCsv(
      mails,
      [
        { header: "일시", accessor: (m) => formatDateTime(m.created_at) },
        { header: "유형", accessor: (m) => `${m.type} ${EMAIL_TYPE_LABELS[m.type] ?? ""}` },
        { header: "수신", accessor: (m) => m.to_email },
        { header: "제목", accessor: (m) => m.subject },
        { header: "신청 건수", accessor: (m) => m.count },
        { header: "결과", accessor: (m) => m.status },
        { header: "재시도", accessor: (m) => m.retry_count },
        { header: "오류", accessor: (m) => m.error_message ?? "" },
      ],
      `메일발송이력_${today}.csv`
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <p className="mr-auto text-sm text-slate-600">오늘 성공 발송 {sentToday}통 · 표시 {mails.length}통</p>
        <select aria-label="유형" value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">전체 유형</option>
          {[...EMAIL_TYPES_ORDERED, "TEST", "ALERT"].map((t) => <option key={t} value={t}>{t} {EMAIL_TYPE_LABELS[t]}</option>)}
        </select>
        <select aria-label="결과" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">전체 결과</option>
          <option>성공</option>
          <option>실패</option>
        </select>
        <input type="search" aria-label="검색" placeholder="수신 주소/제목" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <Button size="sm" variant="outline" onClick={exportCsv}>CSV</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="min-w-[1000px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-600">
            <tr><th className="px-3 py-2">일시</th><th className="px-3 py-2">유형</th><th className="px-3 py-2">수신</th><th className="px-3 py-2">제목</th><th className="px-3 py-2">건수</th><th className="px-3 py-2">결과</th><th className="px-3 py-2">오류</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">불러오는 중...</td></tr>}
            {!loading && mails.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">발송 이력이 없습니다.</td></tr>}
            {mails.map((m) => (
              <tr key={m.batch_key} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDateTime(m.created_at)}</td>
                <td className="whitespace-nowrap px-3 py-2">{m.type} <span className="text-xs text-slate-500">{EMAIL_TYPE_LABELS[m.type]}</span></td>
                <td className="px-3 py-2">{m.to_email}</td>
                <td className="px-3 py-2">{m.subject}</td>
                <td className="px-3 py-2 text-center">{m.count}</td>
                <td className="px-3 py-2"><span className={clsx("rounded px-1.5 py-0.5 text-xs font-bold", m.status === "성공" ? "bg-emerald-100 text-emerald-800" : m.status === "실패" ? "bg-red-100 text-red-700" : "bg-slate-100")}>{m.status}</span></td>
                <td className="max-w-xs px-3 py-2 text-xs text-red-700">{m.error_message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">발송 실패 건은 신청자 관리에서 ‘메일: 발송 실패 있음’ 필터로 찾아 [수동 발송]으로 재발송할 수 있습니다.</p>
    </section>
  );
}

function TemplatesPanel({ supabase, onFlash }: { supabase: Supabase; onFlash: Flash }) {
  const [rows, setRows] = useState<EmailTemplateRow[]>([]);
  const [type, setType] = useState<EmailType>("M1");
  const [draft, setDraft] = useState({ subject: "", body_html: "", body_text: "", enabled: true });
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"html" | "text">("html");

  const load = useCallback(async () => {
    const { data } = await supabase.from(TABLES.EMAIL_TEMPLATES).select("*").returns<EmailTemplateRow[]>();
    setRows(data ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const row = rows.find((r) => r.type === type);

  useEffect(() => {
    const resolved = resolveTemplate(type, row);
    setDraft({ subject: resolved.subject, body_html: resolved.html, body_text: resolved.text, enabled: row?.enabled ?? true });
  }, [type, row]);

  const preview = useMemo(() => {
    const sessions = sampleSessions(type);
    const vars = buildVars(type, SAMPLE_RECIPIENT, sessions, type === "M2" ? sessions.map((s) => ({ session: s, from: "대기", to: "신청완료" })) : undefined);
    return renderEmail({ subject: draft.subject, html: draft.body_html, text: draft.body_text }, vars, typeof window === "undefined" ? "" : window.location.origin);
  }, [type, draft]);

  async function save(reset = false) {
    setSaving(true);
    const base = DEFAULT_TEMPLATES[type];
    // 기본 템플릿과 같으면 NULL로 저장해 코드 기본값 갱신을 계속 따라가게 한다.
    const payload = reset
      ? { subject: null, body_html: null, body_text: null, enabled: draft.enabled }
      : {
          subject: draft.subject === base.subject ? null : draft.subject,
          body_html: draft.body_html === base.html ? null : draft.body_html,
          body_text: draft.body_text === base.text ? null : draft.body_text,
          enabled: draft.enabled,
        };
    const { error } = await supabase.from(TABLES.EMAIL_TEMPLATES).upsert({ type, ...payload }, { onConflict: "type" });
    setSaving(false);
    if (error) onFlash({ type: "error", text: error.message });
    else {
      onFlash({ type: "success", text: `${type} 템플릿 ${reset ? "기본값 복원" : "저장"} 완료` });
      load();
    }
  }

  async function testSend() {
    try {
      const res = await adminFetch<{ to: string }>("/api/admin/emails/test", { body: { type } });
      onFlash({ type: "success", text: `${type} 테스트 메일을 ${res.to}로 발송했습니다. (저장된 템플릿 기준)` });
    } catch (e) {
      onFlash({ type: "error", text: e instanceof Error ? e.message : "테스트 발송 실패" });
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {EMAIL_TYPES_ORDERED.map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={clsx("rounded-lg px-3 py-1.5 text-sm font-bold", t === type ? "bg-brand text-white" : "bg-white text-brand ring-1 ring-brand/30")}>
              {t} {EMAIL_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{SCHEDULE_NOTES[type]}</p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} />
          이 유형 자동 발송 사용
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          제목
          <input className={inputBaseClass} value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          HTML 본문
          <textarea rows={12} className={clsx(inputBaseClass, "font-mono text-xs")} value={draft.body_html} onChange={(e) => setDraft((d) => ({ ...d, body_html: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          텍스트 본문
          <textarea rows={8} className={clsx(inputBaseClass, "font-mono text-xs")} value={draft.body_text} onChange={(e) => setDraft((d) => ({ ...d, body_text: e.target.value }))} />
        </label>
        <p className="text-xs text-slate-500">
          사용 가능 변수: {(row?.variables ?? []).map((v) => `{${v}}`).join(" ")} — 머리말·꼬리말(포털 링크·서명)은 자동 추가됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={saving} onClick={() => save(false)}>저장</Button>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => save(true)}>기본값으로 되돌리기</Button>
          <Button size="sm" variant="outline" onClick={testSend}>테스트 발송(관리자 본인)</Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">미리보기(샘플 신청 건)</p>
          <div className="flex gap-1 text-xs">
            <button type="button" onClick={() => setView("html")} className={clsx("rounded px-2 py-1", view === "html" ? "bg-brand text-white" : "bg-slate-100")}>HTML</button>
            <button type="button" onClick={() => setView("text")} className={clsx("rounded px-2 py-1", view === "text" ? "bg-brand text-white" : "bg-slate-100")}>텍스트</button>
          </div>
        </div>
        <p className="rounded bg-slate-100 px-3 py-2 text-sm"><strong>제목:</strong> {preview.subject}</p>
        {view === "html" ? (
          <iframe title="메일 미리보기" sandbox="" srcDoc={preview.html} className="h-[640px] w-full rounded-xl border border-slate-200 bg-white" />
        ) : (
          <pre className="h-[640px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-xs">{preview.text}</pre>
        )}
      </div>
    </section>
  );
}

function SettingsPanel({ supabase, onFlash }: { supabase: Supabase; onFlash: Flash }) {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from(TABLES.EMAIL_SETTINGS)
      .select("*")
      .eq("id", 1)
      .maybeSingle<EmailSettings>()
      .then(({ data }) => setSettings(data));
  }, [supabase]);

  if (!settings) return <p className="text-sm text-slate-500">불러오는 중...</p>;

  async function save() {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from(TABLES.EMAIL_SETTINGS)
      .update({
        enabled: settings.enabled,
        m3_days_before: settings.m3_days_before,
        send_on_self_cancel: settings.send_on_self_cancel,
        daily_limit: settings.daily_limit,
        admin_alert_email: settings.admin_alert_email,
      })
      .eq("id", 1);
    setSaving(false);
    onFlash(error ? { type: "error", text: error.message } : { type: "success", text: "설정을 저장했습니다." });
  }

  const set = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => setSettings((s) => (s ? { ...s, [key]: value } : s));

  return (
    <section className="flex max-w-xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={settings.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        자동 메일 발송 전체 사용(OFF 시 Cron·상태변경 메일 모두 중지)
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={settings.send_on_self_cancel} onChange={(e) => set("send_on_self_cancel", e.target.checked)} />
        본인 취소(공개 포털) 시에도 M2 상태 변경 메일 발송
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        M3 운영 안내 발송 기준(D-N)
        <input type="number" min={2} max={14} className={inputBaseClass} value={settings.m3_days_before} onChange={(e) => set("m3_days_before", Number(e.target.value))} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        일 발송 한도(통)
        <input type="number" min={1} max={2000} className={inputBaseClass} value={settings.daily_limit} onChange={(e) => set("daily_limit", Number(e.target.value))} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        관리자 알림 수신 주소(Zoom 링크 미입력 등)
        <input type="email" className={inputBaseClass} value={settings.admin_alert_email} onChange={(e) => set("admin_alert_email", e.target.value)} />
      </label>
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        발송 시각은 vercel.json Cron이 결정합니다 — M1 {settings.m1_send_time} · M3/M5 {settings.m5_send_time} · M4 {settings.m4_send_time} (KST).
      </div>
      <Button className="self-start" disabled={saving} onClick={save}>{saving ? "저장 중..." : "설정 저장"}</Button>
    </section>
  );
}
