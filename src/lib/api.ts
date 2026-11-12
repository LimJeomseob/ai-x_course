import { NextResponse } from "next/server";
import { toLocale, type Locale } from "@/lib/i18n/config";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

/** 공개 API 본인확인 입력 공통 규칙 */
export const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;

/** 공개 API 요청 본문 상한(바이트). 정상 요청은 수 KB 이내다. */
const MAX_BODY_BYTES = 32 * 1024;

/**
 * JSON 본문과 화면 언어를 읽는다. 과도하게 큰 본문·잘못된 JSON은 null.
 * 언어는 허용 목록(ko/en)으로 정규화한다.
 */
export async function readJsonBody(req: Request): Promise<{ body: unknown; locale: Locale }> {
  let body: unknown = null;
  try {
    const text = await req.text();
    if (text.length <= MAX_BODY_BYTES) body = JSON.parse(text);
  } catch {
    body = null;
  }
  const locale = toLocale(body && typeof body === "object" ? (body as { locale?: unknown }).locale : undefined);
  return { body, locale };
}

/**
 * 검증 실패 시 사용자에게 보여 줄 문구. 우리가 지정한 문구만 그대로 쓰고,
 * 검증 라이브러리의 기본 문구(형식 오류 등)는 일반 안내로 바꾼다.
 */
export function issueMessage(issues: { message: string }[], fallback: string): string {
  const message = issues[0]?.message ?? "";
  return !message || message.startsWith("Invalid") ? fallback : message;
}
