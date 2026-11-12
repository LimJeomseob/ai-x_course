import { CertificateIssueForm } from "@/components/CertificateIssueForm";
import type { Locale } from "@/lib/i18n/config";
import { getDict } from "@/lib/i18n/dict";

export function CertificateView({ locale }: { locale: Locale }) {
  const dict = getDict(locale);
  const t = dict.cert;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.pageTitle}</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">{t.pageDesc}</p>
        {t.languageNote && <p className="mt-1 text-sm font-medium text-amber-700">{t.languageNote}</p>}
      </div>
      <CertificateIssueForm />
    </div>
  );
}
