/**
 * 메일 유형별 치환 변수 생성(PRD §9.2·§9.3). 순수 함수 — 발송 서비스와 관리자 미리보기가 공유한다.
 */
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/constants";
import { formatSessionDateTime, formatTime, formatTimeRange } from "@/lib/format";
import type { EmailType } from "@/lib/types";
import { PAID_ACCOUNT_NOTICE, STATUS_MESSAGES, escapeHtml, type RenderVars } from "./templates";

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

const CANCEL_GUIDE =
  "포털 [신청내역조회] → 성명·연락처 입력 → 해당 세션 [신청 취소] (세션 시작 전까지 가능, 같은 날 다른 세션은 영향 없음)";

const PRACTICE_NOTES = [
  "전산 실습실로 개인 노트북은 미지참해도 됩니다.",
  "구글 계정을 확인하시고 사전 로그인 여부를 확인해 주세요.",
  PAID_ACCOUNT_NOTICE,
];

const ONLINE_NOTE = "온라인(3차) 세션의 Zoom 링크는 D-1에 이메일로 발송되며, 카메라·마이크 사용을 권장합니다.";

function sortSessions(sessions: MailSession[]): MailSession[] {
  return [...sessions].sort((a, b) => a.startAt.localeCompare(b.startAt) || a.round - b.round);
}

/** 장소 — 대면은 네이버 지도 하이퍼링크(텍스트 메일은 URL 병기), 온라인은 "온라인(Zoom)" (PRD §5.6) */
export function locationVars(session: Pick<MailSession, "location" | "locationUrl" | "isOnline">) {
  if (session.isOnline || !session.locationUrl) {
    return { text: session.isOnline ? "온라인(Zoom)" : session.location, html: escapeHtml(session.isOnline ? "온라인(Zoom)" : session.location) };
  }
  return {
    text: `${session.location} (지도: ${session.locationUrl})`,
    html: `<a href="${escapeHtml(session.locationUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(session.location)}</a>`,
  };
}

const TH = 'style="border:1px solid #cbd5e1;background:#f1f5f9;padding:6px 8px;text-align:left;font-size:13px"';
const TD = 'style="border:1px solid #cbd5e1;padding:6px 8px;font-size:13px;vertical-align:top"';

function sessionTable(sessions: MailSession[], withStatus: boolean) {
  const rows = sortSessions(sessions);
  const html = `<table style="border-collapse:collapse;width:100%;margin:12px 0">
<thead><tr><th ${TH}>차수</th><th ${TH}>주제</th><th ${TH}>일시</th><th ${TH}>장소</th>${withStatus ? `<th ${TH}>상태</th>` : ""}</tr></thead>
<tbody>${rows
    .map(
      (s) =>
        `<tr><td ${TD}>${escapeHtml(s.roundLabel)}</td><td ${TD}>${escapeHtml(s.topic)}</td><td ${TD}>${escapeHtml(
          formatSessionDateTime(s.startAt, s.endAt)
        )}</td><td ${TD}>${locationVars(s).html}</td>${withStatus ? `<td ${TD}>${escapeHtml(s.status)}</td>` : ""}</tr>`
    )
    .join("")}</tbody></table>`;
  const text = rows
    .map(
      (s) =>
        `- ${s.roundLabel} | ${s.topic} | ${formatSessionDateTime(s.startAt, s.endAt)} | ${locationVars(s).text}${
          withStatus ? ` | ${s.status}` : ""
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

function zoomVars(sessions: MailSession[]) {
  const online = sessions.filter((s) => s.isOnline);
  if (online.length === 0) return { html: "", text: "" };
  const items = online.map((s) => ({
    label: `${s.roundLabel} Zoom 접속 링크`,
    link: s.zoomLink,
  }));
  return {
    html: `<h3>Zoom 접속 링크</h3>${items
      .map((i) =>
        i.link
          ? `<p>${escapeHtml(i.label)}: <a href="${escapeHtml(i.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(i.link)}</a></p>`
          : `<p>${escapeHtml(i.label)}: 별도 안내 예정</p>`
      )
      .join("")}`,
    text: `\n[Zoom 접속 링크]\n${items.map((i) => `${i.label}: ${i.link ?? "별도 안내 예정"}`).join("\n")}\n`,
  };
}

function sharedDayVars(sessions: MailSession[]) {
  const first = sortSessions(sessions)[0];
  const location = locationVars(first);
  return { first, location };
}

export function buildM1Vars(recipient: MailRecipient, sessions: MailSession[]): RenderVars {
  const table = sessionTable(sessions, true);
  const hasWaiting = sessions.some((s) => s.status === "대기");
  const hasOnline = sessions.some((s) => s.isOnline);
  const notes = [...PRACTICE_NOTES, ...(hasOnline ? [ONLINE_NOTE] : [])].map((l) => `· ${l}`).join("\n");
  return {
    text: {
      성명: recipient.name,
      신청건수: String(sessions.length),
      세션목록표: table.text,
      정원대기안내: hasWaiting
        ? "대기 상태인 세션은 결원 발생 시 순차적으로 안내드립니다."
        : "세션별 정원(대면 30명, 온라인 제한 없음) 내 선착순으로 접수되었습니다.",
      협조사항: notes,
      취소방법: CANCEL_GUIDE,
    },
    html: { 세션목록표: table.html },
  };
}

export function buildM2Vars(recipient: MailRecipient, changes: StatusChange[]): RenderVars {
  const sorted = [...changes].sort((a, b) => a.session.startAt.localeCompare(b.session.startAt));
  const uniform = (pick: (c: StatusChange) => string) => {
    const values = Array.from(new Set(sorted.map(pick)));
    return values.length === 1 ? values[0] : values.join("·");
  };
  const toStatuses = Array.from(new Set(sorted.map((c) => c.to)));
  const html = `<table style="border-collapse:collapse;width:100%;margin:12px 0">
<thead><tr><th ${TH}>차수</th><th ${TH}>주제</th><th ${TH}>일시</th><th ${TH}>변경 전</th><th ${TH}>변경 후</th></tr></thead>
<tbody>${sorted
    .map(
      (c) =>
        `<tr><td ${TD}>${escapeHtml(c.session.roundLabel)}</td><td ${TD}>${escapeHtml(c.session.topic)}</td><td ${TD}>${escapeHtml(
          formatSessionDateTime(c.session.startAt, c.session.endAt)
        )}</td><td ${TD}>${escapeHtml(c.from)}</td><td ${TD}><strong>${escapeHtml(c.to)}</strong></td></tr>`
    )
    .join("")}</tbody></table>`;
  const text = sorted
    .map(
      (c) =>
        `- ${c.session.roundLabel} | ${c.session.topic} | ${formatSessionDateTime(c.session.startAt, c.session.endAt)} | ${c.from} → ${c.to}`
    )
    .join("\n");
  return {
    text: {
      성명: recipient.name,
      차수: uniform((c) => c.session.roundLabel),
      주제: uniform((c) => c.session.topic),
      일시: uniform((c) => formatSessionDateTime(c.session.startAt, c.session.endAt)),
      변경전상태: uniform((c) => c.from),
      변경후상태: toStatuses.length === 1 ? toStatuses[0] : "변경",
      안내문: toStatuses.map((s) => STATUS_MESSAGES[s] ?? "").filter(Boolean).join("\n"),
      변경목록표: text,
    },
    html: { 변경목록표: html },
  };
}

export function buildM3Vars(recipient: MailRecipient, sessions: MailSession[]): RenderVars {
  const { first, location } = sharedDayVars(sessions);
  const list = sessionList(sessions);
  const prelearning = sortSessions(sessions).filter((s) => s.prelearningUrl);
  return {
    text: {
      성명: recipient.name,
      운영일: first.dayLabel,
      세션목록: list.text,
      장소: location.text,
      강사: first.instructor,
      협조사항: uniqueNotes(sessions),
      사전학습URL: prelearning.length
        ? `\n[사전학습]\n${prelearning.map((s) => `${s.roundLabel} 사전학습 동영상: ${s.prelearningUrl}`).join("\n")}\n`
        : "",
      참석확인취소방법: `참석이 어려우신 경우 ${CANCEL_GUIDE}로 취소해 주시기 바랍니다. 취소하신 자리는 대기자에게 안내됩니다.`,
    },
    html: {
      세션목록: list.html,
      장소: location.html,
      사전학습URL: prelearning.length
        ? `<h3>사전학습</h3>${prelearning
            .map(
              (s) =>
                `<p>${escapeHtml(s.roundLabel)} 사전학습 동영상: <a href="${escapeHtml(s.prelearningUrl!)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.prelearningUrl!)}</a></p>`
            )
            .join("")}`
        : "",
    },
  };
}

export function buildM5Vars(recipient: MailRecipient, sessions: MailSession[]): RenderVars {
  const { first, location } = sharedDayVars(sessions);
  const list = sessionList(sessions);
  const zoom = zoomVars(sessions);
  return {
    text: {
      성명: recipient.name,
      운영일: first.dayLabel,
      세션목록: list.text,
      유료계정안내:
        "실습에 사용할 Claude(또는 ChatGPT) 유료계정이 지원됩니다. 계정 정보와 로그인 방법은 워크숍 시작 시 안내드리며, 개인 유료계정이 있으시면 해당 계정으로 사전 로그인해 오셔도 됩니다.",
      구글계정안내: first.isOnline
        ? "실습에 사용할 구글 계정(아이디·비밀번호)으로 미리 로그인이 되는지 확인해 주세요."
        : "전산 실습실 PC에서 사용할 구글 계정(아이디·비밀번호)을 미리 확인하시고, 2단계 인증용 휴대폰을 지참해 주세요.",
      Zoom링크: zoom.text,
      장소: location.text,
    },
    html: { 세션목록: list.html, Zoom링크: zoom.html, 장소: location.html },
  };
}

export function buildM4Vars(recipient: MailRecipient, sessions: MailSession[]): RenderVars {
  const { first, location } = sharedDayVars(sessions);
  const list = sessionList(sessions);
  const zoom = zoomVars(sessions);
  const startAt = new Date(new Date(first.startAt).getTime() - 10 * 60 * 1000).toISOString();
  return {
    text: {
      성명: recipient.name,
      운영일: first.dayLabel,
      세션목록: list.text,
      장소: location.text,
      입실시간: first.isOnline
        ? `${formatTime(startAt)}부터 Zoom 입장 가능(시작 10분 전)`
        : `${formatTime(startAt)}까지 입실(시작 10분 전)`,
      준비물: first.isOnline
        ? "PC(카메라·마이크), 안정적인 인터넷 환경, 구글 계정"
        : "개인 노트북 미지참 가능(실습실 PC 제공), 구글 계정 정보, 2단계 인증용 휴대폰",
      Zoom링크: zoom.text,
      문의처: `경상국립대학교 AI융합원 ${CONTACT_PHONE} / ${CONTACT_EMAIL}`,
    },
    html: { 세션목록: list.html, Zoom링크: zoom.html, 장소: location.html },
  };
}

export function buildVars(
  type: EmailType,
  recipient: MailRecipient,
  sessions: MailSession[],
  changes?: StatusChange[]
): RenderVars {
  switch (type) {
    case "M1":
      return buildM1Vars(recipient, sessions);
    case "M2":
      return buildM2Vars(
        recipient,
        changes ?? sessions.map((s) => ({ session: s, from: s.status, to: s.status }))
      );
    case "M3":
      return buildM3Vars(recipient, sessions);
    case "M5":
      return buildM5Vars(recipient, sessions);
    case "M4":
      return buildM4Vars(recipient, sessions);
  }
}

/** 관리자 미리보기·테스트 발송용 샘플 데이터 */
export function sampleSessions(type: EmailType): MailSession[] {
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
        startAt: "2026-11-11T13:30:00+09:00",
        endAt: "2026-11-11T15:30:00+09:00",
        dayCode: "B",
        dayLabel: "11/11(수)",
        location: "온라인(Zoom)",
        locationUrl: null,
        isOnline: true,
        instructor: "임상훈 교수(국립 금오공대)",
      },
    ];
  }
  return [base, second];
}

export const SAMPLE_RECIPIENT: MailRecipient = { name: "홍길동", email: "sample@gnu.ac.kr" };
