"use client";

import { useCallback, useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { CancelConfirmModal } from "@/components/CancelConfirmModal";
import { LocationLink } from "@/components/LocationLink";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { publicPost } from "@/lib/adminApi";
import { formatTimeRange } from "@/lib/format";
import { useDict, useLocale } from "@/lib/i18n/LocaleProvider";
import { groupLookupByDay } from "@/lib/lookup";
import type { CancelApplicationResponse, LookupResultItem } from "@/lib/types";
import type { LookupInput } from "@/lib/validation";

/** 신청내역조회 탭(PRD §5.3) — 운영일별 세션 행, 취소(이메일 확인 코드)·수료증 다운로드 */
export function LookupForm() {
  const locale = useLocale();
  const dict = useDict();
  const t = dict.lookup;
  const [identity, setIdentity] = useState<LookupInput | null>(null);
  const [results, setResults] = useState<LookupResultItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LookupResultItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // 취소 2단계: 확인 코드를 보낸 주소(가림 처리) — null이면 아직 코드 발송 전
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const search = useCallback(
    async (input: LookupInput) => {
      setLoading(true);
      setError(null);
      try {
        const data = await publicPost<{ results: LookupResultItem[] }>(
          "/api/lookup",
          { ...input, locale },
          dict.api.lookupFailed
        );
        setIdentity(input);
        setResults(data.results);
      } catch (e) {
        setError(e instanceof Error ? e.message : dict.api.lookupFailed);
      } finally {
        setLoading(false);
      }
    },
    [locale, dict]
  );

  const closeCancel = useCallback(() => {
    setCancelTarget(null);
    setCodeSentTo(null);
    setCancelError(null);
  }, []);

  /** code 없이 호출 = 확인 코드 발송, code와 함께 호출 = 취소 확정 */
  async function submitCancel(code?: string) {
    if (!identity || !cancelTarget) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await publicPost<CancelApplicationResponse>(
        "/api/cancel-application",
        { ...identity, applicationId: cancelTarget.applicationId, code, locale },
        dict.api.cancelFailed
      );
      if (res.step === "code_sent") {
        setCodeSentTo(res.maskedEmail);
        return;
      }
      setNotice(t.cancelled(cancelTarget.dayLabel, cancelTarget.roundLabel));
      closeCancel();
      await search(identity);
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : dict.api.cancelFailed);
    } finally {
      setCancelling(false);
    }
  }

  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <IdentityForm
        submitLabel={t.submit}
        loading={loading}
        onSubmit={(input) => {
          setNotice(null);
          search(input);
        }}
      />

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
        <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">{t.noResults}</p>
      )}

      {results &&
        groupLookupByDay(results).map((group) => (
          <section key={group.dayCode} aria-label={t.sectionAria(group.dayLabel)} className="rounded-xl border border-slate-200 bg-white shadow-card">
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
                          {dict.common.place}:{" "}
                          <LocationLink location={item.location} url={item.locationUrl} isOnline={item.isOnline} />
                        </span>
                        {item.certNo && (
                          <span>
                            {t.certLabel} {item.certNo}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {item.certDownloadUrl && (
                        <a
                          href={item.certDownloadUrl}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700"
                        >
                          {t.downloadCert}
                        </a>
                      )}
                      {cancellable && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(item)}
                          className="rounded-lg border-2 border-red-600 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50"
                        >
                          {t.cancel}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      <CancelConfirmModal
        item={cancelTarget}
        loading={cancelling}
        codeSentTo={codeSentTo}
        error={cancelError}
        onRequestCode={() => submitCancel()}
        onConfirm={(code) => submitCancel(code)}
        onClose={closeCancel}
      />
    </div>
  );
}
