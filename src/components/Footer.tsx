import { CONTACT_EMAIL, CONTACT_PHONE, ORG_NAME, ORGANIZER_NAME, PROGRAM_NAME, PROGRAM_YEAR_TITLE } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-slate-500 sm:px-6">
        <p className="font-semibold text-slate-700">{ORG_NAME} 글로컬대학30 사업</p>
        <p className="mt-1">
          {PROGRAM_YEAR_TITLE} · {PROGRAM_NAME}
        </p>
        <p className="mt-1">주관: {ORGANIZER_NAME}</p>
        <p className="mt-1">
          문의: {CONTACT_PHONE}, {CONTACT_EMAIL}
        </p>
        <p className="mt-1">
          수집된 개인정보는 워크숍 신청·운영, 수료증 발급, 안내 메일 발송 목적에만 사용되며, 워크숍 종료 후
          1년(또는 관계 법령에서 정한 기간) 보관 후 파기됩니다.
        </p>
      </div>
    </footer>
  );
}
