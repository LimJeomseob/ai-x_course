/** @type {import('next').NextConfig} */

// Vercel 네이티브 Next.js 런타임으로 배포한다(PRD §11).
// 본인확인·신청·취소·수료증 발급·자동 메일은 Route Handler(app/api/*, Node 런타임)에서 처리한다.
//
// 보안 원칙: 미들웨어·rewrites/redirects·Server Actions·next/image는 쓰지 않는다
// (Next.js 보안 권고의 다수가 이 기능들에 걸려 있다). 영문 화면도 app/(en)/en/* 실제 경로다.

const isDev = process.env.NODE_ENV !== "production";

// 브라우저가 직접 통신하는 외부 출처는 Supabase뿐이다(조회·관리자 화면·Storage).
function supabaseOrigins() {
  const origins = ["https://*.supabase.co", "wss://*.supabase.co"];
  try {
    const url = new URL((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim());
    if (!url.hostname.endsWith(".supabase.co")) {
      origins.push(url.origin, `wss://${url.host}`);
    }
  } catch {
    // 환경변수 미설정(빌드 전용 환경) — 기본 출처만 허용
  }
  return origins.join(" ");
}

// 정적 CSP(nonce 미사용). Next.js App Router의 인라인 부트스트랩 스크립트 때문에 script-src에
// 'unsafe-inline'이 필요하다. 외부 스크립트·프레임 삽입·플러그인은 모두 차단한다.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins()}${isDev ? " ws:" : ""}`,
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: false,
  },
  // next/image를 쓰지 않으므로 이미지 최적화 엔드포인트(/_next/image)를 비활성화한다.
  images: { unoptimized: true },
  // nodemailer는 Node 내장 모듈(net/tls)에 의존하므로 번들링하지 않고 런타임에서 require한다.
  serverExternalPackages: ["nodemailer"],
  // 서버 수료증 PDF 생성에 쓰는 폰트를 함수 번들에 포함한다(src/lib/certificateFonts.ts).
  outputFileTracingIncludes: {
    "/api/issue-certificate": ["./public/fonts/*.ttf"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
