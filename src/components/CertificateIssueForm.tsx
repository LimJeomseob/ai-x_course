"use client";

import { useCallback, useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { LocationLink } from "@/components/LocationLink";
import { SurveyPromptModal } from "@/components/SurveyPromptModal";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { publicPost } from "@/lib/adminApi";
import { formatTimeRange } from "@/lib/format";
import { useDict, useLocale } from "@/lib/i18n/LocaleProvider";
import { downloadPdf } from "@/lib/issueCertificate";
import { groupLookupByDay } from "@/lib/lookup";
import type { IssueCertificateResponse, LookupResultItem } from "@/lib/types";
import type { LookupInput } from "@/lib/validation";

type Message = { type: "success" | "error"; text: string };

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 수료증 발급 탭(PRD §5.5) — 이수 세션마다 수료증 1장. PDF는 서버가 생성·보관해 내려 준다. */
export function CertificateIssueForm() {
  const locale = useLocale();
  const dict = useDict();
  const t = dict.cert;
  const [identity, setIdentity] = useState<LookupInput | null>(null);
  const [results, setResults] = useState<LookupResultItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, Message | null>>({});
  const [surveyRound, setSurveyRound] = useState<number | null>(null);

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

  async function issue(item: LookupResultItem): Promise<boolean> {
    if (!identity) return false;
    const id = item.applicationId;
    setBusy((b) => ({ ...b, [id]: true }));
    setMessages((m) => ({ ...m, [id]: null }));
    try {
      // 채번·PDF 생성·보관은 모두 서버가 처리한다. 브라우저는 받은 PDF를 저장만 한다.
      const issued = await publicPost<IssueCertificateResponse>(
        "/api/issue-certificate",
        { ...identity, applicationId: id, locale },
        dict.api.certIssueFailed
      );
      downloadPdf(base64ToBytes(issued.pdfBase64), t.fileName(issued.certNo));
      setMessages((m) => ({
        ...m,
        [id]: {
          type: "success",
          text: `${t.done(issued.certNo, issued.reissueCount)}${issued.stored ? "" : t.storeFailed}`,
        },
      }));
      setResults((prev) => prev?.map((r) => (r.applicationId === id ? { ...r, certNo: issued.certNo } : r)) ?? prev);
      setSurveyRound(issued.round);
      return true;
    } catch (e) {
      setMessages((m) => ({
        ...m,
        [id]: { type: "error", text: e instanceof Error ? e.message : dict.api.certIssueFailed },
      }));
      return false;
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  async function issueDay(items: LookupResultItem[]) {
    for (const item of items) {
      await issue(item);
    }
  }

  const closeSurvey = useCallback(() => setSurveyRound(null), []);

  return (
    <div className="flex flex-col gap-6">
      <IdentityForm submitLabel={t.submit} loading={loading} onSubmit={search} />

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {results && results.length === 0 && (
        <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">{dict.lookup.noResults}</p>
      )}

      {results &&
        groupLookupByDay(results).map((group) => {
          const completed = group.items.filter((i) => i.status === "이수");
          const allCompleted = group.items.length > 1 && completed.length === group.items.filter((i) => i.status !== "취소").length;
          return (
            <section key={group.dayCode} aria-label={t.sectionAria(group.dayLabel)} className="rounded-xl border border-slate-200 bg-white shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
                <h2 className="text-base font-bold text-brand">{group.dayLabel}</h2>
                {allCompleted && completed.length > 1 && (
                  <Button type="button" size="sm" variant="outline" onClick={() => issueDay(completed)}>
                    {t.issueAll}
                  </Button>
                )}
              </div>
              <ul className="divide-y divide-slate-100">
                {group.items.map((item) => {
                  const message = messages[item.applicationId];
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
                              {t.certNo} {item.certNo}
                            </span>
                          )}
                        </p>
                        {message && (
                          <p role={message.type === "error" ? "alert" : "status"} className={message.type === "error" ? "mt-1 text-sm font-medium text-red-600" : "mt-1 text-sm font-medium text-emerald-700"}>
                            {message.text}
                          </p>
                        )}
                      </div>
                      {item.status === "이수" ? (
                        <Button type="button" size="sm" disabled={busy[item.applicationId]} onClick={() => issue(item)}>
                          {busy[item.applicationId] ? t.generating : item.certNo ? t.reissue : t.issue}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">{t.notYet}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

      <SurveyPromptModal open={surveyRound !== null} round={surveyRound ?? undefined} onClose={closeSurvey} />
    </div>
  );
}
