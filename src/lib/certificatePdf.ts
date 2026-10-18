import { PROGRAM_NAME } from "@/lib/constants";
import { formatCertIssueDate, formatCertPeriod } from "@/lib/format";
import type { CertificateTemplate, CertificateTemplateText } from "@/lib/types";

// 수료증 PDF는 발급하는 사람의 브라우저에서 생성한다(참조 시스템 승계 — 서버는 채번·서식·업로드 토큰만 담당).
// 폰트는 반드시 public/fonts/의 가공본(scripts/process_cert_fonts.py 산출물)을 쓴다.
// @pdf-lib/fontkit의 TTFSubset은 홀수 길이 글리프 뒤에 패딩을 넣지 않아 short-loca 서브셋이
// 1바이트씩 밀리며 글자가 깨진다 — 가공본은 모든 글리프를 짝수 길이로 패딩해 이 버그를 회피한다.
const FONT_REGULAR_URL = "/fonts/NotoSansKR-Regular-Cert.ttf";
const FONT_BOLD_URL = "/fonts/NotoSansKR-Bold-Cert.ttf";

export interface CertificateFonts {
  regular: ArrayBuffer | Uint8Array;
  bold: ArrayBuffer | Uint8Array;
}

let cachedFonts: CertificateFonts | null = null;

async function loadFonts(): Promise<CertificateFonts> {
  if (cachedFonts) return cachedFonts;
  const [regular, bold] = await Promise.all([
    fetch(FONT_REGULAR_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_BOLD_URL).then((r) => r.arrayBuffer()),
  ]);
  cachedFonts = { regular, bold };
  return cachedFonts;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = parseInt(hex.replace("#", ""), 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}

/**
 * 수료증 서식 치환 값(PRD §5.5):
 * 프로그램명 = "AI-X 교과목 개발·인증을 위한 AI 활용 역량 강화 워크숍 {N차}({세션주제})",
 * 기간 = "2026.11.05. 13:30 ~ 15:30"
 */
export function buildCertificateValues(input: {
  certNo: string;
  name: string;
  affiliation: string;
  roundLabel: string;
  topic: string;
  startAt: string;
  endAt: string;
  issuedAt: string;
}): Record<string, string> {
  return {
    발급번호: input.certNo,
    성명: input.name,
    소속: input.affiliation,
    프로그램명: `${PROGRAM_NAME} ${input.roundLabel}(${input.topic})`,
    기간: formatCertPeriod(input.startAt, input.endAt),
    발급일: formatCertIssueDate(input.issuedAt),
  };
}

function substitute(text: string, values: Record<string, string>): string {
  return text.replace(/\{([^{}]+)\}/g, (whole, key: string) => values[key] ?? whole);
}

interface MeasurableFont {
  widthOfTextAtSize(text: string, size: number): number;
}

/** 공백 단위 그리디 줄바꿈. 한 단어가 폭을 넘으면 글자 단위로 자른다. */
export function wrapLines(font: MeasurableFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";

  const pushChars = (word: string) => {
    for (const ch of Array.from(word)) {
      const next = current + ch;
      if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(current);
        current = ch;
      } else {
        current = next;
      }
    }
  };

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
    } else {
      pushChars(word);
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** 서식 항목 하나의 글자 크기·줄 구성을 결정한다(maxWidth 축소, wrap 줄바꿈). */
export function layoutTextItem(
  font: MeasurableFont,
  item: CertificateTemplateText,
  text: string
): { size: number; lines: string[] } {
  if (item.wrap && item.maxWidth) {
    const { maxLines, minSize } = item.wrap;
    for (let size = item.size; size >= minSize; size -= 0.5) {
      const lines = wrapLines(font, text, size, item.maxWidth);
      if (lines.length <= maxLines) return { size, lines };
    }
    // 하한 크기에서도 넘치면 남는 줄을 마지막 줄에 합치고 그 줄만 폭에 맞게 더 줄인다.
    const lines = wrapLines(font, text, minSize, item.maxWidth);
    const kept = lines.slice(0, maxLines - 1);
    kept.push(lines.slice(maxLines - 1).join(" "));
    let size = minSize;
    while (size > 6 && kept.some((l) => font.widthOfTextAtSize(l, size) > item.maxWidth!)) size -= 0.5;
    return { size, lines: kept };
  }

  let size = item.size;
  if (item.maxWidth) {
    while (size > 6 && font.widthOfTextAtSize(text, size) > item.maxWidth) size -= 0.5;
  }
  return { size, lines: [text] };
}

/**
 * DB(certificate_templates)의 서식 JSON으로 수료증 PDF를 생성한다.
 * 원본 서식과 동일하게 이미지(테두리 프레임 → 직인)를 먼저, 텍스트를 나중에 그린다.
 * flowGroup: 앞 항목이 여러 줄이 되면 같은 그룹의 뒤 항목을 그만큼 아래로 내린다.
 */
export async function renderCertificateFromTemplate(
  template: CertificateTemplate,
  values: Record<string, string>,
  fonts?: CertificateFonts
): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, { default: fontkit }, resolvedFonts] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    fonts ? Promise.resolve(fonts) : loadFonts(),
  ]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFont = await pdfDoc.embedFont(resolvedFonts.regular, { subset: true });
  const boldFont = await pdfDoc.embedFont(resolvedFonts.bold, { subset: true });

  const page = pdfDoc.addPage([template.page.width, template.page.height]);

  for (const image of template.images) {
    const embedded = await pdfDoc.embedJpg(dataUrlToBytes(image.dataUrl));
    page.drawImage(embedded, { x: image.x, y: image.y, width: image.w, height: image.h });
  }

  const flowOffset = new Map<string, number>();

  for (const item of template.texts) {
    const text = substitute(item.text, values);
    if (!text) continue;

    const font = item.weight === "bold" ? boldFont : regularFont;
    const { size, lines } = layoutTextItem(font, item, text);
    const offset = item.flowGroup ? flowOffset.get(item.flowGroup) ?? 0 : 0;
    const lineStep = size * (item.wrap?.lineHeight ?? 1.25);
    const { r, g, b } = hexToRgb(item.color ?? "#000000");

    lines.forEach((line, index) => {
      const x =
        item.align === "center"
          ? (template.page.width - font.widthOfTextAtSize(line, size)) / 2
          : (item.x ?? 0);
      page.drawText(line, { x, y: item.y - offset - index * lineStep, size, font, color: rgb(r, g, b) });
    });

    if (item.flowGroup && lines.length > 1) {
      flowOffset.set(item.flowGroup, offset + (lines.length - 1) * lineStep);
    }
  }

  return pdfDoc.save();
}

/** 스토리지 키는 ASCII만 허용 — 발급번호에서 숫자·하이픈만 남긴다(제2026-071호 → 2026-071) */
export function buildCertificatePdfPath(round: number, certNo: string): string {
  return `${round}/${certNo.replace(/[^0-9A-Za-z-]/g, "")}.pdf`;
}
