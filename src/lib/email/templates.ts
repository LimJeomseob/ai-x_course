/**
 * 자동 안내 메일 템플릿(PRD §9.3). 서버(발송)와 관리자 화면(미리보기)이 함께 쓰는 순수 모듈이다.
 * email_templates 행의 subject/body_html/body_text가 NULL이면 아래 기본 템플릿을 사용한다.
 * 치환 변수는 {변수명} 형식. HTML 본문의 스칼라 값은 이스케이프하고, 표·링크처럼 미리 만든
 * HTML 조각(htmlVars)은 그대로 삽입한다.
 */
import type { EmailType } from "@/lib/types";
import { CONTACT_EMAIL } from "@/lib/constants";
import type { Locale } from "@/lib/i18n/config";

export interface EmailTemplateContent {
  subject: string;
  html: string;
  text: string;
}

export const SENDER_NAME = "임점섭 (경상국립대학교 AI융합원)";
export const REPLY_TO = CONTACT_EMAIL;

/** 모든 메일 하단 고정 서명(PRD §9.1) */
export const SIGNATURE_LINES = [
  "선임연구원 임 점 섭 교육학 박사",
  "경상국립대학교 AI융합원",
  "T. 055-772-4452 / M. 010-2014-4424",
  `E. ${CONTACT_EMAIL}`,
];

/** 영문 메일 서명 — 영문 직함·기관명은 대학 공식 표기 확인 필요 */
export const SIGNATURE_LINES_EN = [
  "Jeomseob Lim, Ph.D. (Education), Senior Researcher",
  "AI Convergence Institute, Gyeongsang National University",
  "T. +82-55-772-4452 / M. +82-10-2014-4424",
  `E. ${CONTACT_EMAIL}`,
];

export const PAID_ACCOUNT_NOTICE = "Claude(또는 ChatGPT) 유료계정 사용 지원(D-1 안내 예정)";

export const STATUS_MESSAGES: Record<string, string> = {
  신청완료: "정상 접수되었습니다.",
  대기: "정원 초과로 대기자로 등록되었습니다. 결원 발생 시 순차 안내드립니다.",
  취소: "신청이 취소 처리되었습니다. 재참여를 원하시면 포털에서 재신청해 주세요.",
  이수: "이수 처리되었습니다. 포털 [수료증 발급]에서 수료증을 내려받을 수 있습니다.",
};

export const STATUS_MESSAGES_EN: Record<string, string> = {
  신청완료: "Your application has been received.",
  대기: "The session is full, so you have been placed on the waiting list. We will contact you in order if a seat opens.",
  취소: "Your application has been cancelled. If you would like to attend, please apply again through the portal.",
  이수: "Your attendance has been recorded as completed. You can download your certificate from the portal under [Certificate].",
};

/**
 * 영문 기본 템플릿. 치환 변수 이름은 한국어 템플릿과 같다({성명} 등).
 * 관리자 화면의 템플릿 수정(email_templates)은 한국어 메일에만 적용되고, 영문 메일은 항상 이 기본값을 쓴다.
 */
export const DEFAULT_TEMPLATES_EN: Record<EmailType, EmailTemplateContent> = {
  M1: {
    subject: "[AI-X Workshop] Your application results ({신청건수})",
    html: `<p>Dear {성명},<br>Here are the results of your application for the AI Competency Workshop for AI-X Course Development and Certification.</p>
{세션목록표}
<p>{정원대기안내}</p>
<h3>Please note</h3>
<p>{협조사항}</p>
<h3>How to cancel</h3>
<p>{취소방법}</p>`,
    text: `Dear {성명},
Here are the results of your application for the AI Competency Workshop for AI-X Course Development and Certification.

[Sessions]
{세션목록표}

{정원대기안내}

[Please note]
{협조사항}

[How to cancel]
{취소방법}`,
  },
  M2: {
    subject: "[AI-X Workshop] Application status changed — {차수}: {변경후상태}",
    html: `<p>Dear {성명},<br>The status of your workshop application has changed as follows.</p>
{변경목록표}
<p>{안내문}</p>`,
    text: `Dear {성명},
The status of your workshop application has changed as follows.

{변경목록표}

{안내문}`,
  },
  M3: {
    subject: "[AI-X Workshop] {운영일} workshop — attendance guide (3 days before)",
    html: `<p>Dear {성명},<br>Here is the guide for the workshop on {운영일} that you applied for.</p>
{세션목록}
<ul>
  <li><strong>Venue</strong>: {장소}</li>
  <li><strong>Instructor</strong>: {강사}</li>
</ul>
<h3>Please note</h3>
<p>{협조사항}</p>
{사전학습URL}
<h3>Confirming attendance and cancelling</h3>
<p>{참석확인취소방법}</p>`,
    text: `Dear {성명},
Here is the guide for the workshop on {운영일} that you applied for.

{세션목록}

- Venue: {장소}
- Instructor: {강사}

[Please note]
{협조사항}
{사전학습URL}

[Confirming attendance and cancelling]
{참석확인취소방법}`,
  },
  M5: {
    subject: "[AI-X Workshop] Tomorrow: {운영일} workshop — how to prepare",
    html: `<p>Dear {성명},<br>Here is how to prepare for tomorrow's workshop on {운영일}.</p>
{세션목록}
<h3>Paid accounts</h3>
<p>{유료계정안내}</p>
<h3>Check your Google account sign-in</h3>
<p>{구글계정안내}</p>
{Zoom링크}
<p><strong>Venue</strong>: {장소}</p>`,
    text: `Dear {성명},
Here is how to prepare for tomorrow's workshop on {운영일}.

{세션목록}

[Paid accounts]
{유료계정안내}

[Check your Google account sign-in]
{구글계정안내}
{Zoom링크}
- Venue: {장소}`,
  },
  M4: {
    subject: "[AI-X Workshop] Today: {운영일} workshop — final notice",
    html: `<p>Dear {성명},<br>Here is the final notice for today's workshop on {운영일}.</p>
{세션목록}
<ul>
  <li><strong>Venue</strong>: {장소}</li>
  <li><strong>Arrival</strong>: {입실시간}</li>
  <li><strong>What to bring</strong>: {준비물}</li>
</ul>
{Zoom링크}
<p><strong>Contact</strong>: {문의처}</p>`,
    text: `Dear {성명},
Here is the final notice for today's workshop on {운영일}.

{세션목록}

- Venue: {장소}
- Arrival: {입실시간}
- What to bring: {준비물}
{Zoom링크}
- Contact: {문의처}`,
  },
};

export const DEFAULT_TEMPLATES: Record<EmailType, EmailTemplateContent> = {
  M1: {
    subject: "[AI-X 워크숍] 신청 결과 안내 ({신청건수}건)",
    html: `<p>{성명} 교수님, 안녕하십니까.<br>「AI-X 교과목 개발·인증을 위한 AI 활용 역량 강화 워크숍」 신청 결과를 안내드립니다.</p>
{세션목록표}
<p>{정원대기안내}</p>
<h3>협조사항</h3>
<p>{협조사항}</p>
<h3>신청 취소 방법</h3>
<p>{취소방법}</p>`,
    text: `{성명} 교수님, 안녕하십니까.
「AI-X 교과목 개발·인증을 위한 AI 활용 역량 강화 워크숍」 신청 결과를 안내드립니다.

[신청 세션]
{세션목록표}

{정원대기안내}

[협조사항]
{협조사항}

[신청 취소 방법]
{취소방법}`,
  },
  M2: {
    subject: "[AI-X 워크숍] 신청 상태 변경 안내 — {차수} {변경후상태}",
    html: `<p>{성명} 교수님, 안녕하십니까.<br>신청하신 워크숍 세션의 상태가 아래와 같이 변경되었습니다.</p>
{변경목록표}
<p>{안내문}</p>`,
    text: `{성명} 교수님, 안녕하십니까.
신청하신 워크숍 세션의 상태가 아래와 같이 변경되었습니다.

{변경목록표}

{안내문}`,
  },
  M3: {
    subject: "[AI-X 워크숍] {운영일} 워크숍 참석 안내 (D-3)",
    html: `<p>{성명} 교수님, 안녕하십니까.<br>신청하신 {운영일} 워크숍 운영을 안내드립니다.</p>
{세션목록}
<ul>
  <li><strong>장소</strong>: {장소}</li>
  <li><strong>강사</strong>: {강사}</li>
</ul>
<h3>협조사항</h3>
<p>{협조사항}</p>
{사전학습URL}
<h3>참석 여부 확인 및 취소 방법</h3>
<p>{참석확인취소방법}</p>`,
    text: `{성명} 교수님, 안녕하십니까.
신청하신 {운영일} 워크숍 운영을 안내드립니다.

{세션목록}

- 장소: {장소}
- 강사: {강사}

[협조사항]
{협조사항}
{사전학습URL}

[참석 여부 확인 및 취소 방법]
{참석확인취소방법}`,
  },
  M5: {
    subject: "[AI-X 워크숍] 내일 {운영일} 워크숍 준비 안내 (D-1)",
    html: `<p>{성명} 교수님, 안녕하십니까.<br>내일 진행되는 {운영일} 워크숍 준비 사항을 안내드립니다.</p>
{세션목록}
<h3>유료계정 사용 지원 안내</h3>
<p>{유료계정안내}</p>
<h3>구글 계정 사전 로그인 확인</h3>
<p>{구글계정안내}</p>
{Zoom링크}
<p><strong>장소</strong>: {장소}</p>`,
    text: `{성명} 교수님, 안녕하십니까.
내일 진행되는 {운영일} 워크숍 준비 사항을 안내드립니다.

{세션목록}

[유료계정 사용 지원 안내]
{유료계정안내}

[구글 계정 사전 로그인 확인]
{구글계정안내}
{Zoom링크}
- 장소: {장소}`,
  },
  M4: {
    subject: "[AI-X 워크숍] 오늘 {운영일} 워크숍 최종 안내",
    html: `<p>{성명} 교수님, 안녕하십니까.<br>오늘 진행되는 {운영일} 워크숍 최종 안내드립니다.</p>
{세션목록}
<ul>
  <li><strong>장소</strong>: {장소}</li>
  <li><strong>입실 시간</strong>: {입실시간}</li>
  <li><strong>준비물</strong>: {준비물}</li>
</ul>
{Zoom링크}
<p><strong>문의처</strong>: {문의처}</p>`,
    text: `{성명} 교수님, 안녕하십니까.
오늘 진행되는 {운영일} 워크숍 최종 안내드립니다.

{세션목록}

- 장소: {장소}
- 입실 시간: {입실시간}
- 준비물: {준비물}
{Zoom링크}
- 문의처: {문의처}`,
  },
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 줄바꿈을 <br>로 바꾼 이스케이프 HTML */
export function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

export interface RenderVars {
  /** 텍스트 값(제목·텍스트 본문용, HTML 본문에서는 이스케이프되어 삽입) */
  text: Record<string, string>;
  /** HTML 본문 전용 조각(표·링크 등, 그대로 삽입) */
  html?: Record<string, string>;
}

function fill(template: string, lookup: (key: string) => string | undefined): string {
  return template.replace(/\{([^{}\s]+)\}/g, (whole, key: string) => lookup(key) ?? whole);
}

function footerHtmlEn(portalUrl: string): string {
  const base = portalUrl ? `${portalUrl}/en` : "";
  const portal = base
    ? `<a href="${escapeHtml(base)}" target="_blank" rel="noopener noreferrer">${escapeHtml(base)}</a>`
    : "the workshop portal";
  const lookup = base ? `${escapeHtml(base)}/lookup` : "";
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
<p style="font-size:13px;color:#475569">Workshop portal: ${portal}<br>
Check or cancel your applications: [My Applications]${lookup ? ` (<a href="${lookup}">${lookup}</a>)` : ""} → enter your name and phone number</p>
<p style="font-size:13px;color:#334155;line-height:1.6">${SIGNATURE_LINES_EN.map(escapeHtml).join("<br>")}</p>`;
}

function footerTextEn(portalUrl: string): string {
  const base = portalUrl ? `${portalUrl}/en` : "";
  return [
    "",
    "----------------------------------------",
    `Workshop portal: ${base || "the workshop portal"}`,
    `Check or cancel your applications: [My Applications]${base ? ` (${base}/lookup)` : ""} → enter your name and phone number`,
    "",
    ...SIGNATURE_LINES_EN,
  ].join("\n");
}

/** 공통 꼬리말 — 포털 링크·신청내역조회 안내·고정 서명 */
function footerHtml(portalUrl: string): string {
  const portal = portalUrl
    ? `<a href="${escapeHtml(portalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(portalUrl)}</a>`
    : "워크숍 신청 포털";
  const lookup = portalUrl ? `${escapeHtml(portalUrl)}/lookup` : "";
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
<p style="font-size:13px;color:#475569">워크숍 포털: ${portal}<br>
신청 내역 확인·취소: 포털 [신청내역조회]${lookup ? ` (<a href="${lookup}">${lookup}</a>)` : ""} → 성명·연락처 입력</p>
<p style="font-size:13px;color:#334155;line-height:1.6">${SIGNATURE_LINES.map(escapeHtml).join("<br>")}</p>`;
}

function footerText(portalUrl: string): string {
  return [
    "",
    "----------------------------------------",
    `워크숍 포털: ${portalUrl || "워크숍 신청 포털"}`,
    `신청 내역 확인·취소: 포털 [신청내역조회]${portalUrl ? ` (${portalUrl}/lookup)` : ""} → 성명·연락처 입력`,
    "",
    ...SIGNATURE_LINES,
  ].join("\n");
}

/** 템플릿 + 변수 → 최종 메일(제목·HTML·텍스트). 머리말/꼬리말을 감싼다. */
export function renderEmail(
  template: EmailTemplateContent,
  vars: RenderVars,
  portalUrl: string,
  locale: Locale = "ko"
): EmailTemplateContent {
  const en = locale === "en";
  vars = { ...vars, text: { 포털URL: en && portalUrl ? `${portalUrl}/en` : portalUrl, ...vars.text } };
  const subject = fill(template.subject, (k) => vars.text[k]);
  const bodyHtml = fill(template.html, (k) =>
    vars.html?.[k] !== undefined ? vars.html[k] : vars.text[k] !== undefined ? textToHtml(vars.text[k]) : undefined
  );
  const bodyText = fill(template.text, (k) => vars.text[k]);

  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#f5f7fa">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;font-family:Pretendard,'Noto Sans KR','Malgun Gothic',sans-serif;color:#1a1a1a;font-size:15px;line-height:1.7">
<p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#003876">${
    en ? "[AI-X Workshop] AI Convergence Institute, Gyeongsang National University" : "[AI-X 워크숍] 경상국립대학교 AI융합원"
  }</p>
${bodyHtml}
${en ? footerHtmlEn(portalUrl) : footerHtml(portalUrl)}
</div></body></html>`;

  return { subject, html, text: `${bodyText}\n${en ? footerTextEn(portalUrl) : footerText(portalUrl)}` };
}

/** DB 템플릿 행(부분 덮어쓰기)과 기본 템플릿 병합 */
export function resolveTemplate(
  type: EmailType,
  row?: { subject: string | null; body_html: string | null; body_text: string | null } | null,
  locale: Locale = "ko"
): EmailTemplateContent {
  // 관리자가 수정한 템플릿(DB)은 한국어 본문이므로 영문 메일에는 적용하지 않는다.
  if (locale === "en") return DEFAULT_TEMPLATES_EN[type];
  const base = DEFAULT_TEMPLATES[type];
  return {
    subject: row?.subject?.trim() ? row.subject : base.subject,
    html: row?.body_html?.trim() ? row.body_html : base.html,
    text: row?.body_text?.trim() ? row.body_text : base.text,
  };
}
