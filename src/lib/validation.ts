import { z } from "zod";
import { formatPhone } from "./format";
import { MAX_SESSIONS_PER_PERSON } from "./constants";

// 한국 휴대폰 형식: 010-1234-5678, 01012345678, 011-234-5678 등 허용 (PRD §5.2)
const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;

// 어떤 형식으로 입력해도 저장은 010-####-#### 한 가지로 통일한다
export const phoneSchema = z
  .string()
  .trim()
  .regex(PHONE_REGEX, "휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)")
  .transform((v) => formatPhone(v));

export const emailSchema = z.string().trim().email("이메일 형식이 올바르지 않습니다.");

export const axisSchema = z.enum(["axis", "faculty", "other"], {
  errorMap: () => ({ message: "AI-X 교과목 개발·인증 신청 여부를 선택해 주세요." }),
});

const applicantFields = {
  name: z.string().trim().min(1, "성명을 입력해 주세요.").max(50, "성명은 50자 이내로 입력해 주세요."),
  affiliation: z
    .string()
    .trim()
    .min(1, "소속을 입력해 주세요.")
    .max(100, "소속은 100자 이내로 입력해 주세요."),
  idNumber: z
    .string()
    .trim()
    .min(1, "교번/직번/학번/생년월일을 입력해 주세요.")
    .max(50, "50자 이내로 입력해 주세요."),
  axisParticipant: axisSchema,
  phone: phoneSchema,
  email: emailSchema,
  consent: z.literal(true, {
    errorMap: () => ({ message: "개인정보 수집·이용에 동의해 주세요." }),
  }),
};

/** 공개 신청(§5.2) — 세션 복수 선택 */
export const applicationSchema = z.object({
  workshopIds: z
    .array(z.string().uuid())
    .min(1, "신청할 세션을 1개 이상 선택해 주세요.")
    .max(MAX_SESSIONS_PER_PERSON),
  ...applicantFields,
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

/** 관리자 대리등록(§6.2) — 세션 1개, 이메일 선택 입력 */
export const adminApplicationSchema = z.object({
  workshopId: z.string().uuid("세션을 선택해 주세요."),
  ...applicantFields,
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || emailSchema.safeParse(value).success, {
      message: "이메일 형식이 올바르지 않습니다.",
    }),
});

export type AdminApplicationInput = z.infer<typeof adminApplicationSchema>;

export const lookupSchema = z.object({
  name: z.string().trim().min(1, "성명을 입력해 주세요."),
  phone: phoneSchema,
});

export type LookupInput = z.infer<typeof lookupSchema>;

const likert = z
  .number({ invalid_type_error: "응답을 선택해 주세요.", required_error: "응답을 선택해 주세요." })
  .int()
  .min(1, "응답을 선택해 주세요.")
  .max(5);

/** 만족도조사 v0.9 (§5.4) */
export const surveySchema = z.object({
  workshopRound: z.number().int().positive("참여 세션을 선택해 주세요."),
  axisParticipant: axisSchema,
  collegeGroup: z.string().trim().min(1, "소속 계열을 선택해 주세요."),
  awarenessPath: z.string().trim().min(1, "워크숍을 알게 된 경로를 선택해 주세요."),
  q1: likert,
  q2: likert,
  q3: likert,
  q4: likert,
  q5: likert,
  q6: likert,
  q7: likert,
  o1: z.string().trim().max(500, "500자 이내로 입력해 주세요.").default(""),
  o2: z.string().trim().max(2000, "2000자 이내로 입력해 주세요.").default(""),
});

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
