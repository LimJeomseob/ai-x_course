"use client";

import clsx from "clsx";
import { useDict } from "@/lib/i18n/LocaleProvider";
import type { ApplicationStatus } from "@/lib/types";

const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  신청완료: "bg-blue-100 text-blue-800",
  대기: "bg-amber-100 text-amber-800",
  취소: "bg-slate-200 text-slate-600",
  이수: "bg-emerald-100 text-emerald-800",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const labels = useDict().status;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
        STATUS_CLASSES[status]
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
