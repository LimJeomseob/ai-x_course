import "server-only";

/**
 * 공개 본인확인 API(신청내역조회·취소·수료증 발급)의 대입 시도 제한.
 * 성명+연락처가 일치하지 않은 "실패" 요청만 IP·엔드포인트별로 집계한다 —
 * 학내 공용 IP에서 여러 명이 정상 이용하는 경우는 실패가 쌓이지 않으므로 영향이 없다.
 *
 * 서버리스 인스턴스 메모리에만 두는 최선 노력 방식이다(인스턴스별 집계, 재시작 시 초기화).
 * 엄격한 제한이 필요하면 Vercel WAF 속도 제한 규칙을 함께 쓴다.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 50;
const MAX_KEYS = 5000;

const failures = new Map<string, { count: number; resetAt: number }>();

export const RATE_LIMIT_MESSAGE = "확인 시도가 너무 많습니다. 10분 후 다시 시도해 주세요.";

/** 요청자 IP. 알 수 없으면 null — 이 경우 제한하지 않는다(정상 이용 차단 방지). */
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || null;
}

function keyOf(req: Request, scope: string): string | null {
  const ip = clientIp(req);
  return ip ? `${scope}:${ip}` : null;
}

/** 최근 10분간 본인확인 실패가 한도를 넘었으면 true. */
export function isRateLimited(req: Request, scope: string): boolean {
  const key = keyOf(req, scope);
  if (!key) return false;
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() >= entry.resetAt) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

/** 본인확인 실패 1회를 기록한다. */
export function recordFailure(req: Request, scope: string): void {
  const key = keyOf(req, scope);
  if (!key) return;
  const now = Date.now();
  const entry = failures.get(key);
  if (entry && now < entry.resetAt) {
    entry.count += 1;
    return;
  }
  if (failures.size >= MAX_KEYS) {
    for (const [k, v] of failures) if (now >= v.resetAt) failures.delete(k);
    if (failures.size >= MAX_KEYS) failures.clear();
  }
  failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
}
