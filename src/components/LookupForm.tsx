"use client";

import { useCallback, useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { CancelConfirmModal } from "@/components/CancelConfirmModal";
import { LocationLink } from "@/components/LocationLink";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { publicPost } from "@/lib/adminApi";
import { formatTimeRange } from "@/lib/format";
import { groupLookupByDay } from "@/lib/lookup";
import type { LookupResultItem } from "@/lib/types";
import type { LookupInput } from "@/lib/validation";

/** 신청내역조회 탭(PRD §5.3) — 운영일별 세션 행, 취소·수료증 다운로드 */
export function LookupForm() {
  const [identity, setIdentity] = useState<LookupInput | null>(null);
  const [results, setResults] = useState<LookupResultItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LookupResultItem | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const search = useCallback(async (input: LookupInput) => {
    setLoading(true);
    setError(null);
    try {
      const data = await publicPost<{ results: LookupResultItem[] }>("/api/lookup", input);
      setIdentity(input);
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const closeCancel = useCallback(() => setCancelTarget(null), []);

  async function confirmCancel() {
    if (!identity || !cancelTarget) return;
    setCancelling(true);
    try {
      await publicPost("/api/cancel-application", { ...identity, applicationId: cancelTarget.applicationId });
      setNotice(`${cancelTarget.dayLabel} ${cancelTarget.roundLabel} 신청이 취소되었습니다.`);
      setCancelTarget(null);
      await search(identity);
    } catch (e) {
      setError(e instanceof Error ? e.message : "취소 처리 중 오류가 발생했습니다.");
      setCancelTarget(null);
    } finally {
      setCancelling(false);
    }
  }

  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <IdentityForm submitLabel="조회하기" loading={loading} onSubmit={(input) => { setNotice(null); search(input); }} />

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          {notice}
        </p>
      )}

      {results && results.length === 0 && (
        <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">
          일치하는 신청 내역이 없습니다. 신청 시 입력한 성명과 연락처를 확인해 주세요.
        </p>
      )}

      {results &&
        groupLookupByDay(results).map((group) => (
          <section key={group.dayCode} aria-label={`${group.dayLabel} 신청 내역`} className="rounded-xl border border-slate-200 bg-white shadow-card">
            <h2 className="border-b border-slate-100 px-5 py-3 text-base font-bold text-brand">{group.dayLabel}</h2>
            <ul className="divide-y divide-slate-100">
              {group.items.map((item) => {
                const cancellable =
                  (item.status === "신청완료" || item.status === "대기") && now < new Date(item.startAt).getTime();
                return (
                  <li key={item.applicationId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {item.roundLabel} {formatTimeRange(item.startAt, item.endAt)} · {item.topic}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <StatusBadge status={item.status} />
                        <span>
                          장소: <LocationLink location={item.location} url={item.locationUrl} isOnline={item.isOnline} />
                        </span>
                        {item.certNo && <span>수료증 {item.certNo}</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {item.certDownloadUrl && (
                        <a
                          href={item.certDownloadUrl}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700"
                        >
                          수료증 다운로드
                        </a>
                      )}
                      {cancellable && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(item)}
                          className="rounded-lg border-2 border-red-600 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50"
                        >
                          신청 취소
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      <CancelConfirmModal item={cancelTarget} loading={cancelling} onConfirm={confirmCancel} onClose={closeCancel} />
    </div>
  );
}
