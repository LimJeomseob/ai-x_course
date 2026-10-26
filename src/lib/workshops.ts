/**
 * 운영일(workshop_days)·세션(workshops) 로딩과 신청상태 산출 공통 로직.
 * 소개 탭·신청 탭·만족도조사가 같은 DB 소스와 판정을 쓰도록 단일 출처로 모은다.
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES, WORKSHOP_PUBLIC_COLUMNS } from "@/lib/db-tables";
import { UNLIMITED_CAPACITY } from "@/lib/constants";
import type { Workshop, WorkshopDay } from "@/lib/types";

export type SessionPhase = "확인 중" | "신청 예정" | "모집중" | "대기접수" | "마감";

export interface SessionStatus {
  phase: SessionPhase;
  remaining: number | null; // null = 제한 없음 또는 미확인
  /** 대기 접수 가능 인원(waitlist_capacity - 대기 건수). null = 제한 없음 또는 미확인 */
  waitingRemaining: number | null;
  unlimited: boolean;
  canApply: boolean;
}

export function isUnlimited(capacity: number): boolean {
  return capacity >= UNLIMITED_CAPACITY;
}

/**
 * 신청 가능 구간(apply_open_at ~ deadline)과 정원·대기 한도로 세션 상태를 산출한다.
 * appliedCount가 undefined면 정원현황 미확인("확인 중").
 * 정원이 찼어도 대기 한도(waitlist_capacity)가 남아 있으면 "대기접수"로 신청 가능하다.
 */
export function deriveSessionStatus(
  workshop: Pick<Workshop, "capacity" | "waitlist_capacity" | "apply_open_at" | "deadline">,
  appliedCount: number | undefined,
  waitingCount: number | undefined,
  now: number
): SessionStatus {
  const unlimited = isUnlimited(workshop.capacity);
  if (appliedCount === undefined) {
    return { phase: "확인 중", remaining: null, waitingRemaining: null, unlimited, canApply: false };
  }
  const remaining = unlimited ? null : Math.max(0, workshop.capacity - appliedCount);
  const waitingRemaining = unlimited ? null : Math.max(0, (workshop.waitlist_capacity ?? 0) - (waitingCount ?? 0));
  if (now < new Date(workshop.apply_open_at).getTime()) {
    return { phase: "신청 예정", remaining, waitingRemaining, unlimited, canApply: false };
  }
  if (now > new Date(workshop.deadline).getTime()) {
    return { phase: "마감", remaining, waitingRemaining, unlimited, canApply: false };
  }
  if (remaining === 0) {
    if (waitingRemaining !== null && waitingRemaining > 0) {
      return { phase: "대기접수", remaining, waitingRemaining, unlimited, canApply: true };
    }
    return { phase: "마감", remaining, waitingRemaining, unlimited, canApply: false };
  }
  return { phase: "모집중", remaining, waitingRemaining, unlimited, canApply: true };
}

export interface DayWithSessions extends WorkshopDay {
  sessions: Workshop[];
}

export interface ProgramData {
  days: DayWithSessions[];
  /** workshop_id → 유효 신청건수(신청완료/이수). 조회 실패 시 빈 Map */
  appliedCountByWorkshopId: Map<string, number>;
  /** workshop_id → 대기 건수. 조회 실패 시 빈 Map */
  waitingCountByWorkshopId: Map<string, number>;
  availabilityLoaded: boolean;
}

/** 세션의 유효·대기 건수를 꺼내 deriveSessionStatus 인자로 넘긴다(정원현황 미로딩 시 undefined). */
export function sessionStatusFor(data: ProgramData, workshop: Workshop, now: number): SessionStatus {
  if (!data.availabilityLoaded) return deriveSessionStatus(workshop, undefined, undefined, now);
  return deriveSessionStatus(
    workshop,
    data.appliedCountByWorkshopId.get(workshop.id) ?? 0,
    data.waitingCountByWorkshopId.get(workshop.id) ?? 0,
    now
  );
}

/** 운영일 + 세션 + 공개 정원현황(get_workshop_availability)을 함께 로드한다. */
export async function fetchProgramData(): Promise<ProgramData> {
  const supabase = createSupabaseBrowserClient();

  const [daysRes, workshopsRes, availabilityRes] = await Promise.all([
    supabase.from(TABLES.WORKSHOP_DAYS).select("*").order("day_code").returns<WorkshopDay[]>(),
    supabase
      .from(TABLES.WORKSHOPS)
      .select(WORKSHOP_PUBLIC_COLUMNS)
      .order("round", { ascending: true })
      .returns<Workshop[]>(),
    supabase.rpc("get_workshop_availability"),
  ]);

  if (daysRes.error || workshopsRes.error) {
    throw new Error("세션 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  // applied_count·waiting_count는 bigint → PostgREST가 문자열로 직렬화할 수 있어 숫자로 변환한다.
  const availabilityRows = (availabilityRes.data ?? []) as {
    workshop_id: string;
    applied_count: number | string;
    waiting_count?: number | string | null;
  }[];
  const appliedCountByWorkshopId = new Map<string, number>(
    availabilityRows.map((row) => [row.workshop_id, Number(row.applied_count)])
  );
  const waitingCountByWorkshopId = new Map<string, number>(
    availabilityRows.map((row) => [row.workshop_id, Number(row.waiting_count ?? 0)])
  );

  return {
    days: groupSessionsByDay(daysRes.data ?? [], workshopsRes.data ?? []),
    appliedCountByWorkshopId,
    waitingCountByWorkshopId,
    availabilityLoaded: !availabilityRes.error,
  };
}

export function groupSessionsByDay(days: WorkshopDay[], workshops: Workshop[]): DayWithSessions[] {
  return days
    .map((day) => ({
      ...day,
      sessions: workshops
        .filter((w) => w.day_id === day.id)
        .sort((a, b) => a.order_in_day - b.order_in_day || a.round - b.round),
    }))
    .sort((a, b) => {
      const aStart = a.sessions[0]?.start_at ?? "";
      const bStart = b.sessions[0]?.start_at ?? "";
      return aStart.localeCompare(bStart) || a.day_code.localeCompare(b.day_code);
    });
}

/** 강사 표기: "박성재 대표(모모에듀)" */
export function instructorDisplay(day: Pick<WorkshopDay, "instructor" | "instructor_title" | "instructor_org">) {
  const title = day.instructor_title ? ` ${day.instructor_title}` : "";
  const org = day.instructor_org ? `(${day.instructor_org})` : "";
  return `${day.instructor}${title}${org}`;
}

/** 협조사항 = 운영일 공통 + 세션 추가(PRD §5.1) */
export function combinedNotes(dayNotes: string, sessionNotes: string): string {
  return [dayNotes, sessionNotes].map((s) => s.trim()).filter(Boolean).join("\n");
}

/** 관리자 화면용 세션 옵션(세션 + 소속 운영일) */
export type SessionOption = Workshop & { day: DayWithSessions };
