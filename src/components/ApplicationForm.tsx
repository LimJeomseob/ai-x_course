"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { LocationLink } from "@/components/LocationLink";
import { publicPost } from "@/lib/adminApi";
import { formatPhoneInput, formatTimeRange } from "@/lib/format";
import { localePath, type Locale } from "@/lib/i18n/config";
import { getContent } from "@/lib/i18n/content";
import type { Dict } from "@/lib/i18n/dict";
import { useDict, useLocale } from "@/lib/i18n/LocaleProvider";
import { fieldErrors, getSchemas } from "@/lib/validation";
import {
  deriveSessionStatus,
  fetchProgramData,
  type DayWithSessions,
  type ProgramData,
  type SessionStatus,
} from "@/lib/workshops";
import type { ApplySessionsResponse, AxisParticipant, Workshop } from "@/lib/types";

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

function statusSuffix(status: SessionStatus, t: Dict["apply"]): string {
  if (status.phase === "마감") return t.suffixClosed;
  if (status.phase === "신청 예정") return t.suffixUpcoming;
  if (status.phase === "확인 중") return t.suffixChecking;
  return status.unlimited ? t.suffixUnlimited : t.suffixRemaining(status.remaining);
}

function dayHeader(day: DayWithSessions, locale: Locale, dict: Dict): string {
  const title = day.instructor_title ? `${locale === "en" ? "," : ""} ${day.instructor_title}` : "";
  return `${day.day_label} · ${day.instructor}${title} · ${dict.level[day.level] ?? day.level} · ${day.target}`;
}

/** 신청 탭(PRD §5.2) — 운영일별 그룹 체크박스로 세션 복수 선택 후 1회 제출 */
export function ApplicationForm() {
  const searchParams = useSearchParams();
  const locale = useLocale();
  const dict = useDict();
  const t = dict.apply;
  const content = getContent(locale);
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
    fetchProgramData(locale)
      .then(setData)
      .catch((e: Error) => setLoadError(e.message));
  }, [locale]);

  const statusById = useMemo(() => {
    const map = new Map<string, SessionStatus>();
    if (!data) return map;
    for (const day of data.days) {
      for (const s of day.sessions) {
        map.set(
          s.id,
          deriveSessionStatus(s, data.availabilityLoaded ? data.appliedCountByWorkshopId.get(s.id) ?? 0 : undefined, now)
        );
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

    const parsed = getSchemas(locale).applicationSchema.safeParse({ ...form, workshopIds: Array.from(selected) });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    // 신청은 서버(/api/apply)가 요청 횟수 제한·검증 후 처리한다(브라우저의 DB 직접 호출 없음).
    setSubmitting(true);
    try {
      const response = await publicPost<ApplySessionsResponse>(
        "/api/apply",
        { ...parsed.data, locale },
        dict.api.applyFailed
      );
      setResult(response);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : dict.api.applyFailed);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForAnother() {
    setResult(null);
    setSelected(new Set());
    fetchProgramData(locale).then(setData).catch(() => null);
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
        {dict.common.sessionsLoading}
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
          {t.legendSessions}
          <span className="ml-1 text-red-600" aria-hidden="true">*</span>
          <span className="sr-only">{t.legendSessionsSr}</span>
        </legend>
        <p className="text-sm text-slate-500">
          {t.sessionsHint}
        </p>

        {data.days.map((day) => {
          const chosen = day.sessions.filter((s) => selected.has(s.id)).length;
          const showLinkHint = day.sessions.length > 1 && chosen === 1;
          return (
            <div key={day.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
              <p className="text-sm font-bold text-brand">{dayHeader(day, locale, dict)}</p>
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
                          <span className={clsx("font-semibold", disabled ? "" : "text-accent")}>{statusSuffix(status, t)}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {showLinkHint && (
                <p className="mt-2 text-sm font-medium text-amber-700" role="status">
                  {t.linkHint}
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
            <p className="font-bold text-brand">{t.selectedInfo}</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {selectedDays.map((day) => (
                <li key={day.id}>
                  <strong>{day.day_label}</strong>{" "}
                  {day.sessions
                    .filter((s) => selected.has(s.id))
                    .map((s) => s.round_label)
                    .join(locale === "en" ? ", " : "·")}{" "}
                  — {dict.common.place}: <LocationLink location={day.location} url={day.location_url} isOnline={day.is_online} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <legend className="px-1 text-base font-bold text-slate-900">{t.applicantInfo}</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t.name} required error={errors.name}>
            {(p) => (
              <input {...p} className={inputBaseClass} value={form.name} maxLength={50} autoComplete="name" onChange={(e) => update("name", e.target.value)} />
            )}
          </FormField>
          <FormField label={t.affiliation} required error={errors.affiliation}>
            {(p) => (
              <input {...p} className={inputBaseClass} value={form.affiliation} maxLength={100} placeholder={t.affiliationPlaceholder} onChange={(e) => update("affiliation", e.target.value)} />
            )}
          </FormField>
          <FormField label={t.idNumber} required error={errors.idNumber}>
            {(p) => (
              <input {...p} className={inputBaseClass} value={form.idNumber} maxLength={50} onChange={(e) => update("idNumber", e.target.value)} />
            )}
          </FormField>
          <FormField label={t.phone} required error={errors.phone} hint={t.phoneHint}>
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
            <FormField label={t.email} required error={errors.email} hint={t.emailHint}>
              {(p) => (
                <input {...p} type="email" autoComplete="email" className={inputBaseClass} value={form.email} onChange={(e) => update("email", e.target.value)} />
              )}
            </FormField>
          </div>
        </div>

        <fieldset aria-describedby={errors.axisParticipant ? "axis-error" : undefined}>
          <legend className="text-sm font-semibold text-slate-800">
            {t.axisLegend}
            <span className="ml-1 text-red-600" aria-hidden="true">*</span>
            <span className="sr-only">{dict.common.required}</span>
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {content.axisOptions.map((o) => (
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
          <p className="font-semibold text-slate-800">{t.privacyTitle}</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {t.privacyItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <label className="mt-3 flex cursor-pointer items-center gap-2 font-semibold text-slate-800">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#0B4DA2]"
              checked={form.consent}
              aria-describedby={errors.consent ? "consent-error" : undefined}
              onChange={(e) => update("consent", e.target.checked)}
            />
            {t.consentLabel}
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
        {submitting ? t.submitting : t.submit(selected.size)}
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
  const locale = useLocale();
  const t = useDict().apply;
  const sessionById = new Map(days.flatMap((d) => d.sessions.map((s) => [s.id, { day: d, session: s }] as const)));
  const succeeded = result.results.filter((r) => r.ok);
  const failed = result.results.filter((r) => !r.ok);

  return (
    <section aria-live="polite" className="flex flex-col gap-6">
      {succeeded.length > 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-xl font-bold text-emerald-900">{t.doneTitle}</h2>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-emerald-900 sm:text-base">
            {succeeded.map((r) => {
              const info = sessionById.get(r.workshop_id);
              return (
                <li key={r.workshop_id}>
                  ✔ {info?.day.day_label} {info?.session.round_label ?? r.round_label}{" "}
                  {info ? formatTimeRange(info.session.start_at, info.session.end_at) : ""} ·{" "}
                  {info?.session.topic ?? r.topic}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm text-emerald-800">{t.mailNote}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-xl font-bold text-red-900">{t.failTitle}</h2>
        </div>
      )}

      {failed.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-white p-6">
          <h3 className="font-bold text-red-800">{t.failedListTitle}</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-slate-700">
            {failed.map((r) => {
              const info = sessionById.get(r.workshop_id);
              const label = info?.session.round_label ?? r.round_label ?? t.unknownSession;
              const topic = info?.session.topic ?? r.topic;
              return (
                <li key={r.workshop_id}>
                  ✖ {label} {topic ? `· ${topic}` : ""} — <strong className="text-red-700">{r.message}</strong>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={localePath(locale, "/lookup")}
          className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 font-bold text-white shadow-card hover:bg-brand"
        >
          {t.toLookup}
        </Link>
        <Button type="button" variant="outline" onClick={onAnother}>
          {t.another}
        </Button>
      </div>
    </section>
  );
}
