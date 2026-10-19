/**
 * Supabase 프로젝트 기본 URL(https://<ref>.supabase.co).
 * 대시보드의 "RESTful endpoint"(…/rest/v1/)를 그대로 붙여넣어도 동작하도록
 * 끝의 /rest/v1 경로와 슬래시를 제거한다(supabase-js가 /rest/v1을 직접 붙인다).
 */
export function supabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/, "");
}
