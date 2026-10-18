"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import { formatPhoneInput } from "@/lib/format";
import { fieldErrors, lookupSchema, type LookupInput } from "@/lib/validation";

interface IdentityFormProps {
  submitLabel: string;
  loading: boolean;
  onSubmit: (input: LookupInput) => void;
}

/** 성명 + 연락처 본인확인 폼(신청내역조회·수료증 발급 공용, PRD §5.3·§5.5) */
export function IdentityForm({ submitLabel, loading, onSubmit }: IdentityFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = lookupSchema.safeParse({ name, phone });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:grid-cols-[1fr_1fr_auto] sm:items-start sm:p-6"
    >
      <FormField label="성명" required error={errors.name}>
        {(p) => <input {...p} className={inputBaseClass} value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />}
      </FormField>
      <FormField label="연락처" required error={errors.phone}>
        {(p) => (
          <input
            {...p}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="010-1234-5678"
            className={inputBaseClass}
            value={phone}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
          />
        )}
      </FormField>
      <Button type="submit" disabled={loading} className="sm:mt-7">
        {loading ? "확인 중..." : submitLabel}
      </Button>
    </form>
  );
}
