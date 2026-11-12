import Link from "next/link";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { localePath, type Locale } from "@/lib/i18n/config";
import { getContent } from "@/lib/i18n/content";
import { getDict } from "@/lib/i18n/dict";

export function Header({ locale }: { locale: Locale }) {
  const t = getDict(locale).header;
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={localePath(locale, "/")} className="flex items-center gap-3 rounded" aria-label={t.homeAria}>
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-white"
          >
            GNU
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-xs font-medium text-slate-500">{t.orgLine}</span>
            <span className="text-sm font-bold text-brand sm:text-base">{getContent(locale).programName}</span>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <LanguageSwitch />
          <Link
            href="/admin/login"
            className="rounded-lg px-3 py-1.5 text-sm font-bold text-brand transition-colors hover:bg-brand/5"
            aria-label={t.adminAria}
          >
            {t.admin}
          </Link>
        </div>
      </div>
    </header>
  );
}
