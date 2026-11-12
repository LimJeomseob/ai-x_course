import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CertificateFonts } from "@/lib/certificatePdf";

/**
 * 서버에서 수료증 PDF를 만들 때 쓰는 폰트(public/fonts 가공본)를 파일로 읽는다.
 * Vercel 함수 번들에 포함되도록 next.config.mjs의 outputFileTracingIncludes에 등록되어 있다.
 */
let cached: Promise<CertificateFonts> | null = null;

export function loadCertificateFontsFromDisk(): Promise<CertificateFonts> {
  if (!cached) {
    const dir = path.join(process.cwd(), "public", "fonts");
    cached = Promise.all([
      readFile(path.join(dir, "NotoSansKR-Regular-Cert.ttf")),
      readFile(path.join(dir, "NotoSansKR-Bold-Cert.ttf")),
    ])
      .then(([regular, bold]) => ({ regular: new Uint8Array(regular), bold: new Uint8Array(bold) }))
      .catch((err) => {
        cached = null; // 다음 요청에서 다시 시도
        throw err;
      });
  }
  return cached;
}
