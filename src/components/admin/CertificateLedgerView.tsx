"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CERTIFICATES_BUCKET, TABLES } from "@/lib/db-tables";
import { exportRowsAsCsv, type CsvColumn } from "@/lib/csv";
import { kstDateKey } from "@/lib/format";
import type { CertificateLedgerRow } from "@/lib/types";

/** 발급대장 원문 형식 일시: "2026. 07. 31. 22:19" */
function ledgerDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}. ${get("month")}. ${get("day")}. ${get("hour")}:${get("minute")}`;
}

function reissueLabel(row: CertificateLedgerRow): string {
  if (!row.reissue_count) return "0회";
  return row.reissued_at ? `${row.reissue_count}회 (${ledgerDateTime(row.reissued_at)})` : `${row.reissue_count}회`;
}

function pdfLabel(row: CertificateLedgerRow): string {
  if (row.source_type === "legacy") return "미보관(레거시)";
  return row.pdf_stored ? "보관" : "미보관";
}

/** 수료증 발급대장(PRD §6.4) — 레거시(제2026-001~070호) + 신규 발급 단일 대장 */
export function CertificateLedgerView() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<CertificateLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");

  useEffect(() => {
    supabase
      .from(TABLES.CERTIFICATE_LEDGER)
      .select("*")
      .order("seq", { ascending: true })
      .returns<CertificateLedgerRow[]>()
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else setRows(data ?? []);
        setLoading(false);
      });
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return rows.filter(
      (r) =>
        (!source || r.source_type === source) &&
        (!q || `${r.cert_no} ${r.name} ${r.affiliation} ${r.course}`.includes(q))
    );
  }, [rows, query, source]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      legacy: rows.filter((r) => r.source_type === "legacy").length,
      reissued: rows.filter((r) => r.reissue_count > 0).length,
      notStored: rows.filter((r) => !r.pdf_stored).length,
    }),
    [rows]
  );

  async function openPdf(path: string) {
    const { data } = await supabase.storage.from(CERTIFICATES_BUCKET).createSignedUrl(path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  function exportCsv() {
    // 첨부 발급대장 CSV와 컬럼·순서 동일
    const columns: CsvColumn<CertificateLedgerRow>[] = [
      { header: "연번", accessor: (r) => r.seq },
      { header: "발급번호", accessor: (r) => r.cert_no },
      { header: "성명", accessor: (r) => r.name },
      { header: "소속", accessor: (r) => r.affiliation },
      { header: "교육과정", accessor: (r) => r.course },
      { header: "교육기간", accessor: (r) => r.period },
      { header: "발급일자", accessor: (r) => r.issued_at_label ?? "" },
      { header: "발급구분", accessor: (r) => r.issued_channel },
      { header: "재발급", accessor: (r) => reissueLabel(r) },
      { header: "발급자", accessor: (r) => r.issuer },
      { header: "수료증 PDF", accessor: (r) => pdfLabel(r) },
    ];
    exportRowsAsCsv(filtered, columns, `수료증발급대장_${kstDateKey(new Date())}.csv`);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">수료증 발급대장</h1>
          <p className="mt-1 text-sm text-slate-500">레거시 이관 {summary.legacy}건 + 신규 {summary.total - summary.legacy}건 · 발급번호 순</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select aria-label="구분" value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">전체</option>
            <option value="legacy">레거시 이관</option>
            <option value="new">신규 발급</option>
          </select>
          <input type="search" aria-label="검색" placeholder="발급번호/성명/소속/과정" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          <Button size="sm" variant="outline" onClick={exportCsv}>CSV 내보내기</Button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "총 발급", value: summary.total },
          { label: "재발급 이력", value: summary.reissued },
          { label: "PDF 미보관", value: summary.notStored },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-brand">{c.value}건</p>
          </div>
        ))}
      </section>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="min-w-[1300px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-600">
            <tr>
              {["연번", "발급번호", "성명", "소속", "교육과정", "교육기간", "발급일자", "발급구분", "재발급", "발급자", "수료증 PDF"].map((h) => (
                <th key={h} className="px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={11} className="px-3 py-6 text-center text-slate-500">불러오는 중...</td></tr>}
            {filtered.map((r) => (
              <tr key={r.cert_no} className={clsx("align-top", r.source_type === "legacy" && "bg-slate-50/60 text-slate-600")}>
                <td className="px-3 py-2">{r.seq}</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{r.cert_no}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.affiliation}</td>
                <td className="px-3 py-2">{r.course}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.period}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.issued_at_label ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.issued_channel}
                  {r.source_type === "legacy" && <span className="ml-1 rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-600">레거시 이관</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{reissueLabel(r)}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.issuer}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.pdf_path ? (
                    <button type="button" onClick={() => openPdf(r.pdf_path!)} className="font-semibold text-accent underline">보관(PDF)</button>
                  ) : (
                    <span className={r.source_type === "legacy" ? "text-slate-400" : "text-red-600"}>{pdfLabel(r)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
