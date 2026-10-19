import type { Metadata } from "next";
import "./globals.css";
import { PROGRAM_NAME } from "@/lib/constants";

const TITLE = `${PROGRAM_NAME} | 경상국립대학교 글로컬대학30`;
const DESCRIPTION =
  "경상국립대학교 글로컬대학30 사업 — 2026학년도 AI-X 교과목 개발·인증을 위한 AI 활용 역량 강화 워크숍 신청·관리 포털";

// 링크 공유 미리보기(OG). 이미지는 scripts/build_og_image.py로 생성한다.
// 파비콘·앱 아이콘은 src/app/icon.png·apple-icon.png 파일 규칙으로 자동 연결된다.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://ai-x-course.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "AI-X 워크숍 신청 포털",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: PROGRAM_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body className="min-h-screen font-sans antialiased text-slate-900 bg-slate-50">
        <a href="#main-content" className="skip-link">
          본문 바로가기
        </a>
        {children}
      </body>
    </html>
  );
}
