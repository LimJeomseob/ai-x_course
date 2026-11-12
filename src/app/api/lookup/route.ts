// 신청내역조회·수료증 발급 탭의 본인확인(PRD §5.3, §5.5).
// applications는 RLS로 공개 SELECT가 막혀 있으므로 서버(service role)에서
// "성명 정확 일치 + 연락처 숫자 일치" 건만 걸러 반환한다(취소 건 포함, round 오름차순).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { jsonError, normalizePhone, PHONE_REGEX, readJsonBody } from "@/lib/api";
import { CERTIFICATES_BUCKET } from "@/lib/db-tables";
import { getDict } from "@/lib/i18n/dict";
import { allowPublicRequest } from "@/lib/rateLimit";
import { localizeDay, localizeSession } from "@/lib/workshops";
import type { ApplicationStatus, LookupResultItem, WorkshopDay } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lookupSchema = z.object({
  name: z.string().trim().min(1).max(50),
  phone: z.string().trim().regex(PHONE_REGEX),
});

type DayRow = Pick<WorkshopDay, "day_code" | "day_label" | "location" | "location_url" | "is_online" | "day_label_en" | "location_en">;

interface Row {
  id: string;
  phone: string;
  status: ApplicationStatus;
  workshop: {
    round: number;
    round_label: string;
    topic: string;
    topic_en: string | null;
    start_at: string;
    end_at: string;
    day: DayRow;
  } | null;
}

export async function POST(req: Request) {
  const { body, locale } = await readJsonBody(req);
  const t = getDict(locale).api;

  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) return jsonError(t.identityInvalid, 400);

  const { name, phone } = parsed.data;
  const digits = normalizePhone(phone);
  const db = createServiceClient();

  // 성명+연락처 대입 시도를 막는다(IP 기준 + 같은 연락처 기준).
  const allowed = await allowPublicRequest(
    db,
    req,
    "lookup",
    { limit: 120, windowSec: 600 },
    { value: digits, rule: { limit: 20, windowSec: 600 } }
  );
  if (!allowed) return jsonError(t.tooMany, 429);

  const { data, error } = await db
    .from("applications")
    .select(
      "id, phone, status, workshop:workshops(round, round_label, topic, topic_en, start_at, end_at, day:workshop_days(day_code, day_label, location, location_url, is_online, day_label_en, location_en))"
    )
    .eq("name", name)
    .eq("phone_digits", digits)
    .returns<Row[]>();

  if (error) {
    console.error("[lookup] 조회 실패:", error.message);
    return jsonError(t.lookupFailed, 500);
  }
  const rows = (data ?? []).filter((r) => r.workshop);
  if (rows.length === 0) return NextResponse.json({ results: [] });

  const { data: certs } = await db
    .from("certificates")
    .select("application_id, cert_no, pdf_path")
    .in(
      "application_id",
      rows.map((r) => r.id)
    );
  const certByApp = new Map(
    ((certs ?? []) as { application_id: string; cert_no: string; pdf_path: string | null }[]).map((c) => [
      c.application_id,
      c,
    ])
  );

  const results: LookupResultItem[] = await Promise.all(
    rows.map(async (row) => {
      const w = localizeSession(row.workshop!, locale);
      const day = localizeDay(row.workshop!.day, locale);
      const cert = certByApp.get(row.id);
      let certDownloadUrl: string | null = null;
      if (row.status === "이수" && cert?.pdf_path) {
        const { data: signed } = await db.storage.from(CERTIFICATES_BUCKET).createSignedUrl(cert.pdf_path, 600);
        certDownloadUrl = signed?.signedUrl ?? null;
      }
      return {
        applicationId: row.id,
        round: w.round,
        roundLabel: w.round_label,
        topic: w.topic,
        startAt: w.start_at,
        endAt: w.end_at,
        dayCode: day.day_code,
        dayLabel: day.day_label,
        location: day.location,
        locationUrl: day.location_url,
        isOnline: day.is_online,
        status: row.status,
        certNo: cert?.cert_no ?? null,
        certDownloadUrl,
      };
    })
  );

  results.sort((a, b) => a.round - b.round);
  return NextResponse.json({ results });
}
