"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { inputBaseClass } from "@/components/ui/FormField";
import { useDict } from "@/lib/i18n/LocaleProvider";
import type { LookupResultItem } from "@/lib/types";

interface CancelConfirmModalProps {
  item: LookupResultItem | null;
  loading: boolean;
  /** 확인 코드를 보낸 주소(가림 처리). null이면 1단계(코드 발송 전) */
  codeSentTo: string | null;
  error: string | null;
  onRequestCode: () => void;
  onConfirm: (code: string) => void;
  onClose: () => void;
}

/**
 * 신청 취소 확인(2단계). 1단계에서 신청 이메일로 6자리 확인 코드를 보내고,
 * 2단계에서 코드를 입력해야 취소된다(성명·연락처만 아는 제3자의 취소 방지).
 */
export function CancelConfirmModal({ item, loading, codeSentTo, error, onRequestCode, onConfirm, onClose }: CancelConfirmModalProps) {
  const titleId = useId();
  const codeId = useId();
  const dict = useDict();
  const t = dict.cancel;
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  // 대상이 바뀌거나 닫히면 입력을 비운다.
  useEffect(() => {
    setCode("");
    setCodeError(null);
  }, [item?.applicationId, codeSentTo]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setCodeError(dict.validation.codeFormat);
      return;
    }
    setCodeError(null);
    onConfirm(code);
  }

  const message = codeError ?? error;

  return (
    <Modal open={!!item} onClose={onClose} titleId={titleId}>
      {item && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <h2 id={titleId} className="text-xl font-bold text-slate-900">
            {t.title}
          </h2>
          <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
            <strong>
              {item.dayLabel} {item.roundLabel} · {item.topic}
            </strong>{" "}
            {t.body}
          </p>

          {codeSentTo ? (
            <div className="flex flex-col gap-2">
              <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                {t.codeSent(codeSentTo)}
              </p>
              <label htmlFor={codeId} className="text-sm font-semibold text-slate-800">
                {t.codeLabel}
              </label>
              <input
                id={codeId}
                className={inputBaseClass}
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                aria-invalid={!!message}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              />
              <button
                type="button"
                onClick={onRequestCode}
                disabled={loading}
                className="self-start text-sm font-medium text-accent underline underline-offset-2 hover:text-brand disabled:text-slate-400"
              >
                {t.resend}
              </button>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{t.codeGuide}</p>
          )}

          {message && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {message}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              {t.back}
            </Button>
            {codeSentTo ? (
              <Button type="submit" variant="danger" disabled={loading}>
                {loading ? t.confirming : t.confirm}
              </Button>
            ) : (
              <Button type="button" variant="danger" onClick={onRequestCode} disabled={loading}>
                {loading ? t.sending : t.sendCode}
              </Button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
