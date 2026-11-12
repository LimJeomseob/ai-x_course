import Link from "next/link";
import { LocationLink } from "@/components/LocationLink";
import { ProgramCards } from "@/components/ProgramCards";
import { MAP_URL } from "@/lib/constants";
import { localePath, type Locale } from "@/lib/i18n/config";
import { getContent } from "@/lib/i18n/content";
import { getDict } from "@/lib/i18n/dict";

/** 소개 탭(PRD §5.1) — 한국어(/)와 영어(/en)가 함께 쓴다. */
export function IntroView({ locale }: { locale: Locale }) {
  const t = getDict(locale).intro;
  const c = getContent(locale);

  return (
    <div className="flex flex-col gap-10">
      {c.notices.map((n) => (
        <section
          key={n.title}
          role="alert"
          aria-label={n.title}
          className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 text-slate-800 shadow-card sm:p-6"
        >
          <h2 className="text-lg font-bold text-red-700">
            📢 {t.correction} {n.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed sm:text-base">{n.apology}</p>
          <p className="mt-3 text-sm font-medium text-slate-700">{n.session}</p>
          <p className="mt-1 text-base font-bold sm:text-lg">
            <span className="text-slate-400 line-through">{n.before}</span>
            <span aria-hidden="true"> → </span>
            <span className="sr-only">{t.changedFrom}</span>
            <span className="text-red-700">{n.after}</span>
            <span className="sr-only">{t.changedTo}</span>
          </p>
          <p className="mt-2 text-sm text-slate-600">{n.note}</p>
        </section>
      ))}
      <section aria-labelledby="intro-title" className="rounded-2xl bg-brand px-6 py-8 text-white shadow-card sm:px-10 sm:py-10">
        <p className="text-sm font-medium text-white/80">
          {t.heroOrg} · {c.programYearTitle}
        </p>
        <h1 id="intro-title" className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">
          {c.programName}
        </h1>
        <ul className="mt-5 flex flex-col gap-2 text-sm leading-relaxed text-white/90 sm:text-base">
          {c.backgroundItems.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true">○</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={localePath(locale, "/apply")}
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-brand shadow-card hover:bg-slate-100 sm:text-base"
          >
            {t.applyCta}
          </Link>
          <Link
            href={localePath(locale, "/lookup")}
            className="rounded-lg border-2 border-white/70 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10 sm:text-base"
          >
            {t.lookupCta}
          </Link>
        </div>
      </section>

      <section aria-labelledby="overview-title">
        <h2 id="overview-title" className="text-xl font-bold text-slate-900">
          {t.overviewTitle}
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {c.overviewItems.slice(0, 4).map((item) => (
            <OverviewItem key={item.label} label={item.label} value={item.value} />
          ))}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <dt className="text-xs font-bold text-slate-500">{t.locationLabel}</dt>
            <dd className="mt-1 text-sm text-slate-800">
              <LocationLink location={c.overviewLocationText} url={MAP_URL} /> / {t.zoomLive}
            </dd>
          </div>
          {c.overviewItems.slice(4).map((item) => (
            <OverviewItem key={item.label} label={item.label} value={item.value} />
          ))}
        </dl>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          {t.deadlineLine(c.deadlineNotice)}
        </p>
      </section>

      <section aria-labelledby="benefit-title" className="rounded-2xl border border-brand/20 bg-white p-6 shadow-card">
        <h2 id="benefit-title" className="text-lg font-bold text-brand">
          {t.benefitTitle}
        </h2>
        <ul className="mt-3 flex flex-col gap-3 text-sm text-slate-700 sm:text-base">
          {c.benefits.map((b) => (
            <li key={b.title}>
              <p>
                <strong>({b.title})</strong> {b.body}
              </p>
              {b.note && <p className="mt-1 text-sm text-slate-500">{b.note}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-500">{t.certNote}</p>
      </section>

      <section aria-labelledby="sessions-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="sessions-title" className="text-xl font-bold text-slate-900">
            {t.sessionsTitle}
          </h2>
          <p className="text-sm text-slate-500">{t.sessionsSub}</p>
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
