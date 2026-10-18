// 공개 수료증 발급(PRD §5.5) — 성명+연락처 본인확인 → RPC issue_certificate(p_channel='public')
// → 서식 JSON·업로드 토큰 반환. PDF는 브라우저에서 생성해 Storage에 업로드한다.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { jsonError, normalizePhone, PHONE_REGEX } from "@/lib/api";
import { CERTIFICATES_BUCKET } from "@/lib/db-tables";
import { buildCertificatePdfPath } from "@/lib/certificatePdf";
import type { Certificate, IssueCertificateResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const issueSchema = z.object({
  name: z.string().trim().min(1).max(50),
  phone: z.string().trim().regex(PHONE_REGEX),
  applicationId: z.string().uuid(),
});

interface AppRow {
  id: string;
  name: string;
  phone_digits: string;
  affiliation: string;
  status: string;
  workshop: { round: number; round_label: string; topic: string; start_at: string; end_at: string } | null;
}

export async function POST(req: Request) {
  const parsed = issueSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("입력값을 확인해 주세요.", 400);

  const { name, phone, applicationId } = parsed.data;
  const db = createServiceClient();

  const { data: app, error } = await db
    .from("applications")
    .select("id, name, phone_digits, affiliation, status, workshop:workshops(round, round_label, topic, start_at, end_at)")
    .eq("id", applicationId)
    .maybeSingle<AppRow>();

  if (error) return jsonError("조회 중 오류가 발생했습니다.", 500);
  if (!app || app.name !== name || app.phone_digits !== normalizePhone(phone)) {
    return jsonError("일치하는 신청 내역이 없습니다. 성명과 연락처를 확인해 주세요.", 404);
  }
  if (app.status !== "이수") return jsonError("이수 상태인 세션만 수료증을 발급할 수 있습니다.", 400);
  if (!app.workshop) return jsonError("세션 정보를 확인할 수 없습니다.", 500);

  const { data: cert, error: rpcError } = await db
    .rpc("issue_certificate", { p_application_id: applicationId, p_channel: "public" })
    .single<Certificate>();
  if (rpcError || !cert) {
    console.error(`[issue-certificate] RPC 실패 (application_id=${applicationId}):`, rpcError);
    return jsonError(rpcError?.message ?? "수료증 발급에 실패했습니다.", 500);
  }

  const { data: templateRow } = await db
    .from("certificate_templates")
    .select("template")
    .eq("name", "default")
    .maybeSingle();
  if (!templateRow) return jsonError("수료증 서식을 불러올 수 없습니다. 관리자에게 문의해 주세요.", 500);

  const pdfPath = cert.pdf_path ?? buildCertificatePdfPath(app.workshop.round, cert.cert_no);
  const { data: signedUpload, error: signError } = await db.storage
    .from(CERTIFICATES_BUCKET)
    .createSignedUploadUrl(pdfPath, { upsert: true });
  if (signError || !signedUpload) {
    console.error(`[issue-certificate] 업로드 URL 서명 실패 (path=${pdfPath}):`, signError);
    return jsonError("수료증 저장 준비에 실패했습니다. 다시 시도해 주세요.", 500);
  }

  if (!cert.pdf_path) {
    await db.from("certificates").update({ pdf_path: pdfPath }).eq("id", cert.id);
  }

  const body: IssueCertificateResponse = {
    certNo: cert.cert_no,
    issuedAt: cert.issued_at,
    reissueCount: cert.reissue_count,
    name: app.name,
    affiliation: app.affiliation,
    round: app.workshop.round,
    roundLabel: app.workshop.round_label,
    topic: app.workshop.topic,
    startAt: app.workshop.start_at,
    endAt: app.workshop.end_at,
    template: templateRow.template,
    upload: { path: signedUpload.path, token: signedUpload.token },
  };
  return NextResponse.json(body);
}
