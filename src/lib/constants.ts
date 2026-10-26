import type { AxisParticipant } from "./types";

export const PROGRAM_NAME = "AI-X 교과목 개발·인증을 위한 AI 활용 역량 강화 워크숍";
export const PROGRAM_SHORT_NAME = "AI-X 워크숍";
export const PROGRAM_YEAR_TITLE = "2026학년도 「원활한 AI-X 교과목 개발을 위한 워크숍」";
export const ISSUER_NAME = "경상국립대학교 AI융합원장";
export const ORG_NAME = "경상국립대학교";
export const ORGANIZER_NAME = "경상국립대학교 AI융합원";
export const CONTACT_PHONE = "055-772-4452";
export const CONTACT_EMAIL = "240907@gnu.ac.kr";

/** 대면 장소 공통 지도 링크(PRD §5.6) — DB workshop_days.location_url 기본값과 동일 */
export const MAP_URL = "https://naver.me/5chMgpBo";

/** 신청 오픈 기본값(PRD §8) — DB workshops.apply_open_at 기본값과 동일 */
export const APPLICATION_OPEN_AT = "2026-10-21T09:00:00+09:00";

export const MAX_SESSIONS_PER_PERSON = 7;

/** 정원 9999 이상은 "제한 없음"으로 표기(온라인 3차) */
export const UNLIMITED_CAPACITY = 9999;

/** 계획안 Ⅰ. 목적 및 필요성(PRD §1.1 — 원문 전량) */
export const BACKGROUND_ITEMS = [
  "「글로컬대학30」 사업의 AI-X 교과목 개발·인증 추진에 따라 전공-AI 융합 수업을 설계·운영할 교원의 AI 활용 역량 강화 필요",
  "AI 교수역량 자가진단 결과 수업 운영·학습자 지원, 전공-AI 융합 설계 영역의 보완 수요가 높아 실습 중심의 맞춤형 워크숍 필요",
  "AI-X 교원 교육수요조사 우선순위에 따라 선호 주제·일정을 반영한 수요자 중심 워크숍 운영",
];

/** 계획안 Ⅱ. 운영개요(PRD §1.3) — 장소는 화면에서 지도 링크로 별도 렌더링 */
export const OVERVIEW_ITEMS: { label: string; value: string }[] = [
  { label: "프로그램", value: PROGRAM_NAME },
  { label: "운영대상", value: "AI-X 교과목 개발·인증 신청 교원 및 희망 교원" },
  { label: "신청기간", value: "’26. 10. 21.(수) ~ 운영 D-1일 (시스템 신청)" },
  { label: "운영일시", value: "’26. 11. 5.(목) ~ 11. 20.(금) (총 7회 · 7개 세션)" },
  { label: "모집인원", value: "대면 워크숍 180명(6세션 × 30명), 비대면 온라인 특강(제한 없음)" },
  { label: "운영방법", value: "실습형 대면(비대면) 워크숍" },
  { label: "신청방법", value: "교육신청 시스템을 통한 세션별 선택 신청(선착순)" },
  { label: "지원사항", value: "Claude·ChatGPT 등 유료계정 사용" },
  { label: "주관", value: ORGANIZER_NAME },
];

export const OVERVIEW_LOCATION_TEXT = "4동 학술정보관 1층 하이플렉스강의실 및 전산실습실";

/** 수료 시 혜택(PRD §1.4 — 계획안 원문) */
export const BENEFITS = [
  {
    title: "AXIS 프로그램 참여교원",
    body: "AI-X 교과목 개발·인증을 위한 프로그램 이수 인정, 교수법 프로그램 이수 인정",
    note: "※ 신청 시스템을 통해 프로그램을 이수한 후 수료증을 AI-X 교과목 개발·인증 결과보고서에 첨부",
  },
  { title: "그 외 전임교원", body: "교수법 프로그램 이수 인정" },
];

export const DEADLINE_NOTICE = "각 세션 운영 전날(D-1) 23:59 자동 마감";

/** AXIS 참여여부(신청 §5.2, 설문 S2) */
export const AXIS_OPTIONS: { value: AxisParticipant; label: string; short: string }[] = [
  { value: "axis", label: "AI-X 교과목 개발·인증 신청(AXIS 참여) 교원", short: "AXIS 참여" },
  { value: "faculty", label: "그 외 전임교원", short: "그 외 전임" },
  { value: "other", label: "기타(비전임·직원)", short: "기타" },
];

export function axisLabel(value: string, short = true): string {
  const found = AXIS_OPTIONS.find((o) => o.value === value);
  if (!found) return value;
  return short ? found.short : found.label;
}

/** 안내메시지 확인 단계 — 자동 메일 발송 성공 시 자동 true(M1→1차, M3→2차, M4→3차) */
export type NoticeField = "notice1_confirmed" | "notice2_confirmed" | "notice3_confirmed";

export const NOTICE_COLUMNS: { field: NoticeField; label: string; mail: string }[] = [
  { field: "notice1_confirmed", label: "1차 신청결과", mail: "M1" },
  { field: "notice2_confirmed", label: "2차 수강안내", mail: "M3" },
  { field: "notice3_confirmed", label: "3차 최종안내", mail: "M4" },
];

export const EMAIL_TYPE_LABELS: Record<string, string> = {
  M1: "신청 결과 안내",
  M2: "상태 변경 안내",
  M3: "운영 안내(D-3)",
  M5: "준비 안내(D-1)",
  M4: "당일 최종 안내",
  TEST: "테스트 발송",
  ALERT: "관리자 알림",
};

/** 화면 표기 순서(M1 → M2 → M3 → M5 → M4: 발송 시점 순) */
export const EMAIL_TYPES_ORDERED = ["M1", "M2", "M3", "M5", "M4"] as const;

// ----------------------------------------------------------------------------
// 강사 프로필(PRD §5.1 — 프로필 상세는 운영자 제공 이력서 기준)
// 개인 연락처(휴대폰·이메일)는 공개 포털에 노출하지 않는다.
// ----------------------------------------------------------------------------
export interface InstructorProfile {
  slug: string;
  name: string;
  /** workshop_days.instructor와 일치해야 카드의 강사 버튼과 연결된다 */
  title: string;
  tagline?: string;
  affiliation: string;
  rounds: number[];
  summary?: string;
  specialties?: string[];
  education?: string[];
  career: string[];
  lectures?: string[];
  awards?: string[];
  research?: string[];
  publications?: string[];
  assignment: string;
}

export const INSTRUCTORS: InstructorProfile[] = [
  {
    slug: "park-seongjae",
    name: "박성재",
    title: "대표",
    tagline: "AX 컨설턴트 · AI 실습 교육 · 업무 자동화 · 교육 서비스 개발",
    affiliation: "모모에듀(MOMOEDU) 대표",
    rounds: [1, 2],
    summary:
      "기업·대학 대상 AI 실습 교육과 교육 웹서비스·AI 시제품 개발을 수행하는 AX 컨설턴트. 공군·해운·엔지니어링 현장의 업무 분석·자동화 경험을 바탕으로 요구사항, 구현, 결과 검수를 연결합니다.",
    specialties: [
      "AX(인공지능을 활용한 업무 전환) 컨설팅",
      "AI 업무 자동화",
      "비개발자 실습 교육",
      "교육 서비스 개발",
    ],
    career: [
      "MOMOEDU — 스파르타 한국어 교육 웹서비스(회원·접근권한, 강의·퀴즈·학습 이력, 관리자 기능) 개발",
      "LG 생산기술원 — 채용 면접 일정 자동배정 시제품(PoC) 프로젝트 리딩·아키텍처 설계",
      "MOL LNG Fleet — 내부감사 보고서 지원 파일럿(현장 메모·증빙 → 영문 보고서 초안 → Word 출력)",
      "예다연 — AI 교육·쇼핑몰 구축·마케팅 컨설팅(2026년~현재)",
    ],
    lectures: [
      "대구보건대학교 Gemini·NotebookLM 활용 학습법 특강(2026.09., 학생 대상)",
      "예다연 브랜드 담당자 대상 맞춤형 AI 실습 교육(콘텐츠 기획·이미지·영상·웹 상세페이지 제작)",
    ],
    assignment: "본 워크숍 1차(Claude Skill 기반 교수법 활용(기초))·2차(전공-AI 연계 모델 수립) 담당",
  },
  {
    slug: "im-sanghoon",
    name: "임상훈",
    title: "교수",
    tagline: "교육공학 박사 · AX 교수학습",
    affiliation: "국립금오공과대학교 교양학부/교육공학 전공 부교수",
    rounds: [3],
    education: [
      "한양대학교 일반대학원 교육공학 박사(2017)",
      "한양대학교 일반대학원 교육공학 석사(2007)",
      "한양대학교 재료공학 학사(2005)",
    ],
    career: [
      "국립금오공과대학교 교양학부/교육공학 전공 부교수(2022.09~현재)",
      "국립금오공과대학교 기획협력처장 및 신문방송사주간(2026.06~현재)",
      "국립금오공과대학교 미래교육혁신본부장 및 AX교수학습센터장(2023.03~2026.05)",
      "한남대학교 취업창업처 조교수(2019.09~2022.08)",
      "한양대학교 교육혁신단 IC-PBL교수학습센터 책임연구원(2014.08~2019.08)",
      "NAVER I&S Learning Design팀 파트장/과장(2008.05~2014.03)",
    ],
    research: [
      "연구책임자, 대구미래교육연구원 정책연구 — AI 디지털교과서 활용 평가모델(중등) 개발 연구",
      "연구책임자, 한국연구재단 일반공동연구지원사업 — 대학교원 퍼소나 모델링 기반 교수 역량 개발을 위한 가상공간 플랫폼 프로토타입 설계(2020.07~2022.06)",
      "자문위원, 삼성전자-세이브더칠드런 삼성스마트스쿨 미래교육 프로젝트(2021.07~2021.12)",
    ],
    awards: [
      "2017 박사학위 우수논문상(한양대학교 총장 수여)",
      "2012 Best Service Leader상(NAVER I&S 대표이사 수여)",
    ],
    assignment:
      "본 워크숍 3차(AI 윤리 가이드 강의계획서 반영 / AI 활용 과정평가 루브릭·CQI, 온라인) 담당",
  },
  {
    slug: "yeon-jeongho",
    name: "연정호",
    title: "박사",
    affiliation: "SK하이닉스 미래기술연구원(반도체소자개발)",
    rounds: [4, 5],
    education: [
      "세종대학교 전자정보통신공학 학사(2007)",
      "한국과학기술원(KAIST) 전기및전자공학 석사(2009)·박사(2014)",
    ],
    career: ["SK하이닉스 미래기술연구원 반도체소자개발(2014.2~현재)"],
    lectures: [
      "경상국립대학교 GeNiUs 1박2일 AI 활용 특강",
      "경상국립대학교 교수/교직원 대상 NotebookLM 활용 특강",
      "상명대학교 학사과정 학생 대상 AI 활용 특강",
    ],
    publications: ["저서 「이기적인 새벽출근」"],
    assignment:
      "본 워크숍 4차(NotebookLM·RAG 기반 AI 튜터 만들기)·5차(Claude Skill 기반 교수법 활용(심화)) 담당",
  },
  {
    slug: "choi-youngbok",
    name: "최영복",
    title: "대표",
    tagline: "생성형 AI · OA · 문제해결 · 문서작성/기획보고",
    affiliation: "앤펄스컨설팅(Nplus) 대표",
    rounds: [6, 7],
    specialties: [
      "생성형 AI",
      "OA(엑셀, 파워포인트, 한글)",
      "문제해결",
      "문서작성, 기획보고",
      "산업/기술 트렌드",
      "디자인 씽킹/퍼실리테이터",
    ],
    education: [
      "아주대학교 경영대학원 코칭과정 석사",
      "국제코칭 자격(ACC) / 2022.09.20. / ICF",
      "NCS기반의 훈련과정 편성과정 수료(한국기술대학교)",
      "능력중심채용모델 인사담당자, 면접관 교육과정 수료",
    ],
    career: [
      "현) 앤펄스컨설팅 대표(2014~현재)",
      "현) 공정채용컨설팅 컨설턴트(2023~현재)",
      "전) 경희대학교 미래인재개발센터 겸임교수(2017~2024)",
      "전) 부천대학교 정보통신과 외래교수(2014~2024)",
      "전) 잡코리아(유) 경인지사 선임컨설턴트(2010~2014)",
    ],
    lectures: [
      "대성에너지 AI기반 조직활성화 교육",
      "서울교통공사 AI와 함께하는 융합과 창조교육",
      "국토부 4차산업 혁명 모빌리티 특강",
      "부산 교통공사 임원 대상 AI 사무 자동화",
      "STX 임원 대상 DX 대응 전략 수립",
      "서울시설공단 중간관리자 대상 GPT 기반 업무 효율화 과정 3차수",
      "한국수자원공사 신규직원 AI기반 데이터 분석 기초 과정 2차수",
      "인천도시공사 중간관리자 대상 GPT 활용 보고서 작성법 교육 3차수",
      "대전도시공사 AI활용 스마트 도시계획 실무 과정 4차수",
      "연세대학교 교직원 대상 AI기반 강의 콘텐츠 제작 과정",
      "한양대학교 디지털 리터러시와 AI 활용 기초 과정",
      "경희대학교 교직원 학생 대상 ChatGPT 업무 자동화 실습",
      "통계청 데이터분석센터 머신러닝 기반 데이터 처리 교육",
    ],
    assignment: "본 워크숍 6차(ChatGPT Skill 기반 교수법 활용)·7차(MCP 기반 AI 에이전트 제작) 담당",
  },
];

export function findInstructor(name: string): InstructorProfile | undefined {
  return INSTRUCTORS.find((i) => i.name === name);
}

// ----------------------------------------------------------------------------
// 만족도조사 문항 초안 v0.9 (PRD §5.4 — 운영자 확정 후 v1.0)
// ----------------------------------------------------------------------------
export const SURVEY_VERSION = "v0.9";

export const COLLEGE_GROUP_OPTIONS = ["인문사회", "자연공학", "의약·간호", "예체능", "기타"];

export const AWARENESS_PATH_OPTIONS = [
  "AI-X 교원 개별 안내(메일·문자)",
  "학과·부서 공지(공문)",
  "대학 홈페이지·포털",
  "동료 추천",
  "기타",
];

export const SURVEY_LIKERT_QUESTIONS = [
  { key: "q1", text: "워크숍 내용은 사전 안내된 주제·수준(초급/중급/고급)에 부합하였다." },
  {
    key: "q2",
    text: "워크숍 운영(진행 방식·시간 배분·실습 환경, 같은 날 세션 간 연계 구성)은 적절하였다.",
  },
  { key: "q3", text: "강사의 전달력과 전문성은 우수하였다." },
  { key: "q4", text: "워크숍 내용을 담당(예정) AI-X 교과목의 설계·운영·평가에 적용할 수 있다." },
  { key: "q5", text: "유료계정(Claude·ChatGPT) 등 지원사항은 실습에 도움이 되었다." },
  { key: "q6", text: "본 워크숍은 AI-X 교과목 개발·인증 추진에 도움이 되었다." },
  { key: "q7", text: "향후 유사한 워크숍이 있다면 참여(추천)할 의향이 있다." },
] as const;

export type LikertKey = (typeof SURVEY_LIKERT_QUESTIONS)[number]["key"];

export const SURVEY_OPEN_QUESTIONS = [
  { key: "o1", text: "추가로 개설을 희망하는 주제(차기 수요조사 연계)", maxLength: 500 },
  { key: "o2", text: "개선 의견 및 기타", maxLength: 2000 },
] as const;

export const LIKERT_SCALE_LABELS = [
  "1점(전혀 그렇지 않다)",
  "2점(그렇지 않다)",
  "3점(보통이다)",
  "4점(그렇다)",
  "5점(매우 그렇다)",
];
