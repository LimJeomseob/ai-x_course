"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { publicPost } from "@/lib/adminApi";
import type { VideoLesson, VideoLessonProgress, VideoProgressResponse } from "@/lib/types";
import type { LookupInput } from "@/lib/validation";
import { WatchTracker } from "@/lib/videoTracker";
import { loadYouTubeApi, youtubeErrorMessage, YT_STATE, type YTPlayer } from "@/lib/youtube";

/** 주기 기록 간격(초, 실제 재생 시간 기준) */
const HEARTBEAT_SEC = 30;

export type LessonWithProgress = VideoLesson & { progress: VideoLessonProgress };

interface Props {
  identity: LookupInput;
  applicationId: string;
  lesson: LessonWithProgress;
  lessons: LessonWithProgress[];
  courseCompleted: boolean;
  onProgress: (lessonId: string, progress: VideoLessonProgress) => void;
  onCourseCompleted: () => void;
  onGoLesson: (lessonId: string) => void;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(r).padStart(2, "0")}` : `${mm}:${String(r).padStart(2, "0")}`;
}

/**
 * 차시 1편 재생·추적. 자동재생하지 않으며, 이수 직후에는 플레이어를 안내 화면으로 덮어
 * 수강자가 「다음 강의로 이동」을 직접 눌러야 다음 차시로 넘어가게 한다.
 */
export function VideoLessonPlayer({
  identity,
  applicationId,
  lesson,
  lessons,
  courseCompleted,
  onProgress,
  onCourseCompleted,
  onGoLesson,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const trackerRef = useRef<WatchTracker | null>(null);
  const readyRef = useRef(false);
  const sinceHbRef = useRef(0);
  const startedRef = useRef(false);
  const sendingRef = useRef(false);
  const completingRef = useRef(false);
  const completedRef = useRef(lesson.progress.completed);
  completedRef.current = lesson.progress.completed;

  const [, setFrame] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; warn?: boolean } | null>(null);
  const [syncText, setSyncText] = useState("시청 기록은 자동으로 저장됩니다");
  const [completing, setCompleting] = useState(false);
  const [showCover, setShowCover] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const tracker = trackerRef.current;
  const ratio = tracker?.ratio() ?? lesson.progress.coverageRatio;
  const eligible = ratio + 1e-9 >= lesson.pass_ratio;
  const completed = lesson.progress.completed;

  const payload = useCallback(() => {
    const t = trackerRef.current;
    let position = 0;
    try {
      position = readyRef.current ? playerRef.current?.getCurrentTime() ?? 0 : lesson.progress.lastPositionSec;
    } catch {
      position = 0;
    }
    return {
      ...identity,
      applicationId,
      lessonId: lesson.id,
      watchedSec: Math.round((t?.watched ?? 0) * 10) / 10,
      positionSec: Math.round(position * 10) / 10,
      ranges: t?.ranges() ?? [],
    };
  }, [identity, applicationId, lesson.id, lesson.progress.lastPositionSec]);

  const sendHeartbeat = useCallback(async () => {
    if (sendingRef.current || !trackerRef.current) return;
    sendingRef.current = true;
    try {
      const res = await publicPost<VideoProgressResponse>("/api/video/heartbeat", payload());
      trackerRef.current?.merge(res.progress.ranges, res.progress.watchedSec);
      onProgress(lesson.id, res.progress);
      const d = new Date();
      setSyncText(`기록 저장됨 ${d.toTimeString().slice(0, 8)}`);
    } catch (e) {
      setSyncText(e instanceof Error ? `저장 실패: ${e.message} (다음 기록 때 다시 저장됩니다)` : "저장 실패");
    } finally {
      sendingRef.current = false;
    }
  }, [payload, onProgress, lesson.id]);

  /** 페이지 이탈·화면 전환 시 응답을 기다리지 않는 마지막 기록 */
  const sendBeacon = useCallback(() => {
    if (!trackerRef.current || !startedRef.current) return;
    try {
      void fetch("/api/video/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
        keepalive: true,
      });
    } catch {
      /* 전송 불가 환경 */
    }
  }, [payload]);

  const complete = useCallback(
    async (auto: boolean) => {
      if (completingRef.current) return;
      completingRef.current = true;
      setCompleting(true);
      try {
        const res = await publicPost<VideoProgressResponse>("/api/video/complete", payload());
        trackerRef.current?.merge(res.progress.ranges, res.progress.watchedSec);
        onProgress(lesson.id, res.progress);
        if (res.progress.completed) {
          try {
            playerRef.current?.pauseVideo();
          } catch {
            /* 무시 */
          }
          setShowCover(true);
          setNotice(null);
          if (res.courseCompleted) onCourseCompleted();
        } else {
          setNotice({
            text: `${auto ? "영상이 끝났지만 " : ""}이수 기준(${Math.round(lesson.pass_ratio * 100)}%)까지 약 ${formatClock(
              res.remainingSec ?? 0
            )} 더 시청해야 합니다. 「안 본 구간으로 이동」으로 빠진 부분을 이어서 보세요.`,
            warn: true,
          });
        }
      } catch (e) {
        setNotice({ text: e instanceof Error ? e.message : "이수 처리 중 오류가 발생했습니다.", warn: true });
      } finally {
        completingRef.current = false;
        setCompleting(false);
      }
    },
    [payload, onProgress, onCourseCompleted, lesson.id, lesson.pass_ratio]
  );

  // 차시가 바뀔 때마다 추적기·플레이어를 새로 만든다(자동재생 없음).
  useEffect(() => {
    if (!lesson.youtube_id) return;
    let cancelled = false;
    trackerRef.current = new WatchTracker(lesson.duration_sec, lesson.progress.ranges, lesson.progress.watchedSec);
    readyRef.current = false;
    startedRef.current = false;
    sinceHbRef.current = 0;
    setShowCover(false);
    setNotice(null);
    setPlayerError(null);
    setIsPlaying(false);
    setFrame((f) => f + 1);

    const resumeAt = lesson.progress.lastPositionSec < lesson.duration_sec - 10 ? Math.floor(lesson.progress.lastPositionSec) : 0;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        const el = document.createElement("div");
        hostRef.current.replaceChildren(el);
        playerRef.current = new YT.Player(el, {
          videoId: lesson.youtube_id!,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 0, rel: 0, playsinline: 1, modestbranding: 1, start: resumeAt },
          events: {
            onReady: () => {
              readyRef.current = true;
            },
            onStateChange: (e) => {
              const t = trackerRef.current;
              if (!t) return;
              t.resetBaseline();
              setIsPlaying(e.data === YT_STATE.PLAYING);
              if (e.data === YT_STATE.PLAYING) {
                setNotice(null);
                if (!startedRef.current) {
                  startedRef.current = true;
                  void sendHeartbeat(); // 서버 쪽 시청 시작 시각 기록
                }
              } else if (e.data === YT_STATE.PAUSED) {
                void sendHeartbeat();
              } else if (e.data === YT_STATE.ENDED) {
                t.markEnd(e.target.getCurrentTime());
                setFrame((f) => f + 1);
                // 미이수 차시는 서버에 판정을 요청한다(기준 미달이면 남은 시간을 안내).
                if (!completedRef.current) void complete(true);
                else void sendHeartbeat();
              }
            },
            onPlaybackRateChange: (e) => {
              if (e.data !== 1) {
                e.target.setPlaybackRate(1);
                setNotice({ text: "배속 재생은 지원하지 않습니다. 보통 속도로 재생됩니다.", warn: true });
              }
            },
            onError: (e) => setPlayerError(youtubeErrorMessage(e.data)),
          },
        });
      })
      .catch((err: Error) => setPlayerError(err.message));

    const timer = window.setInterval(() => {
      const t = trackerRef.current;
      const p = playerRef.current;
      if (!t || !p || !readyRef.current) return;
      let state = -1;
      let pos = 0;
      try {
        state = p.getPlayerState();
        pos = p.getCurrentTime();
      } catch {
        return;
      }
      const added = t.tick(performance.now(), state === YT_STATE.PLAYING, pos, document.visibilityState === "visible");
      sinceHbRef.current += added;
      if (sinceHbRef.current >= HEARTBEAT_SEC) {
        sinceHbRef.current -= HEARTBEAT_SEC;
        void sendHeartbeat();
      }
      setFrame((f) => (f + 1) % 1_000_000);
    }, 1000);

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        try {
          playerRef.current?.pauseVideo(); // 다른 탭·앱으로 이동한 시간은 인정하지 않는다
        } catch {
          /* 무시 */
        }
        sendBeacon();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendBeacon);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendBeacon);
      sendBeacon();
      try {
        playerRef.current?.destroy();
      } catch {
        /* 무시 */
      }
      playerRef.current = null;
      readyRef.current = false;
    };
    // 차시 전환 시에만 다시 만든다. progress 변경(기록 응답)으로 플레이어를 재생성하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, lesson.youtube_id]);

  const index = lessons.findIndex((l) => l.id === lesson.id);
  const next = index >= 0 ? lessons[index + 1] : undefined;
  const firstIncomplete = lessons.find((l) => !l.progress.completed && l.id !== lesson.id);

  async function goNext(target: LessonWithProgress) {
    try {
      await publicPost("/api/video/next", { ...identity, applicationId, lessonId: lesson.id });
    } catch {
      /* 기록 실패해도 이동은 허용 */
    }
    onGoLesson(target.id);
  }

  function seekGap() {
    const gap = trackerRef.current?.firstGap() ?? -1;
    if (gap < 0 || !playerRef.current) return;
    playerRef.current.seekTo(Math.max(0, gap - 2), true);
    playerRef.current.playVideo();
  }

  const pct = Math.floor(ratio * 100);
  const passPct = Math.round(lesson.pass_ratio * 100);
  const remainingSec = tracker ? tracker.remaining(lesson.pass_ratio) : 0;
  const gap = tracker?.firstGap() ?? -1;
  const showGapButton = !completed && !eligible && !isPlaying && (tracker?.watched ?? 0) > 0 && gap >= 0;

  const nextPanel = (
    <NextLessonPanel
      lesson={lesson}
      next={next}
      courseCompleted={courseCompleted}
      firstIncomplete={firstIncomplete}
      onGo={goNext}
    />
  );

  return (
    <section aria-labelledby="lesson-title" className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
      <div>
        <p className="text-sm font-semibold text-accent">{lesson.lesson_no}차시</p>
        <h2 id="lesson-title" className="text-xl font-bold text-slate-900">
          {lesson.title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          영상 길이 {formatClock(lesson.duration_sec)} · 이수 기준 실제 시청 {passPct}% 이상
        </p>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900">
        <div ref={hostRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
        {playerError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-6 text-center text-sm text-white">
            {playerError}
          </div>
        )}
        {showCover && (
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby="cover-title"
            className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-brand-dark/95 p-4 text-white sm:p-8"
          >
            <div className="w-full max-w-lg">
              <p id="cover-title" className="text-lg font-bold sm:text-xl">
                {lesson.lesson_no}차시 수강을 완료했습니다
              </p>
              <div className="mt-4">{nextPanel}</div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs text-slate-500">실제 시청</dt>
            <dd className="text-lg font-bold tabular-nums text-slate-900">{formatClock(tracker?.watched ?? lesson.progress.watchedSec)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">진행률</dt>
            <dd className="text-lg font-bold tabular-nums text-slate-900">{pct}%</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">이수까지</dt>
            <dd className="text-lg font-bold tabular-nums text-slate-900">
              {completed ? "이수 완료" : eligible ? "충족" : formatClock(remainingSec)}
            </dd>
          </div>
        </dl>
        <div
          className="relative mt-3 h-3 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="이수 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className={eligible || completed ? "h-full bg-emerald-500" : "h-full bg-accent"}
            style={{ width: `${Math.min(100, ratio * 100).toFixed(1)}%` }}
          />
          <div className="absolute inset-y-0 w-0.5 bg-slate-700" style={{ left: `${passPct}%` }} title="이수 기준" />
        </div>
        <p className="mt-1 flex justify-between text-xs text-slate-500">
          <span>0%</span>
          <span>기준 {passPct}%</span>
          <span>100%</span>
        </p>
      </div>

      <p className={notice?.warn ? "text-sm font-medium text-amber-700" : "text-sm text-slate-600"} role="status">
        {notice?.text ??
          (completed
            ? "이 차시는 이수했습니다. 다시 시청해도 기록에는 영향이 없습니다."
            : "건너뛴 구간과 일시정지·다른 탭으로 이동한 시간은 시청 시간에 포함되지 않습니다. 배속 재생은 지원하지 않습니다.")}
      </p>

      <div className="flex flex-wrap gap-2">
        {!completed && (
          <Button type="button" disabled={!eligible || completing} onClick={() => complete(false)}>
            {completing ? "확인 중..." : "이수 완료"}
          </Button>
        )}
        {showGapButton && (
          <Button type="button" variant="outline" onClick={seekGap}>
            안 본 구간으로 이동
          </Button>
        )}
      </div>

      {completed && !showCover && <div className="rounded-lg bg-brand-dark p-4 text-white">{nextPanel}</div>}

      <p className="text-xs text-slate-400" aria-live="polite">
        {syncText}
      </p>
    </section>
  );
}

/** 어두운 안내 화면 위 버튼 */
const LIGHT_BUTTON =
  "inline-flex w-fit items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-brand shadow-card hover:bg-slate-100";

/** 차시 사이 안내 — 다음 강의 제목·길이·안내문 + 「다음 강의로 이동」(직접 눌러야 진행) */
function NextLessonPanel({
  lesson,
  next,
  courseCompleted,
  firstIncomplete,
  onGo,
}: {
  lesson: LessonWithProgress;
  next: LessonWithProgress | undefined;
  courseCompleted: boolean;
  firstIncomplete: LessonWithProgress | undefined;
  onGo: (target: LessonWithProgress) => void;
}) {
  if (courseCompleted) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-bold">전 과정(4개 차시)을 이수했습니다.</p>
        <p className="text-sm opacity-90">「수료증 발급」 탭에서 같은 성명·연락처로 수료증(PDF)을 발급받을 수 있습니다.</p>
        <Link
          href="/certificate"
          className="inline-flex w-fit items-center justify-center rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600"
        >
          수료증 발급으로 이동
        </Link>
      </div>
    );
  }

  if (next) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold opacity-80">다음 강의 안내</p>
        <p className="font-bold">
          {next.lesson_no}차시 · {next.title} <span className="font-normal opacity-80">({formatClock(next.duration_sec)})</span>
        </p>
        {next.intro_text && <p className="text-sm leading-relaxed opacity-90">{next.intro_text}</p>}
        {next.youtube_id ? (
          <button type="button" className={LIGHT_BUTTON} onClick={() => onGo(next)}>
            다음 강의로 이동
          </button>
        ) : (
          <p className="text-sm font-medium text-amber-300">다음 강의 영상은 준비 중입니다. 등록되면 이어서 수강해 주세요.</p>
        )}
        <p className="text-xs opacity-70">다음 강의는 자동으로 재생되지 않습니다. 이동한 뒤 재생 버튼을 눌러 시작해 주세요.</p>
      </div>
    );
  }

  // 마지막 차시인데 이수하지 않은 차시가 남은 경우
  return (
    <div className="flex flex-col gap-3">
      <p className="font-bold">{lesson.lesson_no}차시가 마지막 강의입니다.</p>
      {firstIncomplete ? (
        <>
          <p className="text-sm opacity-90">
            아직 이수하지 않은 차시가 있습니다: {firstIncomplete.lesson_no}차시 · {firstIncomplete.title}
          </p>
          {firstIncomplete.youtube_id && (
            <button type="button" className={LIGHT_BUTTON} onClick={() => onGo(firstIncomplete)}>
              남은 강의로 이동
            </button>
          )}
        </>
      ) : (
        <p className="text-sm opacity-90">이수 처리를 확인하고 있습니다. 잠시 후 새로고침해 주세요.</p>
      )}
    </div>
  );
}
