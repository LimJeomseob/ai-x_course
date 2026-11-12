"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { getDict, type Dict } from "./dict";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** 포털 레이아웃이 언어를 내려 준다. Provider 밖(관리자 화면)은 한국어로 동작한다. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useDict(): Dict {
  return getDict(useContext(LocaleContext));
}
