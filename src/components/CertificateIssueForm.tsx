"use client";

import { useCallback, useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { LocationLink } from "@/components/LocationLink";
import { SurveyPromptModal } from "@/components/SurveyPromptModal";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { publicPost } from "@/lib/adminApi";
import { buildCertificateValues, renderCertificateFromTemplate } from "@/lib/certificatePdf";
import { CERTIFICATES_BUCKET } from "@/lib/db-tables";
import { formatTimeRange } from "@/lib/format";
import { downloadPdf } from "@/lib/issueCertificate";
import { groupLookupByDay } from "@/lib/lookup";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { IssueCertificateResponse, LookupResultItem } from "@/lib/types";
import type { LookupInput } from "@/lib/validation";

type Message = { type: "success" | "error"; text: string };

/** 수료증 발급 탭(PRD §5.5) — 이수 세션마다 수료증 1장(본인 발급 PDF) */
export function CertificateIssueForm() {
  const [identity, setIdentity] = useState<LookupInput | null>(null);
  const [results, setResults] = useState<LookupResultItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, Message | null>>({});
  const [surveyRound, setSurveyRound] = useState<number | null>(null);

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

  async function issue(item: LookupResultItem): Promise<boolean> {
    if (!identity) return false;
    const id = item.applicationId;
    setBusy((b) => ({ ...b, [id]: true }));
    setMessages((m) => ({ ...m, [id]: null }));
    try {
      const issued = await publicPost<IssueCertificateResponse>("/api/issue-certificate", {
        ...identity,
        applicationId: id,
      });
      const values = buildCertificateValues({
        certNo: issued.certNo,
        name: issued.name,
        affiliation: issued.affiliation,
        roundLabel: issued.roundLabel,
        topic: issued.topic,
        startAt: issued.startAt,
        endAt: issued.endAt,
        issuedAt: issued.issuedAt,
      });
      const bytes = await renderCertificateFromTemplate(issued.template, values);

      // 서버가 서명한 업로드 토큰으로 Storage(비공개 버킷)에 보관한다. 보관 실패해도 다운로드는 제공한다.
      const { error: uploadError } = await createSupabaseBrowserClient()
        .storage.from(CERTIFICATES_BUCKET)
        .uploadToSignedUrl(issued.upload.path, issued.upload.token, bytes, { contentType: "application/pdf" });

      downloadPdf(bytes, `수료증_${issued.certNo}.pdf`);
      setMessages((m) => ({
        ...m,
        [id]: {
          type: "success",
          text: `${issued.certNo} ${issued.reissueCount > 0 ? `재발급(${issued.reissueCount}회)` : "발급"} 완료${
            uploadError ? " · 보관 실패(다운로드 파일을 보관해 주세요)" : ""
          }`,
        },
      }));
      setResults((prev) => prev?.map((r) => (r.applicationId === id ? { ...r, certNo: issued.certNo } : r)) ?? prev);
      setSurveyRound(issued.round);
      return true;
    } catch (e) {
      setMessages((m) => ({
        ...m,
        [id]: { type: "error", text: e instanceof Error ? e.message : "수료증 발급 중 오류가 발생했습니다." },
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
      <IdentityForm submitLabel="이수 내역 확인" loading={loading} onSubmit={search} />

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {results && results.length === 0 && (
        <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">
          일치하는 신청 내역이 없습니다. 신청 시 입력한 성명과 연락처를 확인해 주세요.
        </p>
      )}

      {results &&
        groupLookupByDay(results).map((group) => {
          const completed = group.items.filter((i) => i.status === "이수");
          const allCompleted = group.items.length > 1 && completed.length === group.items.filter((i) => i.status !== "취소").length;
          return (
            <section key={group.dayCode} aria-label={`${group.dayLabel} 세션`} className="rounded-xl border border-slate-200 bg-white shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
                <h2 className="text-base font-bold text-brand">{group.dayLabel}</h2>
                {allCompleted && completed.length > 1 && (
                  <Button type="button" size="sm" variant="outline" onClick={() => issueDay(completed)}>
                    당일 수료증 모두 내려받기
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
                            장소: <LocationLink location={item.location} url={item.locationUrl} isOnline={item.isOnline} />
                          </span>
                          {item.certNo && <span>발급번호 {item.certNo}</span>}
                        </p>
                        {message && (
                          <p role={message.type === "error" ? "alert" : "status"} className={message.type === "error" ? "mt-1 text-sm font-medium text-red-600" : "mt-1 text-sm font-medium text-emerald-700"}>
                            {message.text}
                          </p>
                        )}
                      </div>
                      {item.status === "이수" ? (
                        <Button type="button" size="sm" disabled={busy[item.applicationId]} onClick={() => issue(item)}>
                          {busy[item.applicationId] ? "생성 중..." : item.certNo ? "재발급(PDF)" : "수료증 발급(PDF)"}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">이수 처리 후 발급 가능</span>
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
