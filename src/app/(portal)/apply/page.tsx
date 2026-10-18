import { Suspense } from "react";
import { ApplicationForm } from "@/components/ApplicationForm";
import { DEADLINE_NOTICE } from "@/lib/constants";

export default function ApplyPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">워크숍 신청</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          세션(차시) 단위로 신청합니다. 운영일별로 묶인 세션 중 원하는 세션을 모두 선택한 뒤 한 번에 제출하세요.
          선착순이며 {DEADLINE_NOTICE}됩니다.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중...</p>}>
        <ApplicationForm />
      </Suspense>
    </div>
  );
}
