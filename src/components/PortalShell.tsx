import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PortalTabs } from "@/components/PortalTabs";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/config";

/** 공개 포털 공통 틀(헤더·탭·푸터) — 한국어(/)와 영어(/en) 레이아웃이 함께 쓴다. */
export function PortalShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <LocaleProvider locale={locale}>
      <div className="flex min-h-screen flex-col">
        <Header locale={locale} />
        <PortalTabs />
        <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
        <Footer locale={locale} />
      </div>
    </LocaleProvider>
  );
}
