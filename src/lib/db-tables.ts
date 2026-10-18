/** Supabase 테이블·뷰·버킷 이름 상수 (PRD §7) */
export const TABLES = {
  WORKSHOP_DAYS: "workshop_days",
  WORKSHOPS: "workshops",
  APPLICATIONS: "applications",
  SURVEY: "survey_responses",
  CERTIFICATES: "certificates",
  LEGACY_CERTIFICATES: "legacy_certificates",
  CERTIFICATE_LEDGER: "certificate_ledger",
  CERTIFICATE_TEMPLATES: "certificate_templates",
  ADMIN_USERS: "admin_users",
  EMAIL_LOGS: "email_logs",
  EMAIL_TEMPLATES: "email_templates",
  EMAIL_SETTINGS: "email_settings",
} as const;

export const CERTIFICATES_BUCKET = "certificates";

/**
 * workshops의 공개 컬럼 목록. zoom_link·prelearning_url은 anon/authenticated에 SELECT 권한이
 * 없으므로(0001_init.sql) select("*")를 쓰면 권한 오류가 난다 — 반드시 이 목록을 사용한다.
 */
export const WORKSHOP_PUBLIC_COLUMNS =
  "id, day_id, round, round_label, topic, contents, start_at, end_at, order_in_day, capacity, deadline, apply_open_at, notes, created_at";

/** applications 임베드용 세션 요약 컬럼 */
export const WORKSHOP_SUMMARY_SELECT =
  "workshop:workshops(id, round, round_label, topic, start_at, end_at, day:workshop_days(day_code, day_label, location, location_url, is_online))";
