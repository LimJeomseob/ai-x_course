/**
 * 브라우저 시청 추적기 — aiguide(assets/app.js)의 initTracker·markBins·tick·toRanges·firstGap 이식.
 *  - 1초 단위 칸(bin)에 실제로 재생된 구간을 표시한다.
 *  - 재생 중 + 화면이 보일 때만 재생 누적(watched)을 늘린다(일시정지·다른 탭 시간 제외).
 *  - 정상 속도로 앞으로 진행한 경우에만 구간을 칠한다(건너뛰기·되감기는 칠하지 않음).
 */
import type { Range } from "@/lib/videoRanges";

/** 한 번 tick에서 인정하는 최대 재생 시간(초) — 탭 멈춤 후 몰아서 더해지는 것 방지 */
const MAX_TICK_ADD_SEC = 2;

export class WatchTracker {
  readonly duration: number;
  private bins: Uint8Array;
  private coveredCount = 0;
  watched: number;
  private playing = false;
  private lastPos = 0;
  private lastTick = 0;

  constructor(durationSec: number, ranges: Range[], watchedSec: number) {
    this.duration = Math.max(1, Math.round(durationSec));
    this.bins = new Uint8Array(this.duration);
    for (const [a, b] of ranges) this.mark(a, b);
    this.watched = Math.max(0, watchedSec);
  }

  private mark(from: number, to: number) {
    const a = Math.max(0, Math.floor(from));
    const b = Math.min(this.bins.length, Math.floor(to));
    for (let i = a; i < b; i++) {
      if (!this.bins[i]) {
        this.bins[i] = 1;
        this.coveredCount++;
      }
    }
  }

  /** 서버가 돌려준 구간(다른 기기에서 본 구간 포함)을 합친다 */
  merge(ranges: Range[], watchedSec: number) {
    for (const [a, b] of ranges) this.mark(a, b);
    this.watched = Math.max(this.watched, watchedSec);
  }

  /**
   * 1초마다 호출. 반환값 = 이번 tick에서 더한 재생 시간(초).
   * @param nowMs performance.now()
   * @param isPlaying 플레이어가 재생 중인지
   * @param position 현재 재생 위치(초)
   * @param visible 화면이 보이는지
   */
  tick(nowMs: number, isPlaying: boolean, position: number, visible: boolean): number {
    let added = 0;
    if (isPlaying && visible) {
      if (!this.playing) {
        this.playing = true; // 재생 직후: 기준점만 잡는다
        this.lastPos = position;
      } else {
        const dt = (nowMs - this.lastTick) / 1000;
        const adv = position - this.lastPos;
        if (dt > 0 && dt < 5) {
          added = Math.min(dt, MAX_TICK_ADD_SEC);
          this.watched += added;
          if (adv > 0 && adv <= dt * 1.5 + 0.6) this.mark(this.lastPos, position);
        }
        this.lastPos = position;
      }
    } else {
      this.playing = false;
    }
    this.lastTick = nowMs;
    return added;
  }

  /** 재생 상태가 바뀌면(재생·일시정지·이동) 다음 tick에서 기준점을 다시 잡게 한다 */
  resetBaseline() {
    this.playing = false;
  }

  /** 영상 끝까지 재생되어 종료된 경우, 마지막 칸(소수점 꼬리)을 채운다 */
  markEnd(position: number) {
    if (position >= this.duration - 2 && this.lastPos >= this.duration - 3) this.mark(this.lastPos, this.duration);
  }

  ranges(): Range[] {
    const out: Range[] = [];
    let start = -1;
    for (let i = 0; i <= this.bins.length; i++) {
      if (i < this.bins.length && this.bins[i]) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        out.push([start, i]);
        start = -1;
      }
    }
    return out;
  }

  ratio(): number {
    return Math.min(1, Math.min(this.coveredCount, this.watched) / this.duration);
  }

  remaining(passRatio: number): number {
    return Math.max(0, Math.ceil(passRatio * this.duration - Math.min(this.coveredCount, this.watched)));
  }

  firstGap(): number {
    for (let i = 0; i < this.bins.length; i++) if (!this.bins[i]) return i;
    return -1;
  }
}
