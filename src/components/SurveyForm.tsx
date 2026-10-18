"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import {
  AWARENESS_PATH_OPTIONS,
  AXIS_OPTIONS,
  COLLEGE_GROUP_OPTIONS,
  LIKERT_SCALE_LABELS,
  SURVEY_LIKERT_QUESTIONS,
  SURVEY_OPEN_QUESTIONS,
  type LikertKey,
} from "@/lib/constants";
import { formatTimeRange } from "@/lib/format";
import { fieldErrors, surveySchema } from "@/lib/validation";
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
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="text-sm font-semibold text-slate-800">
        {legend}
        <span className="ml-1 text-red-600" aria-hidden="true">*</span>
        <span className="sr-only">(필수)</span>
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
  const [days, setDays] = useState<DayWithSessions[]>([]);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchProgramData()
      .then((d) => setDays(d.days))
      .catch(() => setSubmitError("세션 정보를 불러오지 못했습니다. 새로고침해 주세요."));
  }, []);

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
    const parsed = surveySchema.safeParse({
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
    const v = parsed.data;
    const session = days.flatMap((d) => d.sessions).find((s) => s.round === v.workshopRound);
    if (!session) {
      setErrors({ workshopRound: "참여 세션을 선택해 주세요." });
      return;
    }

    setSubmitting(true);
    const { error } = await createSupabaseBrowserClient()
      .from(TABLES.SURVEY)
      .insert({
        workshop_round: v.workshopRound,
        workshop: `${session.round_label} · ${session.topic}`,
        axis_participant: v.axisParticipant,
        college_group: v.collegeGroup,
        awareness_path: v.awarenessPath,
        q1: v.q1,
        q2: v.q2,
        q3: v.q3,
        q4: v.q4,
        q5: v.q5,
        q6: v.q6,
        q7: v.q7,
        o1: v.o1,
        o2: v.o2,
      });
    setSubmitting(false);
    if (error) {
      setSubmitError("제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setDone(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (done) {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-bold text-emerald-900">응답해 주셔서 감사합니다</h2>
        <p className="mt-2 text-sm text-emerald-800">
          보내주신 의견은 차기 워크숍 기획과 AI-X 교과목 지원 개선에 활용하겠습니다. 다른 세션에 참여하셨다면 세션별로 한 번씩
          응답해 주세요.
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
          다른 세션 응답하기
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <FormField label="참여 세션" required error={errors.workshopRound} hint="세션별로 1회씩 응답해 주세요.">
          {(p) => (
            <select
              {...p}
              className={inputBaseClass}
              value={answers.workshopRound}
              onChange={(e) => set("workshopRound", e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">세션을 선택해 주세요</option>
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
          legend="AI-X 교과목 개발·인증 신청 여부"
          options={AXIS_OPTIONS.map((o) => ({ value: o.value, label: o.value === "axis" ? "AXIS 참여 교원" : o.value === "faculty" ? "그 외 전임교원" : "기타" }))}
          value={answers.axisParticipant}
          error={errors.axisParticipant}
          onChange={(v) => set("axisParticipant", v)}
        />
        <RadioGroup
          name="collegeGroup"
          legend="소속 계열"
          options={COLLEGE_GROUP_OPTIONS.map((o) => ({ value: o, label: o }))}
          value={answers.collegeGroup}
          error={errors.collegeGroup}
          onChange={(v) => set("collegeGroup", v)}
        />
        <RadioGroup
          name="awarenessPath"
          legend="워크숍을 알게 된 경로"
          options={AWARENESS_PATH_OPTIONS.map((o) => ({ value: o, label: o }))}
          value={answers.awarenessPath}
          error={errors.awarenessPath}
          onChange={(v) => set("awarenessPath", v)}
        />
      </section>

      <section className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <p className="text-sm text-slate-500">1점(전혀 그렇지 않다) ~ 5점(매우 그렇다)</p>
        {SURVEY_LIKERT_QUESTIONS.map((q) => (
          <RadioGroup
            key={q.key}
            name={q.key}
            legend={`${q.key.toUpperCase()}. ${q.text}`}
            options={LIKERT_SCALE_LABELS.map((label, i) => ({ value: String(i + 1), label }))}
            value={answers[q.key] === "" ? "" : String(answers[q.key])}
            error={errors[q.key]}
            onChange={(v) => set(q.key, Number(v))}
          />
        ))}
      </section>

      <section className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        {SURVEY_OPEN_QUESTIONS.map((q) => (
          <FormField key={q.key} label={`${q.key.toUpperCase()}. ${q.text} (선택)`} error={errors[q.key]} hint={`${answers[q.key].length}/${q.maxLength}자`}>
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
        {submitting ? "제출 중..." : "만족도조사 제출"}
      </Button>
    </form>
  );
}
