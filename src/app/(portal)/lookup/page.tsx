import { LookupForm } from "@/components/LookupForm";

export default function LookupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">신청내역조회</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          신청 시 입력한 성명과 연락처로 세션별 신청 내역을 확인합니다. 세션 시작 전까지 세션 단위로 취소할 수 있습니다.
        </p>
      </div>
      <LookupForm />
    </div>
  );
}
