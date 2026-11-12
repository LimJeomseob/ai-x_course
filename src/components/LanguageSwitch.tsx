"use client";

import { usePathname } from "next/navigation";
import { localePath, stripLocale, type Locale } from "@/lib/i18n/config";
import { useDict, useLocale } from "@/lib/i18n/LocaleProvider";

/**
 * 한국어 ↔ 영어 전환. 같은 탭의 다른 언어 주소로 이동한다(/apply ↔ /en/apply).
 * 언어별 루트 레이아웃(<html lang>)이 다르므로 일반 링크로 전체 문서를 새로 불러온다.
 */
export function LanguageSwitch() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useDict().header;
  const target: Locale = locale === "ko" ? "en" : "ko";

  return (
    <a
      href={localePath(target, stripLocale(pathname))}
      hrefLang={target}
      lang={target}
      aria-label={t.switchAria}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700 transition-colors hover:border-brand hover:text-brand"
    >
      {t.switchLabel}
    </a>
  );
}
