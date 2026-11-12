/** 본인 취소 확인 코드 메일(0006 cancel_codes). 순수 모듈 — 서버 라우트에서 발송한다. */
import type { Locale } from "@/lib/i18n/config";
import { escapeHtml } from "./templates";

export function renderCancelCodeMail(
  locale: Locale,
  name: string,
  sessionLabel: string,
  code: string
): { subject: string; html: string; text: string } {
  const en = locale === "en";
  const subject = en
    ? `[AI-X Workshop] Verification code to cancel your application: ${code}`
    : `[AI-X 워크숍] 신청 취소 확인 코드: ${code}`;
  const lines = en
    ? [
        `Dear ${name},`,
        `Use the verification code below to cancel your application for "${sessionLabel}".`,
        `Verification code: ${code}`,
        "The code is valid for 10 minutes.",
        "If you did not request this, please ignore this email — your application will not be cancelled.",
      ]
    : [
        `${name} 님, 안녕하십니까.`,
        `「${sessionLabel}」 신청 취소를 위한 확인 코드입니다.`,
        `확인 코드: ${code}`,
        "코드는 10분 동안 유효합니다.",
        "본인이 요청하지 않았다면 이 메일을 무시해 주세요. 신청은 취소되지 않습니다.",
      ];
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#f5f7fa">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#1a1a1a;font-size:15px;line-height:1.7">
<p>${escapeHtml(lines[0])}<br>${escapeHtml(lines[1])}</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#003876;margin:16px 0">${escapeHtml(code)}</p>
<p style="font-size:13px;color:#475569">${escapeHtml(lines[3])}<br>${escapeHtml(lines[4])}</p>
</div></body></html>`;
  return { subject, html, text: lines.join("\n") };
}
