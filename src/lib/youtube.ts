"use client";

/**
 * YouTube IFrame Player API 최소 타입·로더. 영상은 YouTube 임베드로만 재생한다(파일을 서버에 두지 않음).
 * https://developers.google.com/youtube/iframe_api_reference
 */

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  destroy(): void;
}

interface YTPlayerOptions {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number; target: YTPlayer }) => void;
    onPlaybackRateChange?: (e: { data: number; target: YTPlayer }) => void;
    onError?: (e: { data: number; target: YTPlayer }) => void;
  };
}

interface YTNamespace {
  Player: new (el: HTMLElement | string, options: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("브라우저에서만 사용할 수 있습니다."));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;

  loading = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error("YouTube 플레이어를 불러오지 못했습니다. 네트워크를 확인해 주세요."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** YouTube 플레이어 오류 코드 → 안내 문구 */
export function youtubeErrorMessage(code: number): string {
  if (code === 100) return "영상을 찾을 수 없습니다(삭제되었거나 비공개). 관리자에게 문의해 주세요.";
  if (code === 101 || code === 150 || code === 153) {
    return "이 영상은 외부 사이트 재생이 허용되지 않았습니다. 관리자에게 문의해 주세요.";
  }
  return "영상을 재생할 수 없습니다. 새로고침하거나 다른 브라우저로 시도해 주세요.";
}
