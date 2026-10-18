import { NextResponse } from "next/server";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

/** 공개 API 본인확인 입력 공통 규칙 */
export const PHONE_REGEX = /^01[0-9]-?\d{3,4}-?\d{4}$/;
