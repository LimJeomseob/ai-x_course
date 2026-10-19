"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLES, CERTIFICATES_BUCKET } from "@/lib/db-tables";
import {
  buildCertificatePdfPath,
  buildCertificateValues,
  renderCertificateFromTemplate,
} from "@/lib/certificatePdf";
import type { ApplicationWithWorkshop, Certificate, CertificateTemplate } from "@/lib/types";

export interface IssueCertificateResult {
  applicationId: string;
  success: boolean;
  certNo?: string;
  downloadUrl?: string;
  error?: string;
}

async function fetchCertificateTemplate(supabase: SupabaseClient): Promise<CertificateTemplate> {
  const { data, error } = await supabase
    .from(TABLES.CERTIFICATE_TEMPLATES)
    .select("template")
    .eq("name", "default")
    .maybeSingle<{ template: CertificateTemplate }>();

  if (error || !data) {
    throw new Error("수료증 서식을 불러올 수 없습니다. 서식(certificate_templates)을 확인해 주세요.");
  }
  return data.template;
}

/**
 * 관리자 수료증 발급/재발급(PRD §6.2). 관리자 브라우저 세션으로 RPC(issue_certificate) →
 * PDF 생성 → Storage 업로드를 처리한다. RPC·Storage 모두 RLS is_admin()으로 통제된다.
 */
export async function issueCertificateForApplication(
  supabase: SupabaseClient,
  application: ApplicationWithWorkshop,
  template?: CertificateTemplate
): Promise<IssueCertificateResult> {
  const applicationId = application.id;

  try {
    const resolvedTemplate = template ?? (await fetchCertificateTemplate(supabase));

    const { data: cert, error: rpcError } = await supabase
      .rpc("issue_certificate", { p_application_id: applicationId, p_channel: "admin" })
      .single<Certificate>();

    if (rpcError || !cert) {
      throw new Error(rpcError?.message ?? "수료증 발급에 실패했습니다.");
    }

    const values = buildCertificateValues({
      certNo: cert.cert_no,
      name: application.name,
      affiliation: application.affiliation,
      roundLabel: application.workshop.round_label,
      topic: application.workshop.topic,
      startAt: application.workshop.start_at,
      endAt: application.workshop.end_at,
      issuedAt: cert.issued_at, // 재발급도 최초 발급일 유지(PRD §8)
    });
    const pdfBytes = await renderCertificateFromTemplate(resolvedTemplate, values);

    const pdfPath = cert.pdf_path ?? buildCertificatePdfPath(application.workshop.round, cert.cert_no);

    const { error: uploadError } = await supabase.storage
      .from(CERTIFICATES_BUCKET)
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    if (!cert.pdf_path) {
      const { error: updateError } = await supabase
        .from(TABLES.CERTIFICATES)
        .update({ pdf_path: pdfPath })
        .eq("id", cert.id);
      if (updateError) throw new Error(updateError.message);
    }

    const { data: signed } = await supabase.storage.from(CERTIFICATES_BUCKET).createSignedUrl(pdfPath, 600);

    return { applicationId, success: true, certNo: cert.cert_no, downloadUrl: signed?.signedUrl };
  } catch (err) {
    return {
      applicationId,
      success: false,
      error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
    };
  }
}

export async function issueCertificatesForApplications(
  supabase: SupabaseClient,
  applications: ApplicationWithWorkshop[]
): Promise<IssueCertificateResult[]> {
  let template: CertificateTemplate;
  try {
    template = await fetchCertificateTemplate(supabase);
  } catch (err) {
    const message = err instanceof Error ? err.message : "수료증 서식을 불러올 수 없습니다.";
    return applications.map((a) => ({ applicationId: a.id, success: false, error: message }));
  }

  // 채번 잠금·Storage 부하를 고려해 순차 처리한다.
  const results: IssueCertificateResult[] = [];
  for (const application of applications) {
    results.push(await issueCertificateForApplication(supabase, application, template));
  }
  return results;
}

/** 브라우저에서 PDF 바이트를 파일로 저장한다. */
export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // 즉시 해제하면 일부 브라우저에서 파일명(download 속성)이 적용되기 전에 URL이 사라진다.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
