"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { LocationLink } from "@/components/LocationLink";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AXIS_OPTIONS } from "@/lib/constants";
import { formatPhoneInput, formatTimeRange } from "@/lib/format";
import { applicationSchema, fieldErrors } from "@/lib/validation";
import {
  sessionStatusFor,
  fetchProgramData,
  type DayWithSessions,
  type ProgramData,
  type SessionStatus,
} from "@/lib/workshops";
import type { ApplySessionResult, ApplySessionsResponse, AxisParticipant, Workshop } from "@/lib/types";

interface FormState {
  name: string;
  affiliation: string;
  idNumber: string;
  axisParticipant: AxisParticipant | "";
  phone: string;
  email: string;
  consent: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  affiliation: "",
  idNumber: "",
  axisParticipant: "",
  phone: "",
  email: "",
  consent: false,
};

function statusSuffix(status: SessionStatus): string {
  if (status.phase === "마감") return "(마감)";
  if (status.phase === "신청 예정") return "(신청 예정)";
  if (status.phase === "확인 중") return "(확인 중)";
  if (status.phase === "대기접수") return `(정원 마감 · 대기 ${status.waitingRemaining}명 접수 가능)`;
  return status.unlimited ? "(제한 없음)" : `(잔여 ${status.remaining}명)`;
}

function dayHeader(day: DayWithSessions): string {
  const title = day.instructor_title ? ` ${day.instructor_title}` : "";
  return `${day.day_label} · ${day.instructor}${title} · ${day.level} · ${day.target}`;
}

/** 신청 탭(PRD §5.2) — 운영일별 그룹 체크박스로 세션 복수 선택 후 1회 제출 */
export function ApplicationForm() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<ProgramData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplySessionsResponse | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetchProgramData()
      .then(setData)
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const statusById = useMemo(() => {
    const map = new Map<string, SessionStatus>();
    if (!data) return map;
    for (const day of data.days) {
      for (const s of day.sessions) {
        map.set(s.id, sessionStatusFor(data, s, now));
      }
    }
    return map;
  }, [data, now]);

  // ?round=N → 해당 세션만, ?day=A → 당일 세션 전체 사전 체크(신청 가능한 세션만)
  useEffect(() => {
    if (!data) return;
    const round = Number(searchParams.get("round"));
    const dayCode = searchParams.get("day")?.toUpperCase();
    const initial = new Set<string>();
    for (const day of data.days) {
      for (const s of day.sessions) {
        const matches = (round && s.round === round) || (dayCode && day.day_code === dayCode);
        if (matches && statusById.get(s.id)?.canApply) initial.add(s.id);
      }
    }
    if (initial.size) setSelected(initial);
  }, [data, searchParams, statusById]);

  const selectedDays = useMemo(
    () => (data?.days ?? []).filter((d) => d.sessions.some((s) => selected.has(s.id))),
    [data, selected]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setErrors((e) => ({ ...e, workshopIds: "" }));
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const parsed = applicationSchema.safeParse({ ...form, workshopIds: Array.from(selected) });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    const v = parsed.data;
    const { data: response, error } = await createSupabaseBrowserClient().rpc("apply_sessions", {
      p_payload: {
        name: v.name,
        affiliation: v.affiliation,
        id_number: v.idNumber,
        axis_participant: v.axisParticipant,
        phone: v.phone,
        email: v.email,
        consent: v.consent,
      },
      p_session_ids: v.workshopIds,
    });
    setSubmitting(false);

    if (error || !response) {
      setSubmitError(error?.message ?? "신청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setResult(response as ApplySessionsResponse);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForAnother() {
    setResult(null);
    setSelected(new Set());
    fetchProgramData().then(setData).catch(() => null);
  }

  if (loadError) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        {loadError}
      </p>
    );
  }
  if (!data) {
    return (
      <p role="status" className="text-sm text-slate-500">
        세션 정보를 불러오는 중...
      </p>
    );
  }

  if (result) {
    return <ApplyResult result={result} days={data.days} onAnother={resetForAnother} />;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
      <fieldset
        className="flex flex-col gap-4"
        aria-describedby={errors.workshopIds ? "workshop-error" : undefined}
      >
        <legend className="text-base font-bold text-slate-900">
          세션(워크숍) 선택<span className="ml-1 text-red-600" aria-hidden="true">*</span>
          <span className="sr-only">(필수, 1개 이상)</span>
        </legend>
        <p className="text-sm text-slate-500">
          같은 날 세션은 기초→심화로 연계 구성되어 있어 함께 신청을 권장합니다(필수 아님). 정원이 찬 세션은 대기자(세션별 5명)로
          접수되며 결원 발생 시 접수 순서대로 자동 전환됩니다. 마감·오픈 전 세션은 선택할 수 없습니다.
        </p>

        {data.days.map((day) => {
          const chosen = day.sessions.filter((s) => selected.has(s.id)).length;
          const showLinkHint = day.sessions.length > 1 && chosen === 1;
          return (
            <div key={day.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
              <p className="text-sm font-bold text-brand">{dayHeader(day)}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {day.sessions.map((s: Workshop) => {
                  const status = statusById.get(s.id)!;
                  const disabled = !status.canApply;
                  const inputId = `session-${s.id}`;
                  return (
                    <li key={s.id}>
                      <label
                        htmlFor={inputId}
                        className={clsx(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                          disabled
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                            : selected.has(s.id)
                              ? "border-accent bg-accent/5 text-slate-900"
                              : "border-slate-200 hover:border-accent"
                        )}
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-[#0B4DA2]"
                          checked={selected.has(s.id)}
                          disabled={disabled}
                          onChange={() => toggle(s.id)}
                        />
                        <span>
                          <strong>{s.round_label}</strong> {formatTimeRange(s.start_at, s.end_at)} · {s.topic}{" "}
                          <span className={clsx("font-semibold", disabled ? "" : "text-accent")}>{statusSuffix(status)}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {showLinkHint && (
                <p className="mt-2 text-sm font-medium text-amber-700" role="status">
                  💡 같은 날 연계 세션도 함께 신청하시길 권장합니다(제출은 가능합니다).
                </p>
              )}
            </div>
          );
        })}
        {errors.workshopIds && (
          <p id="workshop-error" role="alert" className="text-sm font-medium text-red-600">
            {errors.workshopIds}
          </p>
        )}

        {selectedDays.length > 0 && (
          <div className="rounded-xl border border-brand/20 bg-brand/5 p-4 text-sm text-slate-700" aria-live="polite">
            <p className="font-bold text-brand">선택한 세션 안내</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {selectedDays.map((day) => (
                <li key={day.id}>
                  <strong>{day.day_label}</strong>{" "}
                  {day.sessions
                    .filter((s) => selected.has(s.id))
                    .map((s) => s.round_label)
                    .join("·")}{" "}
                  — 장소: <LocationLink location={day.location} url={day.location_url} isOnline={day.is_online} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <legend className="px-1 text-base font-bold text-slate-900">신청자 정보</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="성명" required error={errors.name}>
            {(p) => (
              <input {...p} className={inputBaseClass} value={form.name} maxLength={50} autoComplete="name" onChange={(e) => update("name", e.target.value)} />
            )}
          </FormField>
          <FormField label="소속" required error={errors.affiliation}>
            {(p) => (
              <input {...p} className={inputBaseClass} value={form.affiliation} maxLength={100} placeholder="예: 인문대학 OO학과" onChange={(e) => update("affiliation", e.target.value)} />
            )}
          </FormField>
          <FormField label="교번/직번/학번/생년월일" required error={errors.idNumber}>
            {(p) => (
              <input {...p} className={inputBaseClass} value={form.idNumber} maxLength={50} onChange={(e) => update("idNumber", e.target.value)} />
            )}
          </FormField>
          <FormField label="연락처" required error={errors.phone} hint="휴대폰 번호 (예: 010-1234-5678)">
            {(p) => (
              <input
                {...p}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                className={inputBaseClass}
                value={form.phone}
                placeholder="010-1234-5678"
                onChange={(e) => update("phone", formatPhoneInput(e.target.value))}
              />
            )}
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="이메일" required error={errors.email} hint="신청 결과·운영 안내·Zoom 링크가 이 주소로 발송됩니다.">
              {(p) => (
                <input {...p} type="email" autoComplete="email" className={inputBaseClass} value={form.email} onChange={(e) => update("email", e.target.value)} />
              )}
            </FormField>
          </div>
        </div>

        <fieldset aria-describedby={errors.axisParticipant ? "axis-error" : undefined}>
          <legend className="text-sm font-semibold text-slate-800">
            AI-X 교과목 개발·인증 신청 여부<span className="ml-1 text-red-600" aria-hidden="true">*</span>
            <span className="sr-only">(필수)</span>
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {AXIS_OPTIONS.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="axisParticipant"
                  value={o.value}
                  className="h-4 w-4 accent-[#0B4DA2]"
                  checked={form.axisParticipant === o.value}
                  onChange={() => update("axisParticipant", o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
          {errors.axisParticipant && (
            <p id="axis-error" role="alert" className="mt-1 text-xs font-medium text-red-600">
              {errors.axisParticipant}
            </p>
          )}
        </fieldset>

        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">개인정보 수집·이용 안내</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li>수집항목: 성명, 소속, 교번/직번/학번/생년월일, AI-X 교과목 개발·인증 신청 여부, 연락처, 이메일</li>
            <li>수집목적: 워크숍 신청·운영, 수료증 발급, 안내 메일 발송</li>
            <li>보유기간: 워크숍 종료 후 1년 또는 관계 법령에서 정한 기간</li>
            <li>동의를 거부할 수 있으나, 거부 시 워크숍 신청이 제한됩니다.</li>
          </ul>
          <label className="mt-3 flex cursor-pointer items-center gap-2 font-semibold text-slate-800">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#0B4DA2]"
              checked={form.consent}
              aria-describedby={errors.consent ? "consent-error" : undefined}
              onChange={(e) => update("consent", e.target.checked)}
            />
            개인정보 수집·이용에 동의합니다. (필수)
          </label>
          {errors.consent && (
            <p id="consent-error" role="alert" className="mt-1 text-xs font-medium text-red-600">
              {errors.consent}
            </p>
          )}
        </div>
      </fieldset>

      {submitError && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
          {submitError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={submitting} className="self-center">
        {submitting ? "신청 처리 중..." : `선택한 ${selected.size}개 세션 신청하기`}
      </Button>
    </form>
  );
}

function ApplyResult({
  result,
  days,
  onAnother,
}: {
  result: ApplySessionsResponse;
  days: DayWithSessions[];
  onAnother: () => void;
}) {
  const sessionById = new Map(days.flatMap((d) => d.sessions.map((s) => [s.id, { day: d, session: s }] as const)));
  const succeeded = result.results.filter((r) => r.ok);
  const confirmed = succeeded.filter((r) => r.status !== "대기");
  const waitlisted = succeeded.filter((r) => r.status === "대기");
  const failed = result.results.filter((r) => !r.ok);
  const describe = (r: ApplySessionResult) => {
    const info = sessionById.get(r.workshop_id);
    return `${info?.day.day_label ?? ""} ${r.round_label ?? ""} ${
      info ? formatTimeRange(info.session.start_at, info.session.end_at) : ""
    } · ${r.topic ?? ""}`;
  };

  return (
    <section aria-live="polite" className="flex flex-col gap-6">
      {confirmed.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-xl font-bold text-emerald-900">신청이 완료되었습니다</h2>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-emerald-900 sm:text-base">
            {confirmed.map((r) => (
              <li key={r.workshop_id}>✔ {describe(r)}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-emerald-800">신청 결과 안내 메일은 매일 18:00에 일괄 발송됩니다.</p>
        </div>
      )}

      {waitlisted.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-bold text-amber-900">대기자로 등록되었습니다</h2>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-amber-900 sm:text-base">
            {waitlisted.map((r) => (
              <li key={r.workshop_id}>⏳ {describe(r)}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-amber-800">
            정원이 찬 세션입니다. 결원 발생 시 접수 순서대로 신청완료로 자동 전환되며, 전환 시 메일로 안내드립니다.
            {confirmed.length === 0 && " 신청 결과 안내 메일은 매일 18:00에 일괄 발송됩니다."}
          </p>
        </div>
      )}

      {succeeded.length === 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-xl font-bold text-red-900">신청되지 않았습니다</h2>
        </div>
      )}

      {failed.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-white p-6">
          <h3 className="font-bold text-red-800">신청되지 않은 세션</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-slate-700">
            {failed.map((r) => (
              <li key={r.workshop_id}>
                ✖ {r.round_label ?? "알 수 없는 세션"} {r.topic ? `· ${r.topic}` : ""} — <strong className="text-red-700">{r.message}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/lookup"
          className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 font-bold text-white shadow-card hover:bg-brand"
        >
          신청내역조회로 이동
        </Link>
        <Button type="button" variant="outline" onClick={onAnother}>
          다른 세션 추가 신청
        </Button>
      </div>
    </section>
  );
}
