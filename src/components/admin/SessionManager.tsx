"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import { adminFetch } from "@/lib/adminApi";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import { formatDate, formatTime } from "@/lib/format";
import type { WorkshopAdminLinks } from "@/lib/types";

interface Draft {
  notes: string;
  zoom_link: string;
  prelearning_url: string;
}

/** 세션 관리(PRD §9.4) — 3차 Zoom 링크·5차 사전학습 URL·협조사항 편집. 링크는 포털에 노출되지 않고 메일로만 발송된다. */
export function SessionManager() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [sessions, setSessions] = useState<WorkshopAdminLinks[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dayNotes, setDayNotes] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { sessions: rows } = await adminFetch<{ sessions: WorkshopAdminLinks[] }>("/api/admin/sessions");
      setSessions(rows);
      setDrafts(Object.fromEntries(rows.map((s) => [s.id, { notes: s.notes, zoom_link: s.zoom_link ?? "", prelearning_url: s.prelearning_url ?? "" }])));
      setDayNotes(Object.fromEntries(rows.map((s) => [s.day.day_code, s.day.notes])));
    } catch (e) {
      setFlash({ type: "error", text: e instanceof Error ? e.message : "세션 정보를 불러오지 못했습니다." });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSession(id: string) {
    setSavingId(id);
    try {
      await adminFetch("/api/admin/sessions", { method: "PATCH", body: { id, ...drafts[id] } });
      setFlash({ type: "success", text: "세션 정보를 저장했습니다." });
      await load();
    } catch (e) {
      setFlash({ type: "error", text: e instanceof Error ? e.message : "저장 실패" });
    } finally {
      setSavingId(null);
    }
  }

  async function saveDayNotes(dayCode: string) {
    setSavingId(dayCode);
    const { error } = await supabase.from(TABLES.WORKSHOP_DAYS).update({ notes: dayNotes[dayCode] }).eq("day_code", dayCode);
    setSavingId(null);
    setFlash(error ? { type: "error", text: error.message } : { type: "success", text: `Day ${dayCode} 공통 협조사항을 저장했습니다.` });
  }

  const days = Array.from(new Map(sessions.map((s) => [s.day.day_code, s.day])).values());

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">세션 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          Zoom 링크(3차)는 D-1 준비 안내(M5)·당일 안내(M4) 메일로만, 사전학습 URL(5차)은 D-3 운영 안내(M3) 메일로만 발송되며 포털에는 노출되지 않습니다.
          Zoom 링크가 비어 있으면 M5 발송이 보류되고 관리자에게 알림 메일이 갑니다.
        </p>
      </div>
      {flash && (
        <p role={flash.type === "error" ? "alert" : "status"} className={clsx("rounded-lg p-3 text-sm font-medium", flash.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800")}>
          {flash.text}
        </p>
      )}

      {days.map((day) => (
        <section key={day.day_code} className="rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-base font-bold text-brand">Day {day.day_code} · {day.day_label}{day.is_online ? " · 온라인" : ""}</h2>
            <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600">
              운영일 공통 협조사항(소개 카드·메일 공통)
              <textarea rows={2} className={inputBaseClass} value={dayNotes[day.day_code] ?? ""} onChange={(e) => setDayNotes((d) => ({ ...d, [day.day_code]: e.target.value }))} />
            </label>
            <Button size="sm" variant="outline" className="mt-2" disabled={savingId === day.day_code} onClick={() => saveDayNotes(day.day_code)}>공통 협조사항 저장</Button>
          </div>
          <ul className="divide-y divide-slate-100">
            {sessions.filter((s) => s.day.day_code === day.day_code).map((s) => {
              const draft = drafts[s.id];
              if (!draft) return null;
              const update = (key: keyof Draft, value: string) => setDrafts((d) => ({ ...d, [s.id]: { ...d[s.id], [key]: value } }));
              return (
                <li key={s.id} className="grid gap-3 p-4 lg:grid-cols-[220px_1fr]">
                  <div>
                    <p className="font-bold">{s.round_label}</p>
                    <p className="text-sm text-slate-600">{s.topic}</p>
                    <p className="text-xs text-slate-500">{formatDate(s.start_at)} {formatTime(s.start_at)}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                      세션 추가 협조사항
                      <textarea rows={2} className={inputBaseClass} value={draft.notes} onChange={(e) => update("notes", e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                      Zoom 링크{s.day.is_online ? " (필수)" : ""}
                      <input type="url" placeholder="https://zoom.us/j/..." className={clsx(inputBaseClass, s.day.is_online && !draft.zoom_link && "border-red-400")} value={draft.zoom_link} onChange={(e) => update("zoom_link", e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                      사전학습 URL
                      <input type="url" placeholder="https://" className={inputBaseClass} value={draft.prelearning_url} onChange={(e) => update("prelearning_url", e.target.value)} />
                    </label>
                    <Button size="sm" className="justify-self-start md:col-span-3" disabled={savingId === s.id} onClick={() => saveSession(s.id)}>
                      {savingId === s.id ? "저장 중..." : `${s.round_label} 저장`}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
