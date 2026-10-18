import type { Metadata } from "next";
import "./globals.css";
import { PROGRAM_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${PROGRAM_NAME} | 경상국립대학교 글로컬대학30`,
  description:
    "경상국립대학교 글로컬대학30 사업 — 2026학년도 AI-X 교과목 개발·인증을 위한 AI 활용 역량 강화 워크숍 신청·관리 포털",
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
