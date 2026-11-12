import { LookupForm } from "@/components/LookupForm";
import type { Locale } from "@/lib/i18n/config";
import { getDict } from "@/lib/i18n/dict";

export function LookupView({ locale }: { locale: Locale }) {
  const dict = getDict(locale);
  const t = dict.lookup;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.pageTitle}</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">{t.pageDesc}</p>
      </div>
      <LookupForm />
    </div>
  );
}
