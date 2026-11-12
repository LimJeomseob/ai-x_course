import { Suspense } from "react";
import { ApplicationForm } from "@/components/ApplicationForm";
import type { Locale } from "@/lib/i18n/config";
import { getContent } from "@/lib/i18n/content";
import { getDict } from "@/lib/i18n/dict";

export function ApplyView({ locale }: { locale: Locale }) {
  const dict = getDict(locale);
  const t = dict.apply;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.pageTitle}</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">{t.pageDesc(getContent(locale).deadlineNotice)}</p>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-500">{dict.common.loading}</p>}>
        <ApplicationForm />
      </Suspense>
    </div>
  );
}
