// 신청내역조회·수료증 발급 탭의 본인확인(PRD §5.3, §5.5).
// applications는 RLS로 공개 SELECT가 막혀 있으므로 서버(service role)에서
// "성명 정확 일치 + 연락처 숫자 일치" 건만 걸러 반환한다(취소 건 포함, round 오름차순).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { jsonError, normalizePhone, PHONE_REGEX } from "@/lib/api";
import { CERTIFICATES_BUCKET } from "@/lib/db-tables";
import type { ApplicationStatus, LookupResultItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lookupSchema = z.object({
  name: z.string().trim().min(1).max(50),
  phone: z.string().trim().regex(PHONE_REGEX),
});

interface Row {
  id: string;
  phone: string;
  status: ApplicationStatus;
  workshop: {
    round: number;
    round_label: string;
    topic: string;
    start_at: string;
    end_at: string;
    day: { day_code: string; day_label: string; location: string; location_url: string | null; is_online: boolean };
  } | null;
}

export async function POST(req: Request) {
  const parsed = lookupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("성명과 연락처를 확인해 주세요.", 400);

  const { name, phone } = parsed.data;
  const digits = normalizePhone(phone);
  const db = createServiceClient();

  const { data, error } = await db
    .from("applications")
    .select(
      "id, phone, status, workshop:workshops(round, round_label, topic, start_at, end_at, day:workshop_days(day_code, day_label, location, location_url, is_online))"
    )
    .eq("name", name)
    .eq("phone_digits", digits)
    .returns<Row[]>();

  if (error) return jsonError("조회 중 오류가 발생했습니다.", 500);
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
      const w = row.workshop!;
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
        dayCode: w.day.day_code,
        dayLabel: w.day.day_label,
        location: w.day.location,
        locationUrl: w.day.location_url,
        isOnline: w.day.is_online,
        status: row.status,
        certNo: cert?.cert_no ?? null,
        certDownloadUrl,
      };
    })
  );

  results.sort((a, b) => a.round - b.round);
  return NextResponse.json({ results });
}
