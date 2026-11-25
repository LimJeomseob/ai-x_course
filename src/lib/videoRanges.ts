/**
 * 동영상 시청 구간 계산(서버·브라우저 공용, 순수 함수).
 * 구간은 [시작초, 끝초) 정수 쌍. aiguide(gas/Code.js)의 sanitizeRanges_·mergeRanges_·coveredSeconds_를 이식했다.
 */
export type Range = [number, number];

/** 비정상 값 제거 + 영상 길이로 자르기(최대 1000개) */
export function sanitizeRanges(input: unknown, durationSec: number): Range[] {
  if (!Array.isArray(input)) return [];
  const max = Math.ceil(durationSec);
  const out: Range[] = [];
  for (const r of input.slice(0, 1000)) {
    if (!Array.isArray(r) || r.length < 2) continue;
    const a = Math.max(0, Math.floor(Number(r[0])));
    const b = Math.min(max, Math.floor(Number(r[1])));
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) out.push([a, b]);
  }
  return out;
}

/** 겹치거나 맞닿은 구간을 합친다 */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((x, y) => x[0] - y[0]);
  const out: Range[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** 본 구간 합(초) */
export function coveredSeconds(ranges: Range[], durationSec: number): number {
  const max = Math.ceil(durationSec);
  return mergeRanges(ranges).reduce((sum, [a, b]) => sum + Math.max(0, Math.min(max, b) - Math.max(0, a)), 0);
}

/**
 * 이수 판정 비율 = min(본 구간 합, 실제 재생 누적) / 영상 길이.
 * 본 구간만 쓰면 구간을 조작한 요청을, 재생 누적만 쓰면 같은 구간 반복 재생을 막지 못한다.
 */
export function effectiveRatio(ranges: Range[], watchedSec: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.min(1, Math.min(coveredSeconds(ranges, durationSec), Math.max(0, watchedSec)) / durationSec);
}

/** 이수 기준까지 더 봐야 하는 초 */
export function remainingSeconds(ranges: Range[], watchedSec: number, durationSec: number, passRatio: number): number {
  const effective = Math.min(coveredSeconds(ranges, durationSec), Math.max(0, watchedSec));
  return Math.max(0, Math.ceil(passRatio * durationSec - effective));
}

/** 처음으로 안 본 위치(초). 모두 봤으면 -1 */
export function firstGap(ranges: Range[], durationSec: number): number {
  const merged = mergeRanges(ranges);
  let pos = 0;
  for (const [a, b] of merged) {
    if (a > pos) return pos;
    pos = Math.max(pos, b);
  }
  return pos < Math.ceil(durationSec) ? pos : -1;
}

/** 비율 비교용 부동소수 여유 */
export function meetsPass(ratio: number, passRatio: number): boolean {
  return ratio + 1e-9 >= passRatio;
}
