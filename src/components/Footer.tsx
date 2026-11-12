import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants";
import type { Locale } from "@/lib/i18n/config";
import { getContent } from "@/lib/i18n/content";
import { getDict } from "@/lib/i18n/dict";

export function Footer({ locale }: { locale: Locale }) {
  const t = getDict(locale).footer;
  const c = getContent(locale);
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-slate-500 sm:px-6">
        <p className="font-semibold text-slate-700">
          {c.orgName} {t.projectLine}
        </p>
        <p className="mt-1">
          {c.programYearTitle} · {c.programName}
        </p>
        <p className="mt-1">
          {t.organizer}: {c.organizerName}
        </p>
        <p className="mt-1">
          {t.contact}: {CONTACT_PHONE}, {CONTACT_EMAIL}
        </p>
        <p className="mt-1">{t.privacy}</p>
      </div>
    </footer>
  );
}
