import { Suspense } from "react";
import { SurveyForm } from "@/components/SurveyForm";

export default function SurveyPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">만족도조사</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          참여하신 세션별로 응답해 주세요. 응답은 익명으로 집계되며 차기 워크숍 기획과 AI-X 교과목 지원 개선에 활용됩니다.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-500">불러오는 중...</p>}>
        <SurveyForm />
      </Suspense>
    </div>
  );
}
