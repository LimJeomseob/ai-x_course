/**
 * 메일 유형별 치환 변수 생성(PRD §9.2·§9.3). 순수 함수 — 발송 서비스와 관리자 미리보기가 공유한다.
 */
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants";
import { formatSessionDateTime, formatTime, formatTimeRange } from "@/lib/format";
import type { EmailType } from "@/lib/types";
import type { Locale } from "@/lib/i18n/config";
import { getDict } from "@/lib/i18n/dict";
import { PAID_ACCOUNT_NOTICE, STATUS_MESSAGES, STATUS_MESSAGES_EN, escapeHtml, type RenderVars } from "./templates";

export interface MailSession {
  applicationId: string;
  round: number;
  roundLabel: string;
  topic: string;
  startAt: string;
  endAt: string;
  dayCode: string;
  dayLabel: string;
  location: string;
  locationUrl: string | null;
  isOnline: boolean;
  instructor: string;
  notes: string;
  status: string;
  zoomLink: string | null;
  prelearningUrl: string | null;
}

export interface MailRecipient {
  name: string;
  email: string;
}

export interface StatusChange {
  session: MailSession;
  from: string;
  to: string;
}

/** 메일 본문에 들어가는 고정 문구(언어별). 치환 변수 이름은 언어와 무관하게 한국어 키를 쓴다. */
const STRINGS = {
  ko: {
    online: "온라인(Zoom)",
    map: "지도",
    th: { round: "차수", topic: "주제", when: "일시", place: "장소", status: "상태", before: "변경 전", after: "변경 후" },
    cancelGuide:
      "포털 [신청내역조회] → 성명·연락처 입력 → 해당 세션 [신청 취소] → 이메일 확인 코드 입력 (세션 시작 전까지 가능, 같은 날 다른 세션은 영향 없음)",
    practiceNotes: [
      "전산 실습실로 개인 노트북은 미지참해도 됩니다.",
      "구글 계정을 확인하시고 사전 로그인 여부를 확인해 주세요.",
      PAID_ACCOUNT_NOTICE,
    ],
    onlineNote: "온라인(3차) 세션의 Zoom 링크는 D-1에 이메일로 발송되며, 카메라·마이크 사용을 권장합니다.",
    count: (n: number) => `${n}건`,
    waitingNote: "대기 상태인 세션은 결원 발생 시 순차적으로 안내드립니다.",
    acceptedNote: "세션별 정원(대면 25명, 온라인 제한 없음) 내 선착순으로 접수되었습니다.",
    changed: "변경",
    zoomTitle: "Zoom 접속 링크",
    zoomLabel: (round: string) => `${round} Zoom 접속 링크`,
    zoomPending: "별도 안내 예정",
    prelearningTitle: "사전학습",
    prelearningLabel: (round: string) => `${round} 사전학습 동영상`,
    attendGuide: (guide: string) =>
      `참석이 어려우신 경우 ${guide}로 취소해 주시기 바랍니다. 취소하신 자리는 대기자에게 안내됩니다.`,
    paidAccount:
      "실습에 사용할 Claude(또는 ChatGPT) 유료계정이 지원됩니다. 계정 정보와 로그인 방법은 워크숍 시작 시 안내드리며, 개인 유료계정이 있으시면 해당 계정으로 사전 로그인해 오셔도 됩니다.",
    googleOnline: "실습에 사용할 구글 계정(아이디·비밀번호)으로 미리 로그인이 되는지 확인해 주세요.",
    googleOnsite:
      "전산 실습실 PC에서 사용할 구글 계정(아이디·비밀번호)을 미리 확인하시고, 2단계 인증용 휴대폰을 지참해 주세요.",
    arriveOnline: (time: string) => `${time}부터 Zoom 입장 가능(시작 10분 전)`,
    arriveOnsite: (time: string) => `${time}까지 입실(시작 10분 전)`,
    bringOnline: "PC(카메라·마이크), 안정적인 인터넷 환경, 구글 계정",
    bringOnsite: "개인 노트북 미지참 가능(실습실 PC 제공), 구글 계정 정보, 2단계 인증용 휴대폰",
    contact: `경상국립대학교 AI융합원 ${CONTACT_PHONE} / ${CONTACT_EMAIL}`,
  },
  en: {
    online: "Online (Zoom)",
    map: "map",
    th: { round: "Session", topic: "Topic", when: "Date & time", place: "Venue", status: "Status", before: "Before", after: "After" },
    cancelGuide:
      "Portal [My Applications] → enter your name and phone number → [Cancel] on the session → enter the code emailed to you (available until the session starts; other sessions on the same day are not affected)",
    practiceNotes: [
      "Sessions are held in a computer lab, so you do not need to bring a laptop.",
      "Please check your Google account and make sure you can sign in beforehand.",
      "Paid Claude (or ChatGPT) accounts are provided (details will be sent one day before).",
    ],
    onlineNote:
      "The Zoom link for the online session (Session 3) is emailed one day before. Using a camera and microphone is recommended.",
    count: (n: number) => `${n} session${n === 1 ? "" : "s"}`,
    waitingNote: "For waitlisted sessions, we will contact you in order if a seat opens.",
    acceptedNote:
      "Your application was accepted on a first-come, first-served basis within each session's capacity (25 in person; no limit online).",
    changed: "changed",
    zoomTitle: "Zoom link",
    zoomLabel: (round: string) => `${round} Zoom link`,
    zoomPending: "to be announced separately",
    prelearningTitle: "Pre-learning",
    prelearningLabel: (round: string) => `${round} pre-learning video`,
    attendGuide: (guide: string) =>
      `If you cannot attend, please cancel via: ${guide}. Your seat will be offered to people on the waiting list.`,
    paidAccount:
      "A paid Claude (or ChatGPT) account is provided for the hands-on practice. Account details and sign-in instructions are given at the start of the workshop. If you have your own paid account, you may sign in with it beforehand.",
    googleOnline: "Please make sure in advance that you can sign in to the Google account (ID and password) you will use.",
    googleOnsite:
      "Please check in advance the Google account (ID and password) you will use on the lab PC, and bring your phone for two-step verification.",
    arriveOnline: (time: string) => `You can join Zoom from ${time} (10 minutes before the start)`,
    arriveOnsite: (time: string) => `Please arrive by ${time} (10 minutes before the start)`,
    bringOnline: "A PC (camera and microphone), a stable internet connection, and your Google account",
    bringOnsite:
      "No laptop needed (lab PCs are provided); your Google account details and your phone for two-step verification",
    contact: `AI Convergence Institute, Gyeongsang National University ${CONTACT_PHONE} / ${CONTACT_EMAIL}`,
  },
} as const;

function sortSessions(sessions: MailSession[]): MailSession[] {
  return [...sessions].sort((a, b) => a.startAt.localeCompare(b.startAt) || a.round - b.round);
}

/** 장소 — 대면은 네이버 지도 하이퍼링크(텍스트 메일은 URL 병기), 온라인은 "온라인(Zoom)" (PRD §5.6) */
export function locationVars(
  session: Pick<MailSession, "location" | "locationUrl" | "isOnline">,
  locale: Locale = "ko"
) {
  const L = STRINGS[locale];
  if (session.isOnline || !session.locationUrl) {
    const text = session.isOnline ? L.online : session.location;
    return { text, html: escapeHtml(text) };
  }
  return {
    text: `${session.location} (${L.map}: ${session.locationUrl})`,
    html: `<a href="${escapeHtml(session.locationUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(session.location)}</a>`,
  };
}

const TH = 'style="border:1px solid #cbd5e1;background:#f1f5f9;padding:6px 8px;text-align:left;font-size:13px"';
const TD = 'style="border:1px solid #cbd5e1;padding:6px 8px;font-size:13px;vertical-align:top"';

function sessionTable(sessions: MailSession[], withStatus: boolean, locale: Locale) {
  const L = STRINGS[locale];
  const statusLabel = (status: string) => (getDict(locale).status as Record<string, string>)[status] ?? status;
  const rows = sortSessions(sessions);
  const html = `<table style="border-collapse:collapse;width:100%;margin:12px 0">
<thead><tr><th ${TH}>${L.th.round}</th><th ${TH}>${L.th.topic}</th><th ${TH}>${L.th.when}</th><th ${TH}>${L.th.place}</th>${withStatus ? `<th ${TH}>${L.th.status}</th>` : ""}</tr></thead>
<tbody>${rows
    .map(
      (s) =>
        `<tr><td ${TD}>${escapeHtml(s.roundLabel)}</td><td ${TD}>${escapeHtml(s.topic)}</td><td ${TD}>${escapeHtml(
          formatSessionDateTime(s.startAt, s.endAt, locale)
        )}</td><td ${TD}>${locationVars(s, locale).html}</td>${withStatus ? `<td ${TD}>${escapeHtml(statusLabel(s.status))}</td>` : ""}</tr>`
    )
    .join("")}</tbody></table>`;
  const text = rows
    .map(
      (s) =>
        `- ${s.roundLabel} | ${s.topic} | ${formatSessionDateTime(s.startAt, s.endAt, locale)} | ${locationVars(s, locale).text}${
          withStatus ? ` | ${statusLabel(s.status)}` : ""
        }`
    )
    .join("\n");
  return { html, text };
}

function sessionList(sessions: MailSession[]) {
  const rows = sortSessions(sessions);
  const line = (s: MailSession) => `${s.roundLabel} ${formatTimeRange(s.startAt, s.endAt)} · ${s.topic}`;
  return {
    html: `<ul>${rows.map((s) => `<li>${escapeHtml(line(s))}</li>`).join("")}</ul>`,
    text: rows.map((s) => `- ${line(s)}`).join("\n"),
  };
}

function uniqueNotes(sessions: MailSession[]): string {
  const lines = new Set<string>();
  for (const s of sessions) {
    for (const line of s.notes.split("\n").map((l) => l.trim()).filter(Boolean)) lines.add(line);
  }
  return Array.from(lines).join("\n");
}

function zoomVars(sessions: MailSession[], locale: Locale) {
  const L = STRINGS[locale];
  const online = sessions.filter((s) => s.isOnline);
  if (online.length === 0) return { html: "", text: "" };
  const items = online.map((s) => ({
    label: L.zoomLabel(s.roundLabel),
    link: s.zoomLink,
  }));
  return {
    html: `<h3>${L.zoomTitle}</h3>${items
      .map((i) =>
        i.link
          ? `<p>${escapeHtml(i.label)}: <a href="${escapeHtml(i.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(i.link)}</a></p>`
          : `<p>${escapeHtml(i.label)}: ${L.zoomPending}</p>`
      )
      .join("")}`,
    text: `\n[${L.zoomTitle}]\n${items.map((i) => `${i.label}: ${i.link ?? L.zoomPending}`).join("\n")}\n`,
  };
}

function sharedDayVars(sessions: MailSession[], locale: Locale) {
  const first = sortSessions(sessions)[0];
  const location = locationVars(first, locale);
  return { first, location };
}

export function buildM1Vars(recipient: MailRecipient, sessions: MailSession[], locale: Locale = "ko"): RenderVars {
  const L = STRINGS[locale];
  const table = sessionTable(sessions, true, locale);
  const hasWaiting = sessions.some((s) => s.status === "대기");
  const hasOnline = sessions.some((s) => s.isOnline);
  const notes = [...L.practiceNotes, ...(hasOnline ? [L.onlineNote] : [])].map((l) => `· ${l}`).join("\n");
  return {
    text: {
      성명: recipient.name,
      신청건수: locale === "en" ? L.count(sessions.length) : String(sessions.length),
      세션목록표: table.text,
      정원대기안내: hasWaiting ? L.waitingNote : L.acceptedNote,
      협조사항: notes,
      취소방법: L.cancelGuide,
    },
    html: { 세션목록표: table.html },
  };
}

export function buildM2Vars(recipient: MailRecipient, changes: StatusChange[], locale: Locale = "ko"): RenderVars {
  const L = STRINGS[locale];
  const statusLabel = (status: string) => (getDict(locale).status as Record<string, string>)[status] ?? status;
  const statusMessages = locale === "en" ? STATUS_MESSAGES_EN : STATUS_MESSAGES;
  const sorted = [...changes].sort((a, b) => a.session.startAt.localeCompare(b.session.startAt));
  const uniform = (pick: (c: StatusChange) => string) => {
    const values = Array.from(new Set(sorted.map(pick)));
    return values.length === 1 ? values[0] : values.join("·");
  };
  const toStatuses = Array.from(new Set(sorted.map((c) => c.to)));
  const html = `<table style="border-collapse:collapse;width:100%;margin:12px 0">
<thead><tr><th ${TH}>${L.th.round}</th><th ${TH}>${L.th.topic}</th><th ${TH}>${L.th.when}</th><th ${TH}>${L.th.before}</th><th ${TH}>${L.th.after}</th></tr></thead>
<tbody>${sorted
    .map(
      (c) =>
        `<tr><td ${TD}>${escapeHtml(c.session.roundLabel)}</td><td ${TD}>${escapeHtml(c.session.topic)}</td><td ${TD}>${escapeHtml(
          formatSessionDateTime(c.session.startAt, c.session.endAt, locale)
        )}</td><td ${TD}>${escapeHtml(statusLabel(c.from))}</td><td ${TD}><strong>${escapeHtml(statusLabel(c.to))}</strong></td></tr>`
    )
    .join("")}</tbody></table>`;
  const text = sorted
    .map(
      (c) =>
        `- ${c.session.roundLabel} | ${c.session.topic} | ${formatSessionDateTime(c.session.startAt, c.session.endAt, locale)} | ${statusLabel(c.from)} → ${statusLabel(c.to)}`
    )
    .join("\n");
  return {
    text: {
      성명: recipient.name,
      차수: uniform((c) => c.session.roundLabel),
      주제: uniform((c) => c.session.topic),
      일시: uniform((c) => formatSessionDateTime(c.session.startAt, c.session.endAt, locale)),
      변경전상태: uniform((c) => statusLabel(c.from)),
      변경후상태: toStatuses.length === 1 ? statusLabel(toStatuses[0]) : L.changed,
      안내문: toStatuses.map((s) => statusMessages[s] ?? "").filter(Boolean).join("\n"),
      변경목록표: text,
    },
    html: { 변경목록표: html },
  };
}

/** 사전학습 URL(세션 관리 입력값) — 미입력이면 빈 문자열(본문에 미작성) */
function prelearningVars(sessions: MailSession[], locale: Locale) {
  const L = STRINGS[locale];
  const prelearning = sortSessions(sessions).filter((s) => s.prelearningUrl);
  if (prelearning.length === 0) return { text: "", html: "" };
  return {
    text: `\n[${L.prelearningTitle}]\n${prelearning.map((s) => `${L.prelearningLabel(s.roundLabel)}: ${s.prelearningUrl}`).join("\n")}\n`,
    html: `<h3>${L.prelearningTitle}</h3>${prelearning
      .map(
        (s) =>
          `<p>${escapeHtml(L.prelearningLabel(s.roundLabel))}: <a href="${escapeHtml(s.prelearningUrl!)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.prelearningUrl!)}</a></p>`
      )
      .join("")}`,
  };
}

export function buildM3Vars(recipient: MailRecipient, sessions: MailSession[], locale: Locale = "ko"): RenderVars {
  const L = STRINGS[locale];
  const { first, location } = sharedDayVars(sessions, locale);
  const list = sessionList(sessions);
  const prelearning = prelearningVars(sessions, locale);
  return {
    text: {
      성명: recipient.name,
      운영일: first.dayLabel,
      세션목록: list.text,
      장소: location.text,
      강사: first.instructor,
      협조사항: uniqueNotes(sessions),
      사전학습URL: prelearning.text,
      참석확인취소방법: L.attendGuide(L.cancelGuide),
    },
    html: {
      세션목록: list.html,
      장소: location.html,
      사전학습URL: prelearning.html,
    },
  };
}

export function buildM5Vars(recipient: MailRecipient, sessions: MailSession[], locale: Locale = "ko"): RenderVars {
  const L = STRINGS[locale];
  const { first, location } = sharedDayVars(sessions, locale);
  const list = sessionList(sessions);
  const zoom = zoomVars(sessions, locale);
  const prelearning = prelearningVars(sessions, locale);
  return {
    text: {
      성명: recipient.name,
      운영일: first.dayLabel,
      세션목록: list.text,
      유료계정안내: L.paidAccount,
      구글계정안내: first.isOnline ? L.googleOnline : L.googleOnsite,
      Zoom링크: zoom.text,
      사전학습URL: prelearning.text,
      장소: location.text,
    },
    html: { 세션목록: list.html, Zoom링크: zoom.html, 사전학습URL: prelearning.html, 장소: location.html },
  };
}

export function buildM4Vars(recipient: MailRecipient, sessions: MailSession[], locale: Locale = "ko"): RenderVars {
  const L = STRINGS[locale];
  const { first, location } = sharedDayVars(sessions, locale);
  const list = sessionList(sessions);
  const zoom = zoomVars(sessions, locale);
  const prelearning = prelearningVars(sessions, locale);
  const startAt = new Date(new Date(first.startAt).getTime() - 10 * 60 * 1000).toISOString();
  return {
    text: {
      성명: recipient.name,
      운영일: first.dayLabel,
      세션목록: list.text,
      장소: location.text,
      입실시간: first.isOnline ? L.arriveOnline(formatTime(startAt)) : L.arriveOnsite(formatTime(startAt)),
      준비물: first.isOnline ? L.bringOnline : L.bringOnsite,
      Zoom링크: zoom.text,
      사전학습URL: prelearning.text,
      문의처: L.contact,
    },
    html: { 세션목록: list.html, Zoom링크: zoom.html, 사전학습URL: prelearning.html, 장소: location.html },
  };
}

export function buildVars(
  type: EmailType,
  recipient: MailRecipient,
  sessions: MailSession[],
  changes?: StatusChange[],
  locale: Locale = "ko"
): RenderVars {
  switch (type) {
    case "M1":
      return buildM1Vars(recipient, sessions, locale);
    case "M2":
      return buildM2Vars(
        recipient,
        changes ?? sessions.map((s) => ({ session: s, from: s.status, to: s.status })),
        locale
      );
    case "M3":
      return buildM3Vars(recipient, sessions, locale);
    case "M5":
      return buildM5Vars(recipient, sessions, locale);
    case "M4":
      return buildM4Vars(recipient, sessions, locale);
  }
}

/** 세션 관리에서 입력한 링크(차수별) — 미리보기·테스트 발송 샘플에 반영 */
export type SessionLinks = Record<number, { zoomLink: string | null; prelearningUrl: string | null }>;

/**
 * 관리자 미리보기·테스트 발송용 샘플 데이터.
 * links가 있으면 세션 관리(/admin/sessions)에 입력된 Zoom 링크·사전학습 URL을 차수별로 덮어쓴다.
 */
export function sampleSessions(type: EmailType, links?: SessionLinks): MailSession[] {
  return sampleSessionsBase(type).map((s) => {
    const link = links?.[s.round];
    return {
      ...s,
      zoomLink: link?.zoomLink ?? s.zoomLink,
      prelearningUrl: link?.prelearningUrl ?? s.prelearningUrl,
    };
  });
}

function sampleSessionsBase(type: EmailType): MailSession[] {
  const base: MailSession = {
    applicationId: "00000000-0000-0000-0000-000000000000",
    round: 1,
    roundLabel: "1차",
    topic: "Claude Skill 기반 교수법 활용(기초)",
    startAt: "2026-11-05T13:30:00+09:00",
    endAt: "2026-11-05T15:30:00+09:00",
    dayCode: "A",
    dayLabel: "11/5(목)",
    location: "4동 학술정보관 1층 하이플렉스강의실",
    locationUrl: "https://naver.me/5chMgpBo",
    isOnline: false,
    instructor: "박성재 대표(모모에듀)",
    notes:
      "전산 실습실로 개인 노트북은 미지참해도 됨. 구글 계정 확인 후 사전 로그인 확인 요청, Claude(또는 ChatGPT) 유료계정 사용 지원(D-1 안내 예정)",
    status: "신청완료",
    zoomLink: null,
    prelearningUrl: null,
  };
  const second: MailSession = {
    ...base,
    round: 2,
    roundLabel: "2차",
    topic: "전공-AI 연계 모델 수립",
    startAt: "2026-11-05T15:30:00+09:00",
    endAt: "2026-11-05T17:30:00+09:00",
  };
  if (type === "M1") {
    return [
      base,
      second,
      {
        ...base,
        round: 3,
        roundLabel: "3차",
        topic: "AI 윤리 가이드 강의계획서 반영 / AI 활용 과정평가 루브릭·CQI(온라인)",
        startAt: "2026-11-11T15:30:00+09:00",
        endAt: "2026-11-11T17:30:00+09:00",
        dayCode: "B",
        dayLabel: "11/11(수)",
        location: "온라인(Zoom)",
        locationUrl: null,
        isOnline: true,
        instructor: "임상훈 교수(국립 금오공대)",
      },
    ];
  }
  if (type === "M3" || type === "M5" || type === "M4") {
    // 운영일 단위 안내(M3·M5·M4)는 {사전학습URL}(5차)을 쓸 수 있으므로 5차가 포함된 Day C(4·5차)로 미리보기한다.
    const dayC: MailSession = {
      ...base,
      round: 4,
      roundLabel: "4차",
      topic: "NotebookLM·RAG 기반 AI 튜터 만들기",
      startAt: "2026-11-13T13:30:00+09:00",
      endAt: "2026-11-13T15:30:00+09:00",
      dayCode: "C",
      dayLabel: "11/13(금)",
      location: "4동 105호 전산실습실",
      instructor: "연정호 박사(SK hynics)",
    };
    return [
      dayC,
      {
        ...dayC,
        round: 5,
        roundLabel: "5차",
        topic: "Claude Skill 기반 교수법 활용(심화)",
        startAt: "2026-11-13T15:30:00+09:00",
        endAt: "2026-11-13T17:30:00+09:00",
        // 사전학습 URL은 세션 관리 입력값만 사용 — 미입력이면 본문에 사전학습 안내를 작성하지 않는다.
      },
    ];
  }
  return [base, second];
}

export const SAMPLE_RECIPIENT: MailRecipient = { name: "홍길동", email: "sample@gnu.ac.kr" };
