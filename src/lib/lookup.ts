import type { LookupResultItem } from "@/lib/types";

export interface LookupDayGroup {
  dayCode: string;
  dayLabel: string;
  items: LookupResultItem[];
}

/** 조회 결과를 운영일별로 묶는다(세션 시작 순). */
export function groupLookupByDay(items: LookupResultItem[]): LookupDayGroup[] {
  const groups = new Map<string, LookupDayGroup>();
  for (const item of [...items].sort((a, b) => a.startAt.localeCompare(b.startAt) || a.round - b.round)) {
    const group = groups.get(item.dayCode) ?? { dayCode: item.dayCode, dayLabel: item.dayLabel, items: [] };
    group.items.push(item);
    groups.set(item.dayCode, group);
  }
  return Array.from(groups.values());
}
