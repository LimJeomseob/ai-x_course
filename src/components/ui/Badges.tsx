import clsx from "clsx";
import type { WorkshopLevel } from "@/lib/types";
import type { SessionPhase } from "@/lib/workshops";

const LEVEL_CLASSES: Record<WorkshopLevel, string> = {
  초급: "bg-sky-100 text-sky-800",
  중급: "bg-amber-100 text-amber-800",
  고급: "bg-red-100 text-red-800",
};

export function LevelBadge({ level }: { level: WorkshopLevel }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold", LEVEL_CLASSES[level])}>
      {level}
    </span>
  );
}

const PHASE_CLASSES: Record<SessionPhase, string> = {
  "확인 중": "bg-slate-100 text-slate-600",
  "신청 예정": "bg-violet-100 text-violet-800",
  모집중: "bg-emerald-100 text-emerald-800",
  마감: "bg-slate-200 text-slate-600",
};

export function PhaseBadge({ phase }: { phase: SessionPhase }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold", PHASE_CLASSES[phase])}>
      {phase}
    </span>
  );
}
