import type { Metadata } from "next";
import { RootDocument } from "@/components/RootDocument";
import { getContent } from "@/lib/i18n/content";

const { programName } = getContent("en");
const TITLE = `${programName} | Gyeongsang National University`;
const DESCRIPTION =
  "Gyeongsang National University Glocal University 30 — application portal for the AY 2026 AI competency workshop for AI-X course development and certification.";

// 영문 포털(/en/*) 전용 루트 레이아웃. 한국어 포털·관리자 화면은 (ko)/layout.tsx를 쓴다.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://ai-x-course.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { languages: { ko: "/" } },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "AI-X Workshop Portal",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: programName }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function EnglishRootLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument locale="en">{children}</RootDocument>;
}
