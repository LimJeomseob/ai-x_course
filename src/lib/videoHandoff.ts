"use client";

/**
 * 신청 완료 → 「동영상 강의」 탭 이동 시 본인확인 정보를 넘긴다.
 * 개인정보를 URL에 싣지 않도록 sessionStorage(현재 브라우저 탭 한정)에 잠깐 두고, 읽는 즉시 지운다.
 * 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 조용히 건너뛰며, 그때는 수강자가 직접 입력한다.
 */
const KEY = "aix-video-handoff";
const TTL_MS = 10 * 60 * 1000;

export interface VideoHandoff {
  name: string;
  phone: string;
  /** 함께 신청 완료된 세션 수(동영상 포함) */
  appliedCount: number;
}

export function saveVideoHandoff(value: VideoHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...value, at: Date.now() }));
  } catch {
    /* 저장 불가 환경 */
  }
}

export function consumeVideoHandoff(): VideoHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as VideoHandoff & { at?: number };
    if (!v.at || Date.now() - v.at > TTL_MS || !v.name || !v.phone) return null;
    return { name: v.name, phone: v.phone, appliedCount: Number(v.appliedCount) || 1 };
  } catch {
    return null;
  }
}
