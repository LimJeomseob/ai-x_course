/**
 * Supabase(Postgres) 테이블과 1:1로 대응하는 타입 정의 (PRD §7 참조)
 */

export type WorkshopLevel = "초급" | "중급" | "고급";

/** workshop_days — 운영일(세션 묶음·표시 단위, Day A~D) */
export interface WorkshopDay {
  id: string;
  day_code: string; // A~D
  day_label: string; // 11/5(목)
  program_group: string;
  instructor: string;
  instructor_title: string;
  instructor_org: string;
  location: string;
  location_url: string | null; // 대면 = 네이버 지도, 온라인 = null
  is_online: boolean;
  level: WorkshopLevel;
  target: string;
  notes: string; // 운영일 공통 협조사항
  link_notice: string | null;
}

export interface WorkshopContent {
  no: number;
  content: string;
}

/** workshops — 세션(차수) = 신청 단위. zoom_link·prelearning_url은 공개 컬럼이 아니므로 제외 */
export interface Workshop {
  id: string;
  day_id: string;
  round: number;
  round_label: string; // 1차~7차
  topic: string;
  contents: WorkshopContent[];
  start_at: string;
  end_at: string;
  order_in_day: number;
  capacity: number;
  /** 정원 초과 시 추가 접수하는 대기자 한도(대면 5 / 온라인 0) */
  waitlist_capacity: number;
  deadline: string;
  apply_open_at: string;
  notes: string;
  created_at: string;
}

/** 관리자 세션 관리 화면 전용(서버 API가 service role로 조회) */
export interface WorkshopAdminLinks {
  id: string;
  round: number;
  round_label: string;
  topic: string;
  start_at: string;
  notes: string;
  zoom_link: string | null;
  prelearning_url: string | null;
  day: Pick<WorkshopDay, "day_code" | "day_label" | "notes" | "is_online">;
}

export type ApplicationStatus = "신청완료" | "대기" | "취소" | "이수";

export const APPLICATION_STATUSES: ApplicationStatus[] = ["신청완료", "대기", "취소", "이수"];

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as string[]).includes(value);
}

export type AxisParticipant = "axis" | "faculty" | "other";

export interface Application {
  id: string;
  workshop_id: string;
  batch_id: string | null;
  name: string;
  affiliation: string;
  id_number: string;
  axis_participant: AxisParticipant;
  phone: string;
  phone_digits: string;
  email: string;
  consent: boolean;
  status: ApplicationStatus;
  cert_issued: boolean;
  created_by_admin: boolean;
  notice1_confirmed: boolean;
  notice2_confirmed: boolean;
  notice3_confirmed: boolean;
  created_at: string;
}

export type WorkshopSummary = Pick<
  Workshop,
  "id" | "round" | "round_label" | "topic" | "start_at" | "end_at"
> & { day: Pick<WorkshopDay, "day_code" | "day_label" | "location" | "location_url" | "is_online"> };

export interface ApplicationWithWorkshop extends Application {
  workshop: WorkshopSummary;
}

/** apply_sessions RPC 응답 */
export interface ApplySessionResult {
  workshop_id: string;
  round?: number;
  round_label?: string;
  topic?: string;
  ok: boolean;
  application_id?: string;
  /** ok=true일 때 접수 상태: 정원 내 '신청완료' 또는 정원 초과 '대기' */
  status?: ApplicationStatus;
  code?: string;
  message?: string;
}

export interface ApplySessionsResponse {
  batch_id: string;
  results: ApplySessionResult[];
}

export interface SurveyResponse {
  id: string;
  workshop_round: number | null;
  workshop: string;
  axis_participant: AxisParticipant;
  college_group: string;
  awareness_path: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  q5: number;
  q6: number;
  q7: number;
  o1: string;
  o2: string;
  submitted_at: string;
}

export interface Certificate {
  id: string;
  application_id: string;
  cert_no: string;
  issuer: string;
  issued_at: string;
  reissue_count: number;
  pdf_path: string | null;
  issued_channel: "admin" | "public";
  updated_at: string;
}

/** certificate_ledger 뷰 1행 — 레거시 ∪ 신규 단일 대장 (PRD §6.4, §7.7) */
export interface CertificateLedgerRow {
  seq: number;
  source_type: "legacy" | "new";
  cert_no: string;
  name: string;
  affiliation: string;
  course: string;
  period: string;
  issued_at: string | null;
  issued_at_label: string | null;
  issued_channel: string;
  reissue_count: number;
  reissued_at: string | null;
  issuer: string;
  pdf_stored: boolean;
  pdf_path: string | null;
  application_id: string | null;
  round: number | null;
}

/** certificate_templates.template — 수료증 서식 JSON(이미지 base64 보존) */
export interface CertificateTemplateImage {
  key: string;
  dataUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CertificateTemplateText {
  key: string;
  text: string; // {발급번호}{성명}{소속}{프로그램명}{기간}{발급일} 치환 변수 지원
  x?: number;
  y: number;
  size: number;
  weight?: "regular" | "bold";
  align?: "left" | "center";
  color?: string;
  maxWidth?: number;
  /** 지정 시 maxWidth 안에서 줄바꿈(최대 maxLines줄, 하한 minSize pt) */
  wrap?: { maxLines: number; minSize: number; lineHeight: number };
  /** 같은 그룹 안에서 앞 항목이 여러 줄로 늘어나면 뒤 항목을 그만큼 아래로 내린다 */
  flowGroup?: string;
}

export interface CertificateTemplate {
  version: number;
  page: { width: number; height: number };
  images: CertificateTemplateImage[];
  texts: CertificateTemplateText[];
}

/** POST /api/issue-certificate 응답 */
export interface IssueCertificateResponse {
  certNo: string;
  issuedAt: string;
  reissueCount: number;
  name: string;
  affiliation: string;
  round: number;
  roundLabel: string;
  topic: string;
  startAt: string;
  endAt: string;
  template: CertificateTemplate;
  upload: { path: string; token: string };
}

/** POST /api/lookup 응답 항목 */
export interface LookupResultItem {
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
  status: ApplicationStatus;
  certNo: string | null;
  certDownloadUrl: string | null;
}

export type EmailType = "M1" | "M2" | "M3" | "M4" | "M5";
export type EmailLogType = EmailType | "TEST" | "ALERT";
export type EmailLogStatus = "대기" | "성공" | "실패";

export interface EmailLog {
  id: string;
  application_id: string | null;
  batch_key: string;
  type: EmailLogType;
  to_email: string;
  subject: string;
  status: EmailLogStatus;
  error_message: string | null;
  retry_count: number;
  sent_at: string | null;
  created_at: string;
}

export interface EmailTemplateRow {
  id: string;
  type: EmailType;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  variables: string[];
  enabled: boolean;
  updated_at: string;
}

export interface EmailSettings {
  id: number;
  enabled: boolean;
  m1_send_time: string;
  m3_days_before: number;
  m5_send_time: string;
  m4_send_time: string;
  send_on_self_cancel: boolean;
  daily_limit: number;
  admin_alert_email: string;
  updated_at: string;
}

export type AdminRole = "admin" | "superadmin";

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
}
