// 공개 수료증 발급(PRD §5.5) — 성명+연락처 본인확인 → RPC issue_certificate(p_channel='public')
// → 서버에서 PDF 생성 → Storage 보관 → PDF 반환.
// PDF를 서버가 만들고 직접 보관하므로, 발급자가 임의 파일을 공식 보관본으로 올릴 수 없다.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { jsonError, normalizePhone, PHONE_REGEX, readJsonBody } from "@/lib/api";
import { CERTIFICATES_BUCKET } from "@/lib/db-tables";
import { buildCertificatePdfPath, buildCertificateValues, renderCertificateFromTemplate } from "@/lib/certificatePdf";
import { loadCertificateFontsFromDisk } from "@/lib/certificateFonts";
import { getDict } from "@/lib/i18n/dict";
import { allowPublicRequest } from "@/lib/rateLimit";
import type { Certificate, CertificateTemplate, IssueCertificateResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const { body, locale } = await readJsonBody(req);
  const t = getDict(locale).api;

  const parsed = issueSchema.safeParse(body);
  if (!parsed.success) return jsonError(t.invalidInput, 400);

  const { name, phone, applicationId } = parsed.data;
  const db = createServiceClient();

  const allowed = await allowPublicRequest(
    db,
    req,
    "issue-cert",
    { limit: 120, windowSec: 600 },
    { value: applicationId, rule: { limit: 10, windowSec: 600 } }
  );
  if (!allowed) return jsonError(t.tooMany, 429);

  const { data: app, error } = await db
    .from("applications")
    .select("id, name, phone_digits, affiliation, status, workshop:workshops(round, round_label, topic, start_at, end_at)")
    .eq("id", applicationId)
    .maybeSingle<AppRow>();

  if (error) {
    console.error("[issue-certificate] 조회 실패:", error.message);
    return jsonError(t.lookupFailed, 500);
  }
  if (!app || app.name !== name || app.phone_digits !== normalizePhone(phone)) {
    return jsonError(t.notFound, 404);
  }
  if (app.status !== "이수") return jsonError(t.certNotCompleted, 400);
  if (!app.workshop) return jsonError(t.sessionInfoMissing, 500);

  const { data: templateRow } = await db
    .from("certificate_templates")
    .select("template")
    .eq("name", "default")
    .maybeSingle<{ template: CertificateTemplate }>();
  if (!templateRow) return jsonError(t.certTemplateMissing, 500);

  const { data: cert, error: rpcError } = await db
    .rpc("issue_certificate", { p_application_id: applicationId, p_channel: "public" })
    .single<Certificate>();
  if (rpcError || !cert) {
    console.error(`[issue-certificate] RPC 실패 (application_id=${applicationId}):`, rpcError);
    return jsonError(t.certIssueFailed, 500);
  }

  // 수료증 서식·기재 내용은 한국어 공식 서식 그대로다(화면 언어와 무관).
  let pdf: Uint8Array;
  try {
    const values = buildCertificateValues({
      certNo: cert.cert_no,
      name: app.name,
      affiliation: app.affiliation,
      roundLabel: app.workshop.round_label,
      topic: app.workshop.topic,
      startAt: app.workshop.start_at,
      endAt: app.workshop.end_at,
      issuedAt: cert.issued_at, // 재발급도 최초 발급일 유지(PRD §8)
    });
    pdf = await renderCertificateFromTemplate(templateRow.template, values, await loadCertificateFontsFromDisk());
  } catch (err) {
    console.error(`[issue-certificate] PDF 생성 실패 (cert_no=${cert.cert_no}):`, err);
    return jsonError(t.certIssueFailed, 500);
  }

  // 보관 실패해도 발급된 PDF는 내려 준다(화면에 보관 실패를 알린다).
  const pdfPath = cert.pdf_path ?? buildCertificatePdfPath(app.workshop.round, cert.cert_no);
  const { error: uploadError } = await db.storage
    .from(CERTIFICATES_BUCKET)
    .upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    console.error(`[issue-certificate] 보관 실패 (path=${pdfPath}):`, uploadError.message);
  } else if (!cert.pdf_path) {
    await db.from("certificates").update({ pdf_path: pdfPath }).eq("id", cert.id);
  }

  const response: IssueCertificateResponse = {
    certNo: cert.cert_no,
    reissueCount: cert.reissue_count,
    round: app.workshop.round,
    pdfBase64: Buffer.from(pdf).toString("base64"),
    stored: !uploadError,
  };
  return NextResponse.json(response);
}
