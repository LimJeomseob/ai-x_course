import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 공개 API 요청 횟수 제한(DB 고정 구간 카운터 — 0006의 check_rate_limit).
 * 서버리스 인스턴스 간에 공유되도록 메모리가 아닌 DB에 센다.
 * 키에는 IP·연락처 원문 대신 해시만 저장한다.
 */
export interface RateRule {
  /** 구간 내 허용 횟수 */
  limit: number;
  /** 구간 길이(초) */
  windowSec: number;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * 요청자 IP. Vercel은 x-forwarded-for를 플랫폼이 덮어써 위조할 수 없다.
 * 학내망은 여러 사용자가 같은 공인 IP를 쓰므로 IP 기준 한도는 넉넉하게 잡는다.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * 허용이면 true, 한도 초과면 false.
 * 카운터 함수 호출 자체가 실패하면(마이그레이션 미적용 등) 서비스 중단을 막기 위해 허용하고 로그만 남긴다.
 */
export async function allowRequest(
  db: SupabaseClient,
  scope: string,
  subject: string,
  rule: RateRule
): Promise<boolean> {
  const { data, error } = await db.rpc("check_rate_limit", {
    p_key: `${scope}:${hash(subject)}`,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSec,
  });
  if (error) {
    console.error(`[rate-limit] ${scope} 확인 실패(허용 처리):`, error.message);
    return true;
  }
  return data !== false;
}

/** IP 기준 + (선택) 식별자 기준 한도를 함께 확인한다. 하나라도 초과면 false. */
export async function allowPublicRequest(
  db: SupabaseClient,
  req: Request,
  scope: string,
  ipRule: RateRule,
  subject?: { value: string; rule: RateRule }
): Promise<boolean> {
  const checks = [allowRequest(db, `${scope}:ip`, clientIp(req), ipRule)];
  if (subject) checks.push(allowRequest(db, `${scope}:id`, subject.value, subject.rule));
  return (await Promise.all(checks)).every(Boolean);
}
