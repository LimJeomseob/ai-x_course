"use client";

import { useId } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { localePath } from "@/lib/i18n/config";
import { useDict, useLocale } from "@/lib/i18n/LocaleProvider";

interface SurveyPromptModalProps {
  open: boolean;
  round?: number;
  onClose: () => void;
}

/** 수료증 발급 직후 만족도조사 참여를 안내하는 팝업. 접근성/포커스트랩/ESC/배경클릭 닫힘은 ui/Modal.tsx가 담당 */
export function SurveyPromptModal({ open, round, onClose }: SurveyPromptModalProps) {
  const titleId = useId();
  const locale = useLocale();
  const dict = useDict();
  const t = dict.surveyPrompt;
  const base = localePath(locale, "/survey");
  const surveyHref = round ? `${base}?round=${round}` : base;

  return (
    <Modal open={open} onClose={onClose} titleId={titleId}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-bold text-slate-900">
            {t.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.common.close}
            className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              &times;
            </span>
          </button>
        </div>

        <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
          {t.body}
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="sm:w-auto">
            {t.later}
          </Button>
          <Link
            href={surveyHref}
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand sm:w-auto sm:text-base"
          >
            {t.go}
          </Link>
        </div>
      </div>
    </Modal>
  );
}
