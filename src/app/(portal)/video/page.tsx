import { VideoCourse } from "@/components/VideoCourse";

export default function VideoPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">동영상 강의</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          「신청」 탭에서 동영상 강의를 신청한 뒤, 신청 시 입력한 성명과 연락처로 수강합니다. 4개 차시를 각각 실제로 90% 이상
          시청하면 이수 처리되며, 「수료증 발급」 탭에서 수료증을 받을 수 있습니다.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>건너뛴 구간, 일시정지 시간, 다른 탭·앱으로 이동한 시간은 시청 시간에 포함되지 않습니다.</li>
          <li>차시가 끝나도 다음 강의는 자동으로 재생되지 않습니다. 안내를 확인하고 「다음 강의로 이동」을 눌러 주세요.</li>
          <li>시청 기록은 자동 저장되어, 다시 접속하면 이어서 볼 수 있습니다.</li>
        </ul>
      </div>
      <VideoCourse />
    </div>
  );
}
