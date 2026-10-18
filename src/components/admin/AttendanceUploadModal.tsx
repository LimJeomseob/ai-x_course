"use client";

import { ChangeEvent, useId, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import { parseCsv } from "@/lib/csv";
import type { SessionOption } from "@/lib/workshops";
import type { ApplicationWithWorkshop } from "@/lib/types";

interface Props {
  open: boolean;
  sessions: SessionOption[];
  rows: ApplicationWithWorkshop[];
  onClose: () => void;
  onApply: (ids: string[]) => void;
}

const NAME_HEADERS = ["성명", "이름", "name"];
const PHONE_HEADERS = ["연락처", "휴대폰", "전화번호", "핸드폰", "phone"];

/**
 * 출석부 CSV(성명·연락처) 업로드 → 해당 세션 신청 건과 매칭 → 일괄 '이수' 처리(PRD §6.2, Should)
 */
export function AttendanceUploadModal({ open, sessions, rows, onClose, onApply }: Props) {
  const titleId = useId();
  const [sessionId, setSessionId] = useState("");
  const [records, setRecords] = useState<{ name: string; digits: string }[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    setParseError(null);
    setRecords(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const table = parseCsv(await file.text());
    const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
    const nameIdx = header.findIndex((h) => NAME_HEADERS.includes(h));
    const phoneIdx = header.findIndex((h) => PHONE_HEADERS.includes(h));
    if (nameIdx < 0 || phoneIdx < 0) {
      setParseError("첫 행에 '성명'과 '연락처' 열이 있어야 합니다.");
      return;
    }
    setRecords(
      table
        .slice(1)
        .map((r) => ({ name: (r[nameIdx] ?? "").trim(), digits: (r[phoneIdx] ?? "").replace(/[^0-9]/g, "") }))
        .filter((r) => r.name)
    );
  }

  const match = useMemo(() => {
    if (!records || !sessionId) return null;
    const candidates = rows.filter((r) => r.workshop_id === sessionId && r.status !== "취소");
    const matched: ApplicationWithWorkshop[] = [];
    const unmatched: string[] = [];
    for (const rec of records) {
      const hit = candidates.find((c) => c.name === rec.name && c.phone_digits === rec.digits);
      if (hit) matched.push(hit);
      else unmatched.push(`${rec.name}(${rec.digits || "연락처 없음"})`);
    }
    const toComplete = Array.from(new Set(matched.filter((m) => m.status !== "이수").map((m) => m.id)));
    return { matched: matched.length, toComplete, already: matched.length - toComplete.length, unmatched };
  }, [records, sessionId, rows]);

  return (
    <Modal open={open} onClose={onClose} titleId={titleId}>
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-xl font-bold text-slate-900">출석부 업로드 → 이수처리</h2>
        <p className="text-xs text-slate-500">CSV 첫 행에 성명·연락처 열이 필요합니다. 같은 세션 신청 건 중 성명과 연락처가 모두 일치하는 건만 처리합니다.</p>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          세션
          <select className={inputBaseClass} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">세션 선택</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.day.day_label} {s.round_label} · {s.topic}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          출석부 CSV
          <input type="file" accept=".csv,text/csv" onChange={handleFile} className="text-sm font-normal" />
        </label>
        {parseError && <p role="alert" className="text-sm text-red-600">{parseError}</p>}
        {match && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700" role="status">
            <p>매칭 {match.matched}건 (이수 처리 대상 {match.toComplete.length}건, 이미 이수 {match.already}건)</p>
            {match.unmatched.length > 0 && (
              <p className="mt-1 text-red-700">미매칭 {match.unmatched.length}건: {match.unmatched.slice(0, 20).join(", ")}{match.unmatched.length > 20 ? " 외" : ""}</p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>닫기</Button>
          <Button type="button" disabled={!match || match.toComplete.length === 0} onClick={() => match && onApply(match.toComplete)}>
            {match ? `${match.toComplete.length}건 이수 처리` : "이수 처리"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
