"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { InstructorModal } from "@/components/InstructorModal";
import { LocationLink } from "@/components/LocationLink";
import { LevelBadge, PhaseBadge } from "@/components/ui/Badges";
import { findInstructor, type InstructorProfile } from "@/lib/constants";
import { formatTimeRange } from "@/lib/format";
import {
  deriveSessionStatus,
  fetchProgramData,
  instructorDisplay,
  type ProgramData,
} from "@/lib/workshops";

export function circled(no: number): string {
  return no >= 1 && no <= 20 ? String.fromCharCode(0x2460 + no - 1) : `${no}.`;
}

/** 소개 탭 운영일 카드 4개(PRD §5.1) — 신청·정원은 세션 단위로 표시 */
export function ProgramCards() {
  const [data, setData] = useState<ProgramData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instructor, setInstructor] = useState<InstructorProfile | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const closeInstructor = useCallback(() => setInstructor(null), []);

  useEffect(() => {
    fetchProgramData()
      .then(setData)
      .catch((e: Error) => setError(e.message));
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (!data) {
    return (
      <p role="status" className="text-sm text-slate-500">
        세션 정보를 불러오는 중...
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-6">
        {data.days.map((day) => {
          const profile = findInstructor(day.instructor);
          return (
            <article
              key={day.id}
              aria-labelledby={`day-${day.day_code}`}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"
            >
              <header className="border-b border-slate-100 bg-brand/5 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-brand px-2 py-0.5 text-xs font-bold text-white">Day {day.day_code}</span>
                  <h3 id={`day-${day.day_code}`} className="text-lg font-bold text-slate-900">
                    {day.day_label}
                  </h3>
                  <LevelBadge level={day.level} />
                  <span className="text-sm text-slate-600">대상: {day.target}</span>
                </div>
                <dl className="mt-3 grid gap-1.5 text-sm text-slate-700 sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold">📍 장소</dt>
                    <dd>
                      <LocationLink location={day.location} url={day.location_url} isOnline={day.is_online} />
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold">강사</dt>
                    <dd>
                      {profile ? (
                        <button
                          type="button"
                          onClick={() => setInstructor(profile)}
                          className="font-medium text-accent underline underline-offset-2 hover:text-brand"
                          aria-label={`${instructorDisplay(day)} 프로필 보기`}
                        >
                          {instructorDisplay(day)}
                        </button>
                      ) : (
                        instructorDisplay(day)
                      )}
                    </dd>
                  </div>
                  {day.notes && (
                    <div className="flex gap-2 sm:col-span-2">
                      <dt className="shrink-0 font-semibold">협조사항</dt>
                      <dd className="text-slate-600">{day.notes}</dd>
                    </div>
                  )}
                </dl>
              </header>

              <ol className="divide-y divide-slate-100">
                {day.sessions.map((session) => {
                  const status = deriveSessionStatus(
                    session,
                    data.availabilityLoaded ? data.appliedCountByWorkshopId.get(session.id) ?? 0 : undefined,
                    now
                  );
                  return (
                    <li key={session.id} className="px-5 py-4 sm:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900">
                            <span className="text-brand">{session.round_label}</span>{" "}
                            <span className="text-slate-500">{formatTimeRange(session.start_at, session.end_at)}</span>
                            {" · "}
                            {session.topic}
                          </p>
                          <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-600">
                            {session.contents.map((c) => (
                              <li key={c.no} className="flex gap-1.5">
                                <span aria-hidden="true">{circled(c.no)}</span>
                                <span>{c.content}</span>
                              </li>
                            ))}
                          </ul>
                          {session.notes && <p className="mt-2 text-sm font-medium text-amber-700">{session.notes}</p>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                          <PhaseBadge phase={status.phase} />
                          <p className="text-xs text-slate-500">
                            {status.unlimited
                              ? "정원 제한 없음"
                              : `정원 ${session.capacity}명${status.remaining !== null ? ` · 잔여 ${status.remaining}명` : ""}`}
                          </p>
                          <Link
                            href={`/apply?round=${session.round}`}
                            aria-disabled={!status.canApply}
                            className={
                              status.canApply
                                ? "rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-white hover:bg-brand"
                                : "pointer-events-none rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-bold text-slate-500"
                            }
                          >
                            이 세션 신청
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {day.sessions.length > 1 && (
                <footer className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <p className="text-sm text-slate-600">
                    {day.link_notice ?? "같은 날 세션은 기초→심화로 연계 구성되어 있어 함께 수강을 권장합니다"}
                  </p>
                  <Link
                    href={`/apply?day=${day.day_code}`}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg border-2 border-brand bg-white px-4 py-2 text-sm font-bold text-brand hover:bg-brand/5"
                  >
                    당일 세션 모두 신청
                  </Link>
                </footer>
              )}
            </article>
          );
        })}
      </div>
      <InstructorModal instructor={instructor} onClose={closeInstructor} />
    </>
  );
}
