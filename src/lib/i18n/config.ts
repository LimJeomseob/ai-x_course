/**
 * 포털 언어 설정. 한국어는 기존 주소(/apply), 영어는 /en 접두 주소(/en/apply)로 서비스한다.
 * 미들웨어·rewrites 없이 app/(en)/en/* 실제 경로로 구현한다(보안 권고 회피).
 */
export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko";

/** 외부 입력(요청 본문·DB 값)을 허용 목록으로 정규화한다. 알 수 없는 값은 한국어. */
export function toLocale(value: unknown): Locale {
  return value === "en" ? "en" : "ko";
}

/** 포털 내부 경로("/apply")를 언어별 주소로 바꾼다. */
export function localePath(locale: Locale, path: string): string {
  if (locale === "ko") return path;
  return path === "/" ? "/en" : `/en${path}`;
}

/** 현재 경로에서 언어 접두를 뗀 포털 내부 경로를 얻는다("/en/apply" → "/apply"). */
export function stripLocale(pathname: string): string {
  if (pathname === "/en") return "/";
  return pathname.startsWith("/en/") ? pathname.slice(3) : pathname;
}
