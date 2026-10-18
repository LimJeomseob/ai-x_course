/** @type {import('next').NextConfig} */

// Vercel 네이티브 Next.js 런타임으로 배포한다(PRD §11).
// 참조 시스템의 GitHub Pages 정적 export 설정(output: 'export'·basePath·trailingSlash)은 제거했다 —
// 본인확인·취소·수료증 발급·자동 메일은 Route Handler(app/api/*, Node 런타임)에서 처리한다.
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    // nodemailer는 Node 내장 모듈(net/tls)에 의존하므로 번들링하지 않고 런타임에서 require한다.
    serverComponentsExternalPackages: ["nodemailer"],
  },
};

export default nextConfig;
