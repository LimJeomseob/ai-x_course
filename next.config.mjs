/** @type {import('next').NextConfig} */

// Vercel 네이티브 Next.js 런타임으로 배포한다(PRD §11).
// 참조 시스템의 GitHub Pages 정적 export 설정(output: 'export'·basePath·trailingSlash)은 제거했다 —
// 본인확인·취소·수료증 발급·자동 메일은 Route Handler(app/api/*, Node 런타임)에서 처리한다.

const isDev = process.env.NODE_ENV !== "production";

// Supabase 프로젝트 출처(REST·Auth·Storage는 https, Realtime은 wss)
function supabaseOrigins() {
  try {
    const { protocol, host } = new URL((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim());
    return [`${protocol}//${host}`, `${protocol === "http:" ? "ws:" : "wss:"}//${host}`];
  } catch {
    return [];
  }
}

// 강제 적용 CSP — 페이지 동작과 무관한 지시어만 둔다(클릭재킹·<base> 변조·외부 폼 전송·플러그인 차단).
const enforcedCsp = ["frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join("; ");

// 전체 CSP는 Report-Only로만 보낸다(차단 없음). 브라우저 콘솔에 위반 보고가 없음을
// 운영에서 확인한 뒤 Content-Security-Policy로 승격한다(docs/security-audit-2026-11-17.md).
const reportOnlyCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "img-src 'self' data: blob:",
  `connect-src ${["'self'", "https://*.supabase.co", "wss://*.supabase.co", ...supabaseOrigins()].join(" ")}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Content-Security-Policy", value: enforcedCsp },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: false,
  },
  // nodemailer는 Node 내장 모듈(net/tls)에 의존하므로 번들링하지 않고 런타임에서 require한다.
  serverExternalPackages: ["nodemailer"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // 본인확인·관리자·Cron 응답은 어떤 캐시에도 저장되지 않게 한다.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
