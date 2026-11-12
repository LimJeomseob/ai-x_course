/**
 * 포털 고정 콘텐츠(프로그램 소개·공지·선택지·설문 문항·강사 프로필)의 언어별 묶음.
 * 한국어는 src/lib/constants.ts 원문을 그대로 쓰고, 영어는 이 파일의 번역본을 쓴다.
 * 선택지의 value는 DB 저장값(한국어)이며 label만 언어별로 바뀐다.
 */
import {
  AWARENESS_PATH_OPTIONS,
  AXIS_OPTIONS,
  BACKGROUND_ITEMS,
  BENEFITS,
  COLLEGE_GROUP_OPTIONS,
  DEADLINE_NOTICE,
  INSTRUCTORS,
  LIKERT_SCALE_LABELS,
  ORGANIZER_NAME,
  ORG_NAME,
  OVERVIEW_ITEMS,
  OVERVIEW_LOCATION_TEXT,
  PROGRAM_NAME,
  PROGRAM_YEAR_TITLE,
  SCHEDULE_CHANGE_NOTICES,
  SURVEY_LIKERT_QUESTIONS,
  SURVEY_OPEN_QUESTIONS,
  type InstructorProfile,
  type LikertKey,
} from "@/lib/constants";
import type { AxisParticipant } from "@/lib/types";
import type { Locale } from "./config";

export interface PortalContent {
  programName: string;
  programYearTitle: string;
  orgName: string;
  organizerName: string;
  backgroundItems: string[];
  overviewItems: { label: string; value: string }[];
  overviewLocationText: string;
  benefits: { title: string; body: string; note?: string }[];
  deadlineNotice: string;
  notices: { title: string; apology: string; session: string; before: string; after: string; note: string }[];
  axisOptions: { value: AxisParticipant; label: string; surveyLabel: string }[];
  collegeGroupOptions: { value: string; label: string }[];
  awarenessOptions: { value: string; label: string }[];
  likertQuestions: { key: LikertKey; text: string }[];
  openQuestions: { key: "o1" | "o2"; text: string; maxLength: number }[];
  likertLabels: string[];
  /** workshop_days.instructor(한국어 성명) → 프로필 */
  findInstructor: (koName: string) => InstructorProfile | undefined;
}

const SURVEY_AXIS_LABEL_KO: Record<AxisParticipant, string> = {
  axis: "AXIS 참여 교원",
  faculty: "그 외 전임교원",
  other: "기타",
};

const ko: PortalContent = {
  programName: PROGRAM_NAME,
  programYearTitle: PROGRAM_YEAR_TITLE,
  orgName: ORG_NAME,
  organizerName: ORGANIZER_NAME,
  backgroundItems: BACKGROUND_ITEMS,
  overviewItems: OVERVIEW_ITEMS,
  overviewLocationText: OVERVIEW_LOCATION_TEXT,
  benefits: BENEFITS,
  deadlineNotice: DEADLINE_NOTICE,
  notices: SCHEDULE_CHANGE_NOTICES,
  axisOptions: AXIS_OPTIONS.map((o) => ({ value: o.value, label: o.label, surveyLabel: SURVEY_AXIS_LABEL_KO[o.value] })),
  collegeGroupOptions: COLLEGE_GROUP_OPTIONS.map((o) => ({ value: o, label: o })),
  awarenessOptions: AWARENESS_PATH_OPTIONS.map((o) => ({ value: o, label: o })),
  likertQuestions: SURVEY_LIKERT_QUESTIONS.map((q) => ({ key: q.key, text: q.text })),
  openQuestions: SURVEY_OPEN_QUESTIONS.map((q) => ({ key: q.key, text: q.text, maxLength: q.maxLength })),
  likertLabels: LIKERT_SCALE_LABELS,
  findInstructor: (koName) => INSTRUCTORS.find((i) => i.name === koName),
};

const EN_PROGRAM_NAME = "AI Competency Workshop for AI-X Course Development and Certification";
const EN_ORGANIZER = "AI Convergence Institute, Gyeongsang National University";

/** 영문 강사 프로필 — 키는 workshop_days.instructor(한국어 성명). 영문 표기는 대학 공식 표기 확인 필요 */
const EN_INSTRUCTORS: Record<string, InstructorProfile> = {
  박성재: {
    slug: "park-seongjae",
    name: "Park Seongjae",
    title: "CEO",
    tagline: "AX consultant · Hands-on AI training · Work automation · Education service development",
    affiliation: "CEO, MOMOEDU",
    rounds: [1, 2],
    summary:
      "An AX consultant who delivers hands-on AI training for companies and universities and builds education web services and AI prototypes. Drawing on work-analysis and automation experience in air force, shipping, and engineering settings, he connects requirements, implementation, and result verification.",
    specialties: [
      "AX (AI-driven work transformation) consulting",
      "AI work automation",
      "Hands-on training for non-developers",
      "Education service development",
    ],
    career: [
      "MOMOEDU — Developed the Sparta Korean-language education web service (membership and access control, lectures, quizzes, learning history, admin features)",
      "LG Production Engineering Research Institute — Led the project and designed the architecture for an interview-scheduling auto-assignment prototype (PoC)",
      "MOL LNG Fleet — Internal audit report support pilot (field notes and evidence → English report draft → Word output)",
      "Yedayeon — AI training, online store setup, and marketing consulting (2026–present)",
    ],
    lectures: [
      "Daegu Health College — Special lecture on study methods with Gemini and NotebookLM (Sep. 2026, for students)",
      "Yedayeon — Customized hands-on AI training for brand managers (content planning, images, video, web product pages)",
    ],
    assignment:
      "Leads Session 1 (Teaching with Claude Skills, Basics) and Session 2 (Building a Major–AI Integration Model)",
  },
  임상훈: {
    slug: "im-sanghoon",
    name: "Im Sanghoon",
    title: "Professor",
    tagline: "Ph.D. in Educational Technology · AX teaching and learning",
    affiliation:
      "Associate Professor of Educational Technology, School of Liberal Arts, Kumoh National Institute of Technology",
    rounds: [3],
    education: [
      "Ph.D. in Educational Technology, Hanyang University Graduate School (2017)",
      "M.A. in Educational Technology, Hanyang University Graduate School (2007)",
      "B.S. in Materials Engineering, Hanyang University (2005)",
    ],
    career: [
      "Associate Professor of Educational Technology, School of Liberal Arts, Kumoh National Institute of Technology (Sep. 2022–present)",
      "Dean of Planning and Cooperation and Director of the Press and Broadcasting Center, Kumoh National Institute of Technology (Jun. 2026–present)",
      "Head of the Future Education Innovation Division and Director of the AX Teaching and Learning Center, Kumoh National Institute of Technology (Mar. 2023–May 2026)",
      "Assistant Professor, Office of Career and Startup Support, Hannam University (Sep. 2019–Aug. 2022)",
      "Senior Researcher, IC-PBL Center for Teaching and Learning, Hanyang University (Aug. 2014–Aug. 2019)",
      "Part Leader/Manager, Learning Design Team, NAVER I&S (May 2008–Mar. 2014)",
    ],
    research: [
      "Principal investigator, Daegu Future Education Research Institute policy study — Developing an evaluation model for AI digital textbook use (secondary education)",
      "Principal investigator, National Research Foundation of Korea joint research program — Prototype design of a virtual-space platform for faculty teaching competency development based on faculty persona modeling (Jul. 2020–Jun. 2022)",
      "Advisory committee member, Samsung Electronics–Save the Children Samsung Smart School future education project (Jul.–Dec. 2021)",
    ],
    awards: [
      "2017 Outstanding Doctoral Dissertation Award (President of Hanyang University)",
      "2012 Best Service Leader Award (CEO of NAVER I&S)",
    ],
    assignment:
      "Leads Session 3 (Reflecting AI Ethics Guidelines in the Syllabus / Process-Assessment Rubrics & CQI for AI Use, online)",
  },
  연정호: {
    slug: "yeon-jeongho",
    name: "Yeon Jeongho",
    title: "Ph.D.",
    affiliation: "SK hynix R&D (semiconductor device development)",
    rounds: [4, 5],
    education: [
      "B.S. in Electronics, Information and Communication Engineering, Sejong University (2007)",
      "M.S. (2009) and Ph.D. (2014) in Electrical Engineering, KAIST",
    ],
    career: ["Semiconductor device development, SK hynix (Feb. 2014–present)"],
    lectures: [
      "Gyeongsang National University — GeNiUs two-day special lecture on using AI",
      "Gyeongsang National University — Special lecture on NotebookLM for faculty and staff",
      "Sangmyung University — Special lecture on using AI for undergraduate students",
    ],
    publications: ["Author of the book 「이기적인 새벽출근」 (in Korean)"],
    assignment:
      "Leads Session 4 (Building an AI Tutor with NotebookLM and RAG) and Session 5 (Teaching with Claude Skills, Advanced)",
  },
  최영복: {
    slug: "choi-youngbok",
    name: "Choi Youngbok",
    title: "CEO",
    tagline: "Generative AI · Office automation · Problem solving · Documents and planning reports",
    affiliation: "CEO, Nplus Consulting",
    rounds: [6, 7],
    specialties: [
      "Generative AI",
      "Office software (Excel, PowerPoint, Hangul)",
      "Problem solving",
      "Document writing and planning reports",
      "Industry and technology trends",
      "Design thinking / facilitation",
    ],
    education: [
      "M.A. in Coaching, Ajou University Graduate School of Business",
      "ICF Associate Certified Coach (ACC), Sep. 20, 2022",
      "Completed the NCS-based training curriculum design course (Korea University of Technology and Education)",
      "Completed the competency-based hiring model course for HR managers and interviewers",
    ],
    career: [
      "CEO, Nplus Consulting (2014–present)",
      "Consultant, Fair Hiring Consulting (2023–present)",
      "Former adjunct professor, Center for Future Talent Development, Kyung Hee University (2017–2024)",
      "Former visiting lecturer, Dept. of Information and Communication, Bucheon University (2014–2024)",
      "Former senior consultant, JobKorea Gyeongin Branch (2010–2014)",
    ],
    lectures: [
      "Daesung Energy — AI-based organizational vitalization training",
      "Seoul Metro — Convergence and creativity training with AI",
      "Ministry of Land, Infrastructure and Transport — Special lecture on Industry 4.0 mobility",
      "Busan Transportation Corporation — AI office automation for executives",
      "STX — DX response strategy for executives",
      "Seoul Facilities Corporation — GPT-based work efficiency course for middle managers (3 cohorts)",
      "K-water — AI-based data analysis basics for new employees (2 cohorts)",
      "Incheon Housing and City Development Corporation — Report writing with GPT for middle managers (3 cohorts)",
      "Daejeon Metropolitan Corporation — Smart urban planning practice with AI (4 cohorts)",
      "Yonsei University — AI-based lecture content creation for staff",
      "Hanyang University — Digital literacy and AI basics",
      "Kyung Hee University — ChatGPT work automation practice for staff and students",
      "Statistics Korea Data Analysis Center — Machine-learning-based data processing training",
    ],
    assignment: "Leads Session 6 (Teaching with ChatGPT Skills) and Session 7 (Building AI Agents with MCP)",
  },
};

const en: PortalContent = {
  programName: EN_PROGRAM_NAME,
  programYearTitle: "AY 2026 Workshop for Smooth AI-X Course Development",
  orgName: "Gyeongsang National University",
  organizerName: EN_ORGANIZER,
  backgroundItems: [
    "As the Glocal University 30 project advances AI-X course development and certification, faculty who design and teach major–AI integrated courses need stronger AI competencies.",
    "The AI teaching competency self-assessment showed high demand for support in course operation, learner support, and major–AI integration design, calling for hands-on, tailored workshops.",
    "Topics and schedules reflect the priorities of the AI-X faculty training needs survey, making this a demand-driven workshop.",
  ],
  overviewItems: [
    { label: "Program", value: EN_PROGRAM_NAME },
    { label: "For", value: "Faculty applying for AI-X course development/certification, and other interested faculty" },
    { label: "Application period", value: "Wed, Oct 21, 2026 – one day before each session (online application)" },
    { label: "Dates", value: "Thu, Nov 5 – Fri, Nov 20, 2026 (7 sessions in total)" },
    { label: "Capacity", value: "150 for in-person workshops (6 sessions × 25), no limit for the online lecture" },
    { label: "Format", value: "Hands-on in-person (and online) workshops" },
    { label: "How to apply", value: "Select sessions in this application system (first come, first served)" },
    { label: "Support", value: "Paid accounts for Claude, ChatGPT, etc." },
    { label: "Organizer", value: EN_ORGANIZER },
  ],
  overviewLocationText: "HyFlex Classroom (1F) and Computer Lab, Academic Information Center (Bldg. 4)",
  benefits: [
    {
      title: "Faculty in the AXIS program",
      body: "Recognized as completing a program for AI-X course development/certification, and as completing a teaching-methods program",
      note: "※ After completing the program through this system, attach the certificate to your AI-X course development/certification report.",
    },
    { title: "Other full-time faculty", body: "Recognized as completing a teaching-methods program" },
  ],
  deadlineNotice: "each session closes automatically at 23:59 the day before it runs",
  notices: [
    {
      title: "Session 3 time change",
      apology:
        "Due to an error in the website notice, the time for Session 3 was announced incorrectly. We apologize for the confusion.",
      session:
        "Session 3 · Wed, Nov 11 · Online (Zoom) · Reflecting AI Ethics Guidelines in the Syllabus / Process-Assessment Rubrics & CQI for AI Use",
      before: "13:30–15:30",
      after: "15:30–17:30",
      note: "Existing applications remain valid. The Zoom link will be emailed one day before (Nov 10). Thank you for your understanding.",
    },
  ],
  axisOptions: [
    {
      value: "axis",
      label: "Faculty applying for AI-X course development/certification (AXIS participant)",
      surveyLabel: "AXIS participant",
    },
    { value: "faculty", label: "Other full-time faculty", surveyLabel: "Other full-time faculty" },
    { value: "other", label: "Other (non-tenure-track faculty, staff)", surveyLabel: "Other" },
  ],
  collegeGroupOptions: [
    { value: "인문사회", label: "Humanities & social sciences" },
    { value: "자연공학", label: "Natural sciences & engineering" },
    { value: "의약·간호", label: "Medicine, pharmacy & nursing" },
    { value: "예체능", label: "Arts & physical education" },
    { value: "기타", label: "Other" },
  ],
  awarenessOptions: [
    { value: "AI-X 교원 개별 안내(메일·문자)", label: "Individual notice to AI-X faculty (email/text)" },
    { value: "학과·부서 공지(공문)", label: "Department/office notice (official letter)" },
    { value: "대학 홈페이지·포털", label: "University website/portal" },
    { value: "동료 추천", label: "Recommended by a colleague" },
    { value: "기타", label: "Other" },
  ],
  likertQuestions: [
    { key: "q1", text: "The workshop content matched the announced topic and level (beginner/intermediate/advanced)." },
    {
      key: "q2",
      text: "The workshop was run appropriately (delivery, time allocation, lab environment, and linkage between same-day sessions).",
    },
    { key: "q3", text: "The instructor communicated well and demonstrated expertise." },
    { key: "q4", text: "I can apply the content to designing, teaching, and assessing my (planned) AI-X course." },
    { key: "q5", text: "The support provided, such as paid accounts (Claude, ChatGPT), helped the hands-on practice." },
    { key: "q6", text: "This workshop helped me move forward with AI-X course development/certification." },
    { key: "q7", text: "I would attend (or recommend) a similar workshop in the future." },
  ],
  openQuestions: [
    { key: "o1", text: "Topics you would like to see offered (for the next needs survey)", maxLength: 500 },
    { key: "o2", text: "Suggestions for improvement and other comments", maxLength: 2000 },
  ],
  likertLabels: ["1 (Strongly disagree)", "2 (Disagree)", "3 (Neutral)", "4 (Agree)", "5 (Strongly agree)"],
  findInstructor: (koName) => EN_INSTRUCTORS[koName],
};

const CONTENT: Record<Locale, PortalContent> = { ko, en };

export function getContent(locale: Locale): PortalContent {
  return CONTENT[locale];
}
