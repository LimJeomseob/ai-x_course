import Link from "next/link";
import { LocationLink } from "@/components/LocationLink";
import { ProgramCards } from "@/components/ProgramCards";
import {
  BACKGROUND_ITEMS,
  BENEFITS,
  DEADLINE_NOTICE,
  MAP_URL,
  OVERVIEW_ITEMS,
  OVERVIEW_LOCATION_TEXT,
  PROGRAM_NAME,
  PROGRAM_YEAR_TITLE,
} from "@/lib/constants";

export default function IntroPage() {
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="intro-title" className="rounded-2xl bg-brand px-6 py-8 text-white shadow-card sm:px-10 sm:py-10">
        <p className="text-sm font-medium text-white/80">경상국립대학교 글로컬대학30 · {PROGRAM_YEAR_TITLE}</p>
        <h1 id="intro-title" className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">
          {PROGRAM_NAME}
        </h1>
        <ul className="mt-5 flex flex-col gap-2 text-sm leading-relaxed text-white/90 sm:text-base">
          {BACKGROUND_ITEMS.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true">○</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/apply"
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-brand shadow-card hover:bg-slate-100 sm:text-base"
          >
            세션 신청하기
          </Link>
          <Link
            href="/lookup"
            className="rounded-lg border-2 border-white/70 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10 sm:text-base"
          >
            신청내역조회
          </Link>
        </div>
      </section>

      <section aria-labelledby="overview-title">
        <h2 id="overview-title" className="text-xl font-bold text-slate-900">
          운영개요
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {OVERVIEW_ITEMS.slice(0, 4).map((item) => (
            <OverviewItem key={item.label} label={item.label} value={item.value} />
          ))}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <dt className="text-xs font-bold text-slate-500">운영장소</dt>
            <dd className="mt-1 text-sm text-slate-800">
              <LocationLink location={OVERVIEW_LOCATION_TEXT} url={MAP_URL} /> / 실시간 줌(ZOOM)
            </dd>
          </div>
          {OVERVIEW_ITEMS.slice(4).map((item) => (
            <OverviewItem key={item.label} label={item.label} value={item.value} />
          ))}
        </dl>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          ⏰ 신청 마감: {DEADLINE_NOTICE} · 동일 세션 중복 신청 불가(다른 세션은 각각 신청 가능)
        </p>
      </section>

      <section aria-labelledby="benefit-title" className="rounded-2xl border border-brand/20 bg-white p-6 shadow-card">
        <h2 id="benefit-title" className="text-lg font-bold text-brand">
          수료 시 혜택
        </h2>
        <ul className="mt-3 flex flex-col gap-3 text-sm text-slate-700 sm:text-base">
          {BENEFITS.map((b) => (
            <li key={b.title}>
              <p>
                <strong>({b.title})</strong> {b.body}
              </p>
              {b.note && <p className="mt-1 text-sm text-slate-500">{b.note}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-500">수료증은 이수한 세션마다 1장씩 발급됩니다(공식 발급번호·직인 포함 A4 PDF).</p>
      </section>

      <section aria-labelledby="sessions-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="sessions-title" className="text-xl font-bold text-slate-900">
            운영일·세션 안내
          </h2>
          <p className="text-sm text-slate-500">세션(차시)별 선착순 신청 · 대면 세션별 정원 25명</p>
        </div>
        <div className="mt-4">
          <ProgramCards />
        </div>
      </section>
    </div>
  );
}

function OverviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{value}</dd>
    </div>
  );
}
