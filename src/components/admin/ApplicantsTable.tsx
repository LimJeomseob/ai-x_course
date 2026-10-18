"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AddParticipantModal } from "@/components/admin/AddParticipantModal";
import { AttendanceUploadModal } from "@/components/admin/AttendanceUploadModal";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { adminFetch } from "@/lib/adminApi";
import { CERTIFICATES_BUCKET, TABLES, WORKSHOP_SUMMARY_SELECT } from "@/lib/db-tables";
import { AXIS_OPTIONS, axisLabel, EMAIL_TYPE_LABELS, EMAIL_TYPES_ORDERED, NOTICE_COLUMNS, type NoticeField } from "@/lib/constants";
import { exportRowsAsCsv, type CsvColumn } from "@/lib/csv";
import { formatDateTime, formatPhone, formatTimeRange, kstDateKey } from "@/lib/format";
import { issueCertificatesForApplications } from "@/lib/issueCertificate";
import { fetchProgramData, type DayWithSessions, type SessionOption } from "@/lib/workshops";
import { APPLICATION_STATUSES, type ApplicationStatus, type ApplicationWithWorkshop } from "@/lib/types";

interface CertInfo {
  application_id: string;
  cert_no: string;
  pdf_path: string | null;
  reissue_count: number;
}

interface MailState {
  success: boolean;
  failures: number;
}

type MailMap = Map<string, Partial<Record<string, MailState>>>;

const MAX_FAILURES = 3;

interface StatusApiResult {
  updated: number;
  unchanged: number;
  failures: { id: string; error: string }[];
  mail: { sent: number; failed: number; skipped: number; messages: string[] } | null;
}

interface SendOutcome {
  sent: number;
  failed: number;
  skipped: number;
  held: number;
  messages: string[];
}

function mailSummary(mail: MailMap, appId: string) {
  const entry = mail.get(appId) ?? {};
  const failed = Object.values(entry).some((s) => s && !s.success && s.failures >= MAX_FAILURES);
  const anyFailure = Object.values(entry).some((s) => s && !s.success && s.failures > 0);
  return { entry, failed, anyFailure };
}

/** 관리자 신청자 관리(PRD §6.2) — 세션 신청 1행 단위 */
export function ApplicantsTable() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [days, setDays] = useState<DayWithSessions[]>([]);
  const [rows, setRows] = useState<ApplicationWithWorkshop[]>([]);
  const [certs, setCerts] = useState<Map<string, CertInfo>>(new Map());
  const [mail, setMail] = useState<MailMap>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [dayFilter, setDayFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [axisFilter, setAxisFilter] = useState("");
  const [certFilter, setCertFilter] = useState("");
  const [noticeFilter, setNoticeFilter] = useState("");
  const [mailFilter, setMailFilter] = useState("");
  const [query, setQuery] = useState("");

  const [bulkStatus, setBulkStatus] = useState<ApplicationStatus>("신청완료");
  const [bulkNotice, setBulkNotice] = useState<NoticeField>("notice1_confirmed");
  const [bulkNoticeValue, setBulkNoticeValue] = useState(true);
  const [bulkMailType, setBulkMailType] = useState<"M1" | "M3" | "M5" | "M4">("M1");
  const [addOpen, setAddOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const closeAdd = useCallback(() => setAddOpen(false), []);
  const closeAttendance = useCallback(() => setAttendanceOpen(false), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [program, appsRes, certRes, logRes] = await Promise.all([
        fetchProgramData(),
        supabase
          .from(TABLES.APPLICATIONS)
          .select(`*, ${WORKSHOP_SUMMARY_SELECT}`)
          .order("created_at", { ascending: false })
          .returns<ApplicationWithWorkshop[]>(),
        supabase.from(TABLES.CERTIFICATES).select("application_id, cert_no, pdf_path, reissue_count").returns<CertInfo[]>(),
        supabase
          .from(TABLES.EMAIL_LOGS)
          .select("application_id, type, status")
          .not("application_id", "is", null)
          .returns<{ application_id: string; type: string; status: string }[]>(),
      ]);
      if (appsRes.error) throw new Error(appsRes.error.message);
      setDays(program.days);
      setRows(appsRes.data ?? []);
      setCerts(new Map((certRes.data ?? []).map((c) => [c.application_id, c])));
      const map: MailMap = new Map();
      for (const log of logRes.data ?? []) {
        const entry = map.get(log.application_id) ?? {};
        const cur = entry[log.type] ?? { success: false, failures: 0 };
        if (log.status === "성공") cur.success = true;
        if (log.status === "실패") cur.failures += 1;
        entry[log.type] = cur;
        map.set(log.application_id, entry);
      }
      setMail(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const sessions = useMemo<SessionOption[]>(() => days.flatMap((d) => d.sessions.map((s) => ({ ...s, day: d }))), [days]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/[^0-9]/g, "");
    return rows.filter((r) => {
      if (dayFilter && r.workshop?.day?.day_code !== dayFilter) return false;
      if (sessionFilter && r.workshop_id !== sessionFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (axisFilter && r.axis_participant !== axisFilter) return false;
      if (certFilter === "issued" && !r.cert_issued) return false;
      if (certFilter === "not_issued" && r.cert_issued) return false;
      if (noticeFilter) {
        const [field, value] = noticeFilter.split(":");
        if (String(r[field as NoticeField]) !== value) return false;
      }
      if (mailFilter === "failed" && !mailSummary(mail, r.id).anyFailure) return false;
      if (q) {
        const hay = `${r.name} ${r.email} ${r.phone}`.toLowerCase();
        if (!hay.includes(q) && !(qDigits && r.phone_digits.includes(qDigits))) return false;
      }
      return true;
    });
  }, [rows, dayFilter, sessionFilter, statusFilter, axisFilter, certFilter, noticeFilter, mailFilter, query, mail]);

  const selectedRows = useMemo(() => filtered.filter((r) => selected.has(r.id)), [filtered, selected]);
  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setFlash(null);
    try {
      const text = await action();
      setFlash({ type: "success", text });
      await load();
    } catch (e) {
      setFlash({ type: "error", text: e instanceof Error ? e.message : "처리 중 오류가 발생했습니다." });
    } finally {
      setBusy(false);
    }
  }

  function describeStatusResult(res: StatusApiResult): string {
    const parts = [`${res.updated}건 변경`];
    if (res.unchanged) parts.push(`${res.unchanged}건 동일 상태`);
    if (res.failures.length) parts.push(`${res.failures.length}건 실패(${res.failures[0].error})`);
    if (res.mail) parts.push(`M2 메일 ${res.mail.sent}통 발송${res.mail.failed ? `·${res.mail.failed}통 실패` : ""}${res.mail.messages[0] ? ` — ${res.mail.messages[0]}` : ""}`);
    return parts.join(" · ");
  }

  const changeStatus = (ids: string[], status: ApplicationStatus) =>
    run(async () => {
      const res = await adminFetch<StatusApiResult>("/api/admin/applications/status", { body: { ids, status } });
      return describeStatusResult(res);
    });

  const issueCerts = (targets: ApplicationWithWorkshop[]) =>
    run(async () => {
      const eligible = targets.filter((r) => r.status === "이수");
      if (eligible.length === 0) throw new Error("이수 상태인 신청 건만 수료증을 발급할 수 있습니다.");
      const results = await issueCertificatesForApplications(supabase, eligible);
      const ok = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);
      if (targets.length === 1 && ok[0]?.downloadUrl) window.open(ok[0].downloadUrl, "_blank", "noopener");
      return `수료증 ${ok.length}건 발급${failed.length ? ` · ${failed.length}건 실패(${failed[0].error})` : ""}${
        targets.length !== eligible.length ? ` · 이수 아닌 ${targets.length - eligible.length}건 제외` : ""
      }`;
    });

  const setNotice = (ids: string[], field: NoticeField, value: boolean) =>
    run(async () => {
      const { error: updateError } = await supabase.from(TABLES.APPLICATIONS).update({ [field]: value }).in("id", ids);
      if (updateError) throw new Error(updateError.message);
      return `안내확인 ${ids.length}건 변경`;
    });

  const deleteRows = (ids: string[]) => {
    if (!window.confirm(`선택한 ${ids.length}건을 삭제합니다. 발급된 수료증 기록도 함께 삭제됩니다. 계속하시겠습니까?`)) return;
    run(async () => {
      const { error: deleteError } = await supabase.from(TABLES.APPLICATIONS).delete().in("id", ids);
      if (deleteError) throw new Error(deleteError.message);
      setSelected(new Set());
      return `${ids.length}건 삭제`;
    });
  };

  const sendMail = (ids: string[], type: "M1" | "M3" | "M5" | "M4") => {
    if (!window.confirm(`선택한 ${ids.length}건에 ${type}(${EMAIL_TYPE_LABELS[type]})을 발송합니다. 이미 발송된 건도 다시 발송됩니다.`)) return;
    run(async () => {
      const res = await adminFetch<SendOutcome>("/api/admin/emails/send", { body: { type, applicationIds: ids } });
      return `${type} ${res.sent}통 발송${res.failed ? ` · ${res.failed}통 실패` : ""}${res.skipped ? ` · ${res.skipped}건 제외(이메일 없음 등)` : ""}`;
    });
  };

  async function openPdf(appId: string) {
    const cert = certs.get(appId);
    if (!cert?.pdf_path) return;
    const { data } = await supabase.storage.from(CERTIFICATES_BUCKET).createSignedUrl(cert.pdf_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  function exportCsv() {
    const target = selectedRows.length ? selectedRows : filtered;
    const columns: CsvColumn<ApplicationWithWorkshop>[] = [
      { header: "운영일", accessor: (r) => r.workshop?.day?.day_label },
      { header: "세션", accessor: (r) => `${r.workshop?.round_label} ${r.workshop?.topic}` },
      { header: "세션 시간", accessor: (r) => (r.workshop ? formatTimeRange(r.workshop.start_at, r.workshop.end_at) : "") },
      { header: "신청일", accessor: (r) => formatDateTime(r.created_at) },
      { header: "성명", accessor: (r) => r.name },
      { header: "소속", accessor: (r) => r.affiliation },
      { header: "교번/식별번호", accessor: (r) => r.id_number },
      { header: "AXIS 참여여부", accessor: (r) => axisLabel(r.axis_participant, false) },
      { header: "연락처", accessor: (r) => formatPhone(r.phone) },
      { header: "이메일", accessor: (r) => r.email },
      { header: "상태", accessor: (r) => r.status },
      { header: "수료증 번호", accessor: (r) => certs.get(r.id)?.cert_no ?? "" },
      ...NOTICE_COLUMNS.map((n) => ({ header: `안내확인 ${n.label}`, accessor: (r: ApplicationWithWorkshop) => (r[n.field] ? "Y" : "N") })),
      { header: "관리자 등록", accessor: (r) => (r.created_by_admin ? "Y" : "") },
    ];
    exportRowsAsCsv(target, columns, `신청자목록_${kstDateKey(new Date())}.csv`);
  }

  const ids = selectedRows.map((r) => r.id);
  const counts = useMemo(() => {
    const active = rows.filter((r) => r.status === "신청완료" || r.status === "이수");
    return { total: rows.length, active: active.length, completed: rows.filter((r) => r.status === "이수").length };
  }, [rows]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">신청자 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            전체 {counts.total}건 · 유효(신청완료+이수) {counts.active}건 · 이수 {counts.completed}건 · 표시 {filtered.length}건
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAttendanceOpen(true)}>
            출석부 업로드(이수처리)
          </Button>
          <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
            참여자 추가
          </Button>
        </div>
      </div>

      <section aria-label="필터" className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:grid-cols-4 lg:grid-cols-8">
        <FilterSelect label="운영일" value={dayFilter} onChange={(v) => { setDayFilter(v); setSessionFilter(""); }}
          options={days.map((d) => ({ value: d.day_code, label: `${d.day_label}` }))} />
        <FilterSelect label="세션" value={sessionFilter} onChange={setSessionFilter}
          options={sessions.filter((s) => !dayFilter || s.day.day_code === dayFilter).map((s) => ({ value: s.id, label: `${s.round_label} ${s.topic}` }))} />
        <FilterSelect label="상태" value={statusFilter} onChange={setStatusFilter} options={APPLICATION_STATUSES.map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="AXIS" value={axisFilter} onChange={setAxisFilter} options={AXIS_OPTIONS.map((o) => ({ value: o.value, label: o.short }))} />
        <FilterSelect label="수료증" value={certFilter} onChange={setCertFilter} options={[{ value: "issued", label: "발급" }, { value: "not_issued", label: "미발급" }]} />
        <FilterSelect label="안내확인" value={noticeFilter} onChange={setNoticeFilter}
          options={NOTICE_COLUMNS.flatMap((n) => [{ value: `${n.field}:false`, label: `${n.label} 미확인` }, { value: `${n.field}:true`, label: `${n.label} 확인` }])} />
        <FilterSelect label="메일" value={mailFilter} onChange={setMailFilter} options={[{ value: "failed", label: "발송 실패 있음" }]} />
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          검색
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="성명/이메일/연락처"
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal"
          />
        </label>
      </section>

      <section aria-label="일괄 작업" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-card">
        <span className="font-semibold text-slate-700">선택 {ids.length}건</span>
        <select aria-label="일괄 변경 상태" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as ApplicationStatus)} className="rounded border border-slate-300 px-2 py-1">
          {APPLICATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={!ids.length || busy} onClick={() => changeStatus(ids, bulkStatus)}>상태변경</Button>
        <Button size="sm" variant="outline" disabled={!ids.length || busy} onClick={() => changeStatus(ids, "이수")}>이수처리</Button>
        <Button size="sm" variant="outline" disabled={!ids.length || busy} onClick={() => issueCerts(selectedRows)}>수료증 일괄발급</Button>
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <select aria-label="안내확인 단계" value={bulkNotice} onChange={(e) => setBulkNotice(e.target.value as NoticeField)} className="rounded border border-slate-300 px-2 py-1">
          {NOTICE_COLUMNS.map((n) => <option key={n.field} value={n.field}>{n.label}</option>)}
        </select>
        <select aria-label="안내확인 값" value={String(bulkNoticeValue)} onChange={(e) => setBulkNoticeValue(e.target.value === "true")} className="rounded border border-slate-300 px-2 py-1">
          <option value="true">확인</option>
          <option value="false">미확인</option>
        </select>
        <Button size="sm" variant="outline" disabled={!ids.length || busy} onClick={() => setNotice(ids, bulkNotice, bulkNoticeValue)}>안내확인 변경</Button>
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <select aria-label="수동 발송 유형" value={bulkMailType} onChange={(e) => setBulkMailType(e.target.value as typeof bulkMailType)} className="rounded border border-slate-300 px-2 py-1">
          {(["M1", "M3", "M5", "M4"] as const).map((t) => <option key={t} value={t}>{t} {EMAIL_TYPE_LABELS[t]}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={!ids.length || busy} onClick={() => sendMail(ids, bulkMailType)}>수동 발송</Button>
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        <Button size="sm" variant="outline" disabled={busy} onClick={exportCsv}>{ids.length ? "선택 항목 CSV" : "표시 항목 CSV"}</Button>
        <Button size="sm" variant="danger" disabled={!ids.length || busy} onClick={() => deleteRows(ids)}>삭제</Button>
      </section>

      {flash && (
        <p role={flash.type === "error" ? "alert" : "status"} className={clsx("rounded-lg p-3 text-sm font-medium", flash.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800")}>
          {flash.text}
        </p>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <p className="text-xs text-slate-500">
        <span className="mr-1 inline-block h-3 w-3 border-l-4 border-amber-400 align-middle" aria-hidden="true" />
        관리자 대리등록 건 · 메일: M1 신청결과 / M2 상태변경 / M3 D-3 / M5 D-1 / M4 당일 (초록=성공, 빨강=실패, 회색=미발송)
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="min-w-[1500px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-600">
            <tr>
              <th className="px-3 py-2"><input type="checkbox" aria-label="표시된 항목 전체 선택" checked={allChecked} onChange={toggleAll} /></th>
              <th className="px-3 py-2">운영일</th>
              <th className="px-3 py-2">세션</th>
              <th className="px-3 py-2">신청일</th>
              <th className="px-3 py-2">성명</th>
              <th className="px-3 py-2">소속</th>
              <th className="px-3 py-2">교번/식별번호</th>
              <th className="px-3 py-2">AXIS</th>
              <th className="px-3 py-2">연락처</th>
              <th className="px-3 py-2">이메일</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">이수처리</th>
              <th className="px-3 py-2">수료증</th>
              {NOTICE_COLUMNS.map((n) => <th key={n.field} className="px-2 py-2 text-center">{n.label}</th>)}
              <th className="px-3 py-2">메일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={17} className="px-3 py-6 text-center text-slate-500">불러오는 중...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={17} className="px-3 py-6 text-center text-slate-500">조건에 맞는 신청 건이 없습니다.</td></tr>}
            {!loading && filtered.map((r) => {
              const cert = certs.get(r.id);
              const summary = mailSummary(mail, r.id);
              return (
                <tr key={r.id} className={clsx("align-top", r.created_by_admin && "border-l-4 border-amber-400", selected.has(r.id) && "bg-accent/5")}>
                  <td className="px-3 py-2"><input type="checkbox" aria-label={`${r.name} ${r.workshop?.round_label} 선택`} checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} /></td>
                  <td className="whitespace-nowrap px-3 py-2" title={r.workshop?.day?.location}>{r.workshop?.day?.day_label}</td>
                  <td className="px-3 py-2" title={`${r.workshop ? formatTimeRange(r.workshop.start_at, r.workshop.end_at) : ""} · ${r.workshop?.day?.location ?? ""}`}>
                    <strong>{r.workshop?.round_label}</strong> {r.workshop?.topic}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{formatDateTime(r.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold">{r.name}</td>
                  <td className="px-3 py-2">{r.affiliation}</td>
                  <td className="px-3 py-2">{r.id_number}</td>
                  <td className="whitespace-nowrap px-3 py-2">{axisLabel(r.axis_participant)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatPhone(r.phone)}</td>
                  <td className="px-3 py-2">{r.email || <span className="text-slate-400">-</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={r.status} />
                      <select
                        aria-label={`${r.name} 상태 변경`}
                        value={r.status}
                        disabled={busy}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => changeStatus([r.id], e.target.value as ApplicationStatus)}
                        className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                      >
                        {APPLICATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.status === "이수" ? <span className="text-xs font-bold text-emerald-700">이수</span> : (
                      <Button size="sm" variant="outline" disabled={busy || r.status === "취소"} onClick={() => changeStatus([r.id], "이수")}>이수처리</Button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      {cert && <span className="whitespace-nowrap text-xs font-semibold">{cert.cert_no}{cert.reissue_count ? ` (재${cert.reissue_count})` : ""}</span>}
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" disabled={busy || r.status !== "이수"} onClick={() => issueCerts([r])}>{cert ? "재발급" : "발급"}</Button>
                        {cert?.pdf_path && <Button size="sm" variant="ghost" onClick={() => openPdf(r.id)}>PDF</Button>}
                      </div>
                    </div>
                  </td>
                  {NOTICE_COLUMNS.map((n) => (
                    <td key={n.field} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${r.name} ${n.label} 안내확인`}
                        checked={r[n.field]}
                        disabled={busy}
                        onChange={(e) => setNotice([r.id], n.field, e.target.checked)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {EMAIL_TYPES_ORDERED.map((t) => {
                        const s = summary.entry[t];
                        return (
                          <span
                            key={t}
                            title={`${t} ${EMAIL_TYPE_LABELS[t]}: ${s?.success ? "성공" : s?.failures ? `실패 ${s.failures}회` : "미발송"}`}
                            className={clsx(
                              "rounded px-1 text-[10px] font-bold",
                              s?.success ? "bg-emerald-100 text-emerald-800" : s?.failures ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-400"
                            )}
                          >
                            {t}
                          </span>
                        );
                      })}
                    </div>
                    {summary.failed && <span className="mt-1 inline-block rounded bg-red-600 px-1.5 text-[10px] font-bold text-white">발송 실패</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddParticipantModal open={addOpen} sessions={sessions} rows={rows} onClose={closeAdd} onSaved={(msg) => { setAddOpen(false); setFlash({ type: "success", text: msg }); load(); }} />
      <AttendanceUploadModal open={attendanceOpen} sessions={sessions} rows={rows} onClose={closeAttendance} onApply={(idsToComplete) => { setAttendanceOpen(false); changeStatus(idsToComplete, "이수"); }} />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal">
        <option value="">전체</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
