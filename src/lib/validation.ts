import { z } from "zod";
import { formatPhone } from "./format";
import { MAX_SESSIONS_PER_PERSON } from "./constants";
import { getDict } from "./i18n/dict";
import type { Locale } from "./i18n/config";

// 한국 휴대폰 형식: 010-1234-5678, 01012345678, 011-234-5678 등 허용 (PRD §5.2)
const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** 언어별 오류 문구를 가진 검증 스키마 묶음. 관리자 화면은 한국어(ko)를 쓴다. */
function buildSchemas(locale: Locale) {
  const m = getDict(locale).validation;

  // 어떤 형식으로 입력해도 저장은 010-####-#### 한 가지로 통일한다
  const phoneSchema = z
    .string()
    .trim()
    .regex(PHONE_REGEX, m.phone)
    .transform((v) => formatPhone(v));

  const emailSchema = z.string().trim().max(254, m.email).regex(EMAIL_REGEX, m.email);

  const axisSchema = z.enum(["axis", "faculty", "other"], { error: m.axis });

  const applicantFields = {
    name: z.string().trim().min(1, m.nameRequired).max(50, m.nameMax),
    affiliation: z.string().trim().min(1, m.affiliationRequired).max(100, m.affiliationMax),
    idNumber: z.string().trim().min(1, m.idRequired).max(50, m.max50),
    axisParticipant: axisSchema,
    phone: phoneSchema,
    email: emailSchema,
    consent: z.literal(true, { error: m.consent }),
  };

  /** 공개 신청(§5.2) — 세션 복수 선택 */
  const applicationSchema = z.object({
    workshopIds: z.array(z.string().uuid()).min(1, m.sessionsMin).max(MAX_SESSIONS_PER_PERSON),
    ...applicantFields,
  });

  /** 관리자 대리등록(§6.2) — 세션 1개, 이메일 선택 입력 */
  const adminApplicationSchema = z.object({
    workshopId: z.string().uuid("세션을 선택해 주세요."),
    ...applicantFields,
    email: z
      .string()
      .trim()
      .refine((value) => value === "" || emailSchema.safeParse(value).success, { message: m.email }),
  });

  const lookupSchema = z.object({
    name: z.string().trim().min(1, m.nameRequired).max(50, m.nameMax),
    phone: phoneSchema,
  });

  const likert = z.number({ error: m.answerRequired }).int().min(1, m.answerRequired).max(5);

  /** 만족도조사 v0.9 (§5.4) */
  const surveySchema = z.object({
    workshopRound: z.number().int().positive(m.sessionRequired),
    axisParticipant: axisSchema,
    collegeGroup: z.string().trim().min(1, m.collegeRequired).max(50),
    awarenessPath: z.string().trim().min(1, m.awarenessRequired).max(100),
    q1: likert,
    q2: likert,
    q3: likert,
    q4: likert,
    q5: likert,
    q6: likert,
    q7: likert,
    o1: z.string().trim().max(500, m.max500).default(""),
    o2: z.string().trim().max(2000, m.max2000).default(""),
  });

  return { phoneSchema, emailSchema, axisSchema, applicationSchema, adminApplicationSchema, lookupSchema, surveySchema };
}

const SCHEMAS = { ko: buildSchemas("ko"), en: buildSchemas("en") };

export function getSchemas(locale: Locale) {
  return SCHEMAS[locale];
}

// 한국어 기본 스키마(관리자 화면·기존 호출부 호환)
export const { phoneSchema, emailSchema, axisSchema, applicationSchema, adminApplicationSchema, lookupSchema, surveySchema } =
  SCHEMAS.ko;

export type ApplicationInput = z.infer<typeof applicationSchema>;
export type AdminApplicationInput = z.infer<typeof adminApplicationSchema>;
export type LookupInput = z.infer<typeof lookupSchema>;
export type SurveyInput = z.infer<typeof surveySchema>;

/** zod 오류를 필드별 첫 메시지 맵으로 변환 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
