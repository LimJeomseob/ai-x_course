"use client";

import { FormEvent, useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import { AXIS_OPTIONS } from "@/lib/constants";
import { formatPhoneInput } from "@/lib/format";
import { adminApplicationSchema, fieldErrors } from "@/lib/validation";
import type { SessionOption } from "@/lib/workshops";
import { APPLICATION_STATUSES, type ApplicationStatus, type ApplicationWithWorkshop } from "@/lib/types";

interface Props {
  open: boolean;
  sessions: SessionOption[];
  rows: ApplicationWithWorkshop[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

const EMPTY = { workshopId: "", name: "", affiliation: "", idNumber: "", axisParticipant: "", phone: "", email: "", consent: false };

/**
 * 관리자 대리등록(PRD §6.2) — 오픈·마감·정원 검사 생략(DB 트리거 is_admin 예외),
 * 동일 세션 중복은 confirm 후 진행(created_by_admin=true 행은 중복 제약 대상 아님).
 */
export function AddParticipantModal({ open, sessions, rows, onClose, onSaved }: Props) {
  const titleId = useId();
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState<ApplicationStatus>("신청완료");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function update(key: keyof typeof EMPTY, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    const parsed = adminApplicationSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    const v = parsed.data;
    const digits = v.phone.replace(/[^0-9]/g, "");
    const duplicate = rows.find(
      (r) =>
        r.workshop_id === v.workshopId &&
        r.status !== "취소" &&
        (r.phone_digits === digits || r.id_number.trim().toLowerCase() === v.idNumber.toLowerCase())
    );
    if (duplicate && !window.confirm(`같은 세션에 이미 신청된 정보가 있습니다(${duplicate.name}, ${duplicate.status}). 그래도 등록하시겠습니까?`)) {
      return;
    }

    setSaving(true);
    const { error } = await createSupabaseBrowserClient().from(TABLES.APPLICATIONS).insert({
      workshop_id: v.workshopId,
      name: v.name,
      affiliation: v.affiliation,
      id_number: v.idNumber,
      axis_participant: v.axisParticipant,
      phone: v.phone,
      email: v.email.toLowerCase(),
      consent: true,
      status,
      created_by_admin: true,
    });
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    const session = sessions.find((s) => s.id === v.workshopId);
    setForm(EMPTY);
    onSaved(`${v.name} — ${session?.day.day_label} ${session?.round_label} 참여자 등록 완료`);
  }

  return (
    <Modal open={open} onClose={onClose} titleId={titleId}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <h2 id={titleId} className="text-xl font-bold text-slate-900">참여자 추가(관리자 등록)</h2>
        <p className="text-xs text-slate-500">현장 등록·추가 인원·소급 등록용입니다. 신청기간·마감·정원 검사를 적용하지 않습니다.</p>
        <FormField label="세션" required error={errors.workshopId}>
          {(p) => (
            <select {...p} className={inputBaseClass} value={form.workshopId} onChange={(e) => update("workshopId", e.target.value)}>
              <option value="">세션 선택</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.day.day_label} {s.round_label} · {s.topic}</option>)}
            </select>
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="성명" required error={errors.name}>{(p) => <input {...p} className={inputBaseClass} value={form.name} onChange={(e) => update("name", e.target.value)} />}</FormField>
          <FormField label="소속" required error={errors.affiliation}>{(p) => <input {...p} className={inputBaseClass} value={form.affiliation} onChange={(e) => update("affiliation", e.target.value)} />}</FormField>
          <FormField label="교번/식별번호" required error={errors.idNumber}>{(p) => <input {...p} className={inputBaseClass} value={form.idNumber} onChange={(e) => update("idNumber", e.target.value)} />}</FormField>
          <FormField label="연락처" required error={errors.phone}>{(p) => <input {...p} type="tel" className={inputBaseClass} value={form.phone} onChange={(e) => update("phone", formatPhoneInput(e.target.value))} />}</FormField>
          <FormField label="이메일(선택)" error={errors.email}>{(p) => <input {...p} type="email" className={inputBaseClass} value={form.email} onChange={(e) => update("email", e.target.value)} />}</FormField>
          <FormField label="AXIS 참여여부" required error={errors.axisParticipant}>
            {(p) => (
              <select {...p} className={inputBaseClass} value={form.axisParticipant} onChange={(e) => update("axisParticipant", e.target.value)}>
                <option value="">선택</option>
                {AXIS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </FormField>
          <FormField label="상태" required>
            {(p) => (
              <select {...p} className={inputBaseClass} value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
                {APPLICATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            )}
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" checked={form.consent} onChange={(e) => update("consent", e.target.checked)} />
          개인정보 수집·이용 동의를 오프라인으로 받았습니다.
        </label>
        {errors.consent && <p role="alert" className="text-xs font-medium text-red-600">{errors.consent}</p>}
        {saveError && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{saveError}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>닫기</Button>
          <Button type="submit" disabled={saving}>{saving ? "저장 중..." : "등록"}</Button>
        </div>
      </form>
    </Modal>
  );
}
