"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { localePath, stripLocale } from "@/lib/i18n/config";
import { useDict, useLocale } from "@/lib/i18n/LocaleProvider";

const TABS = [
  { path: "/", key: "intro" },
  { path: "/apply", key: "apply" },
  { path: "/lookup", key: "lookup" },
  { path: "/survey", key: "survey" },
  { path: "/certificate", key: "certificate" },
] as const;

export function PortalTabs() {
  const current = stripLocale(usePathname());
  const locale = useLocale();
  const t = useDict().tabs;

  return (
    <nav aria-label={t.navAria} className="border-b border-slate-200 bg-white">
      <ul className="mx-auto flex max-w-5xl overflow-x-auto px-2 sm:px-6" role="list">
        {TABS.map((tab) => {
          const isActive = current === tab.path;
          return (
            <li key={tab.path}>
              <Link
                href={localePath(locale, tab.path)}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "block whitespace-nowrap border-b-[3px] px-4 py-3 text-sm font-semibold transition-colors sm:text-base",
                  isActive ? "border-accent text-brand" : "border-transparent text-slate-500 hover:text-brand"
                )}
              >
                {t[tab.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
