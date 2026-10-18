import { CertificateIssueForm } from "@/components/CertificateIssueForm";

export default function CertificatePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">수료증 발급</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          이수 처리된 세션마다 수료증 1장을 발급합니다. 재발급 시 발급번호와 발급일은 유지됩니다. 수료증은 AI-X 교과목
          개발·인증 결과보고서 첨부용 공식 증빙(A4 PDF)입니다.
        </p>
      </div>
      <CertificateIssueForm />
    </div>
  );
}
