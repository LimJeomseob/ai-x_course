"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { IdentityForm } from "@/components/IdentityForm";
import { formatClock, VideoLessonPlayer, type LessonWithProgress } from "@/components/VideoLessonPlayer";
import { publicPost } from "@/lib/adminApi";
import type { VideoLessonProgress, VideoSessionResponse } from "@/lib/types";
import type { LookupInput } from "@/lib/validation";
import { consumeVideoHandoff } from "@/lib/videoHandoff";

/** 처음 열 차시: 이수하지 않은 첫 차시(영상 등록된 것) → 없으면 첫 차시 */
function pickInitialLesson(lessons: LessonWithProgress[]): string | null {
  const ready = lessons.filter((l) => l.youtube_id);
  return (ready.find((l) => !l.progress.completed) ?? ready[0] ?? lessons[0])?.id ?? null;
}

/** 「동영상 강의」 탭 — 본인확인 → 차시 목록·진도 → YouTube 시청(차시별 90% 이상 시 이수) */
export function VideoCourse() {
  const [identity, setIdentity] = useState<LookupInput | null>(null);
  const [course, setCourse] = useState<VideoSessionResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);

  const start = useCallback(async (input: LookupInput) => {
    setLoading(true);
    setError(null);
    try {
      const data = await publicPost<VideoSessionResponse>("/api/video/session", input);
      setIdentity(input);
      setCourse(data);
      setSelectedId(pickInitialLesson(data.lessons));
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 「신청」 탭에서 신청 완료 직후 넘어온 경우: 본인확인을 건너뛰고 바로 수강 화면을 연다.
  useEffect(() => {
    const handoff = consumeVideoHandoff();
    if (!handoff) return;
    setAppliedBanner(
      handoff.appliedCount > 1
        ? `신청이 완료되었습니다(세션 ${handoff.appliedCount}개). 동영상 강의는 지금 바로 수강할 수 있습니다. 다른 세션의 신청 내역은 「신청내역조회」 탭에서 확인하세요.`
        : "신청이 완료되었습니다. 지금 바로 동영상 강의를 수강할 수 있습니다."
    );
    void start({ name: handoff.name, phone: handoff.phone });
  }, [start]);

  const onProgress = useCallback((lessonId: string, progress: VideoLessonProgress) => {
    setCourse((prev) =>
      prev ? { ...prev, lessons: prev.lessons.map((l) => (l.id === lessonId ? { ...l, progress } : l)) } : prev
    );
  }, []);

  const onCourseCompleted = useCallback(() => {
    setCourse((prev) => (prev ? { ...prev, courseCompleted: true, status: "이수" } : prev));
  }, []);

  const onGoLesson = useCallback((lessonId: string) => {
    setSelectedId(lessonId);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const banner = appliedBanner && (
    <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
      {appliedBanner}
    </p>
  );

  if (!identity || !course) {
    return (
      <div className="flex flex-col gap-4">
        {banner}
        {loading && appliedBanner && (
          <p role="status" className="text-sm text-slate-500">
            수강 정보를 불러오는 중...
          </p>
        )}
        <IdentityForm submitLabel="수강 시작" loading={loading} onSubmit={start} />
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
      </div>
    );
  }

  const lessons = course.lessons;
  const doneCount = lessons.filter((l) => l.progress.completed).length;
  const totalSec = lessons.reduce((s, l) => s + l.duration_sec, 0);
  const selected = lessons.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {banner}
      <section aria-label="수강 현황" className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm text-slate-500">{course.name}님의 수강 현황</p>
            <p className="text-lg font-bold text-slate-900">{course.courseTitle}</p>
          </div>
          <p className={clsx("rounded-full px-3 py-1 text-sm font-bold", course.courseCompleted ? "bg-emerald-100 text-emerald-800" : "bg-brand/10 text-brand")}>
            {course.courseCompleted ? "과정 이수" : `${doneCount} / ${lessons.length}차시 이수`}
          </p>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          총 {lessons.length}차시 · {formatClock(totalSec)} · 차시마다 실제 시청 90% 이상이면 이수, 전 차시 이수 시 수료증 발급
        </p>

        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {lessons.map((l) => {
            const pct = Math.floor(l.progress.coverageRatio * 100);
            const active = l.id === selectedId;
            const ready = Boolean(l.youtube_id);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => onGoLesson(l.id)}
                  aria-current={active ? "true" : undefined}
                  className={clsx(
                    "flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                    active ? "border-accent bg-accent/5" : "border-slate-200 hover:border-accent/60",
                    !ready && "cursor-not-allowed opacity-60"
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {l.lesson_no}차시 · {l.title}
                    </span>
                    <span
                      className={clsx(
                        "shrink-0 rounded px-2 py-0.5 text-xs font-bold",
                        !ready
                          ? "bg-slate-100 text-slate-500"
                          : l.progress.completed
                            ? "bg-emerald-100 text-emerald-800"
                            : pct > 0
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {!ready ? "준비 중" : l.progress.completed ? "이수" : pct > 0 ? `${pct}%` : "미수강"}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">{formatClock(l.duration_sec)}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                    <span
                      className={clsx("block h-full", l.progress.completed ? "bg-emerald-500" : "bg-accent")}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {selected && selected.youtube_id ? (
        <VideoLessonPlayer
          key={selected.id}
          identity={identity}
          applicationId={course.applicationId}
          lesson={selected}
          lessons={lessons}
          courseCompleted={course.courseCompleted}
          onProgress={onProgress}
          onCourseCompleted={onCourseCompleted}
          onGoLesson={onGoLesson}
        />
      ) : (
        <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">
          강의 영상을 준비하고 있습니다. 영상이 등록되면 이 화면에서 바로 수강할 수 있습니다.
        </p>
      )}
    </div>
  );
}
