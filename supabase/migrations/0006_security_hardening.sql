-- ============================================================================
-- 보안 보강(2026-11-17 보안 점검) — 여러 번 실행해도 결과가 같다.
--  1) search_path 미고정 함수 고정(Supabase Security Advisor 0011 function_search_path_mutable)
--  2) 수료증 버킷: PDF만, 10MB 이하만 업로드 허용
--     (공개 수료증 발급은 서명 업로드 URL로 브라우저가 PDF를 올리므로 형식·크기를 버킷에서 제한한다)
-- ============================================================================

-- 두 함수 모두 내장 함수(pg_catalog)만 사용하므로 빈 search_path로 고정해도 동작이 같다.
alter function public.set_updated_at() set search_path = '';
alter function public.format_phone(text) set search_path = '';

update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf']
 where id = 'certificates';
