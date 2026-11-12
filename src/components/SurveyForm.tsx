"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { publicPost } from "@/lib/adminApi";
import { SURVEY_LIKERT_QUESTIONS, type LikertKey } from "@/lib/constants";
import { formatTimeRange } from "@/lib/format";
import { getContent } from "@/lib/i18n/content";
import { useDict, useLocale } from "@/lib/i18n/LocaleProvider";
import { fieldErrors, getSchemas } from "@/lib/validation";
import { fetchProgramData, type DayWithSessions } from "@/lib/workshops";

type Answers = {
  workshopRound: number | "";
  axisParticipant: string;
  collegeGroup: string;
  awarenessPath: string;
  o1: string;
  o2: string;
} & Record<LikertKey, number | "">;

const EMPTY: Answers = {
  workshopRound: "",
  axisParticipant: "",
  collegeGroup: "",
  awarenessPath: "",
  o1: "",
  o2: "",
  q1: "",
  q2: "",
  q3: "",
  q4: "",
  q5: "",
  q6: "",
  q7: "",
};

function RadioGroup({
  name,
  legend,
  options,
  value,
  error,
  onChange,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string }[];
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const requiredText = useDict().common.required;
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="text-sm font-semibold text-slate-800">
        {legend}
        <span className="ml-1 text-red-600" aria-hidden="true">*</span>
        <span className="sr-only">{requiredText}</span>
      </legend>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="h-4 w-4 accent-[#0B4DA2]"
            />
            {o.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** 만족도조사(PRD §5.4, 문항 v0.9) */
export function SurveyForm() {
  const searchParams = useSearchParams();
  const locale = useLocale();
  const dict = useDict();
  const t = dict.survey;
  const content = getContent(locale);
  const [days, setDays] = useState<DayWithSessions[]>([]);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchProgramData(locale)
      .then((d) => setDays(d.days))
      .catch(() => setSubmitError(dict.common.sessionsLoadError));
  }, [locale, dict]);

  useEffect(() => {
    const round = Number(searchParams.get("round"));
    if (round) setAnswers((a) => ({ ...a, workshopRound: round }));
  }, [searchParams]);

  function set<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = getSchemas(locale).surveySchema.safeParse({
      ...answers,
      workshopRound: answers.workshopRound === "" ? 0 : answers.workshopRound,
      ...Object.fromEntries(
        SURVEY_LIKERT_QUESTIONS.map((q) => [q.key, answers[q.key] === "" ? 0 : answers[q.key]])
      ),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    // 제출은 서버(/api/survey)가 요청 횟수 제한·검증 후 저장한다(세션 표기는 서버가 DB에서 채운다).
    setSubmitting(true);
    try {
      await publicPost("/api/survey", { ...parsed.data, locale }, dict.api.surveyFailed);
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : dict.api.surveyFailed);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-bold text-emerald-900">{t.doneTitle}</h2>
        <p className="mt-2 text-sm text-emerald-800">
          {t.doneBody}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => {
            setAnswers({ ...EMPTY, axisParticipant: answers.axisParticipant, collegeGroup: answers.collegeGroup });
            setDone(false);
          }}
        >
          {t.another}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <FormField label={t.session} required error={errors.workshopRound} hint={t.sessionHint}>
          {(p) => (
            <select
              {...p}
              className={inputBaseClass}
              value={answers.workshopRound}
              onChange={(e) => set("workshopRound", e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">{t.sessionPlaceholder}</option>
              {days.map((day) => (
                <optgroup key={day.id} label={`${day.day_label} · ${day.instructor} ${day.instructor_title}`}>
                  {day.sessions.map((s) => (
                    <option key={s.id} value={s.round}>
                      {s.round_label} {formatTimeRange(s.start_at, s.end_at)} · {s.topic}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </FormField>
        <RadioGroup
          name="axisParticipant"
          legend={t.axisLegend}
          options={content.axisOptions.map((o) => ({ value: o.value, label: o.surveyLabel }))}
          value={answers.axisParticipant}
          error={errors.axisParticipant}
          onChange={(v) => set("axisParticipant", v)}
        />
        <RadioGroup
          name="collegeGroup"
          legend={t.collegeLegend}
          options={content.collegeGroupOptions}
          value={answers.collegeGroup}
          error={errors.collegeGroup}
          onChange={(v) => set("collegeGroup", v)}
        />
        <RadioGroup
          name="awarenessPath"
          legend={t.awarenessLegend}
          options={content.awarenessOptions}
          value={answers.awarenessPath}
          error={errors.awarenessPath}
          onChange={(v) => set("awarenessPath", v)}
        />
      </section>

      <section className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <p className="text-sm text-slate-500">{t.scaleGuide}</p>
        {content.likertQuestions.map((q) => (
          <RadioGroup
            key={q.key}
            name={q.key}
            legend={`${q.key.toUpperCase()}. ${q.text}`}
            options={content.likertLabels.map((label, i) => ({ value: String(i + 1), label }))}
            value={answers[q.key] === "" ? "" : String(answers[q.key])}
            error={errors[q.key]}
            onChange={(v) => set(q.key, Number(v))}
          />
        ))}
      </section>

      <section className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        {content.openQuestions.map((q) => (
          <FormField key={q.key} label={`${q.key.toUpperCase()}. ${q.text} ${t.optional}`} error={errors[q.key]} hint={t.charCount(answers[q.key].length, q.maxLength)}>
            {(p) => (
              <textarea
                {...p}
                rows={4}
                maxLength={q.maxLength}
                className={inputBaseClass}
                value={answers[q.key]}
                onChange={(e) => set(q.key, e.target.value)}
              />
            )}
          </FormField>
        ))}
      </section>

      {submitError && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
          {submitError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={submitting} className="self-center">
        {submitting ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
