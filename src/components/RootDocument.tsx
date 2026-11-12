import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@/app/globals.css";
import type { Locale } from "@/lib/i18n/config";
import { getDict } from "@/lib/i18n/dict";

/**
 * 언어별 루트 레이아웃((ko)/layout.tsx, (en)/layout.tsx)이 공유하는 문서 골격.
 * Pretendard는 외부 CDN 대신 패키지에서 번들해 자체 호스팅한다(CSP: 외부 스타일·폰트 차단).
 */
export function RootDocument({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <html lang={locale}>
      <body className="min-h-screen font-sans antialiased text-slate-900 bg-slate-50">
        <a href="#main-content" className="skip-link">
          {getDict(locale).common.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
