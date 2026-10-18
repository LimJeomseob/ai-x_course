"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import {
  AWARENESS_PATH_OPTIONS,
  AXIS_OPTIONS,
  axisLabel,
  COLLEGE_GROUP_OPTIONS,
  SURVEY_LIKERT_QUESTIONS,
  SURVEY_OPEN_QUESTIONS,
  SURVEY_VERSION,
} from "@/lib/constants";
import { exportRowsAsCsv, type CsvColumn } from "@/lib/csv";
import { formatDateTime, kstDateKey } from "@/lib/format";
import { fetchProgramData, type DayWithSessions } from "@/lib/workshops";
import type { SurveyResponse } from "@/lib/types";

function Distribution({ title, labels, values }: { title: string; labels: string[]; values: string[] }) {
  const total = values.length || 1;
  const counts = labels.map((l) => ({ label: l, count: values.filter((v) => v === l).length }));
  const others = values.filter((v) => !labels.includes(v)).length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <ul className="mt-3 flex flex-col gap-2">
        {[...counts, ...(others ? [{ label: "(기타 값)", count: others }] : [])].map((c) => (
          <li key={c.label} className="text-xs text-slate-600">
            <div className="flex justify-between">
              <span>{c.label}</span>
              <span className="font-semibold">
                {c.count}명 ({Math.round((c.count / total) * 100)}%)
              </span>
            </div>
            <div className="mt-1 h-2 rounded bg-slate-100" aria-hidden="true">
              <div className="h-2 rounded bg-accent" style={{ width: `${(c.count / total) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 만족도 설문결과(PRD §6.3) */
export function SurveyResultsView() {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [days, setDays] = useState<DayWithSessions[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dayFilter, setDayFilter] = useState("");
  const [roundFilter, setRoundFilter] = useState("");

  useEffect(() => {
    Promise.all([
      createSupabaseBrowserClient()
        .from(TABLES.SURVEY)
        .select("*")
        .order("submitted_at", { ascending: false })
        .returns<SurveyResponse[]>(),
      fetchProgramData(),
    ])
      .then(([res, program]) => {
        if (res.error) throw new Error(res.error.message);
        setResponses(res.data ?? []);
        setDays(program.days);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const dayByRound = useMemo(() => {
    const map = new Map<number, DayWithSessions>();
    for (const d of days) for (const s of d.sessions) map.set(s.round, d);
    return map;
  }, [days]);

  const filtered = useMemo(
    () =>
      responses.filter(
        (r) =>
          (!dayFilter || (r.workshop_round !== null && dayByRound.get(r.workshop_round)?.day_code === dayFilter)) &&
          (!roundFilter || String(r.workshop_round) === roundFilter)
      ),
    [responses, dayFilter, roundFilter, dayByRound]
  );

  const averages = SURVEY_LIKERT_QUESTIONS.map((q) => {
    const values = filtered.map((r) => r[q.key]);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return { ...q, avg };
  });

  const bySession = days.flatMap((d) =>
    d.sessions.map((s) => ({ day: d, session: s, count: responses.filter((r) => r.workshop_round === s.round).length }))
  );

  function exportCsv() {
    const columns: CsvColumn<SurveyResponse>[] = [
      { header: "제출일시", accessor: (r) => formatDateTime(r.submitted_at) },
      { header: "운영일", accessor: (r) => (r.workshop_round ? dayByRound.get(r.workshop_round)?.day_label ?? "" : "") },
      { header: "S1. 참여 세션", accessor: (r) => r.workshop },
      { header: "S2. AI-X 교과목 개발·인증 신청 여부", accessor: (r) => axisLabel(r.axis_participant, false) },
      { header: "S3. 소속 계열", accessor: (r) => r.college_group },
      { header: "S4. 워크숍을 알게 된 경로", accessor: (r) => r.awareness_path },
      ...SURVEY_LIKERT_QUESTIONS.map((q) => ({ header: `${q.key.toUpperCase()}. ${q.text}`, accessor: (r: SurveyResponse) => r[q.key] })),
      ...SURVEY_OPEN_QUESTIONS.map((q) => ({ header: `${q.key.toUpperCase()}. ${q.text}`, accessor: (r: SurveyResponse) => r[q.key] })),
    ];
    exportRowsAsCsv(filtered, columns, `survey_responses_원천데이터_${kstDateKey(new Date())}.csv`);
  }

  if (loading) return <p role="status" className="text-sm text-slate-500">불러오는 중...</p>;
  if (error) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">만족도 설문결과</h1>
          <p className="mt-1 text-sm text-slate-500">문항 {SURVEY_VERSION} · 전체 응답 {responses.length}건 · 표시 {filtered.length}건</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            운영일
            <select value={dayFilter} onChange={(e) => { setDayFilter(e.target.value); setRoundFilter(""); }} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal">
              <option value="">전체</option>
              {days.map((d) => <option key={d.id} value={d.day_code}>{d.day_label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            세션
            <select value={roundFilter} onChange={(e) => setRoundFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal">
              <option value="">전체</option>
              {days.filter((d) => !dayFilter || d.day_code === dayFilter).flatMap((d) => d.sessions).map((s) => (
                <option key={s.id} value={s.round}>{s.round_label} {s.topic}</option>
              ))}
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={exportCsv}>CSV 내보내기</Button>
        </div>
      </div>

      <section aria-label="문항별 평균" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-brand/30 bg-brand p-4 text-white shadow-card">
          <p className="text-xs font-semibold text-white/80">응답 수</p>
          <p className="mt-1 text-3xl font-bold">{filtered.length}</p>
        </div>
        {averages.map((q) => (
          <div key={q.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold text-slate-500">{q.key.toUpperCase()}</p>
            <p className="mt-1 text-2xl font-bold text-brand">{filtered.length ? q.avg.toFixed(1) : "-"}<span className="text-sm text-slate-400">/5.0</span></p>
            <p className="mt-1 text-xs text-slate-600">{q.text}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Distribution title="S2. AXIS 참여 여부" labels={AXIS_OPTIONS.map((o) => o.short)} values={filtered.map((r) => axisLabel(r.axis_participant))} />
        <Distribution title="S3. 소속 계열" labels={COLLEGE_GROUP_OPTIONS} values={filtered.map((r) => r.college_group)} />
        <Distribution title="S4. 인지 경로" labels={AWARENESS_PATH_OPTIONS} values={filtered.map((r) => r.awareness_path)} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
        <h2 className="text-sm font-bold text-slate-800">세션별·운영일별 응답 수</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-slate-500"><tr><th className="py-1">운영일</th><th>세션</th><th className="text-right">응답</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {bySession.map(({ day, session, count }) => (
              <tr key={session.id}><td className="py-1.5">{day.day_label}</td><td>{session.round_label} {session.topic}</td><td className="text-right font-semibold">{count}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="min-w-[1200px] w-full text-left text-xs">
          <thead className="bg-slate-50 font-bold text-slate-600">
            <tr>
              <th className="px-2 py-2">제출일시</th><th className="px-2 py-2">세션</th><th className="px-2 py-2">AXIS</th><th className="px-2 py-2">계열</th><th className="px-2 py-2">인지경로</th>
              {SURVEY_LIKERT_QUESTIONS.map((q) => <th key={q.key} className="px-2 py-2" title={q.text}>{q.key.toUpperCase()}</th>)}
              <th className="px-2 py-2">O1 희망 주제</th><th className="px-2 py-2">O2 개선 의견</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-2 py-1.5">{formatDateTime(r.submitted_at)}</td>
                <td className="px-2 py-1.5">{r.workshop}</td>
                <td className="px-2 py-1.5">{axisLabel(r.axis_participant)}</td>
                <td className="px-2 py-1.5">{r.college_group}</td>
                <td className="px-2 py-1.5">{r.awareness_path}</td>
                {SURVEY_LIKERT_QUESTIONS.map((q) => <td key={q.key} className="px-2 py-1.5 text-center">{r[q.key]}</td>)}
                <td className="max-w-xs px-2 py-1.5">{r.o1}</td>
                <td className="max-w-xs px-2 py-1.5">{r.o2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
