-- ============================================================================
-- [6/6단계] 보안 보강(함수 search_path 고정 · 수료증 버킷 PDF/10MB 제한)
-- 원본: supabase/migrations/0006_security_hardening.sql (자동 생성: scripts/build_setup_sql.py — 직접 수정 금지)
-- 실행: Supabase 대시보드 > SQL Editor > New query > 이 파일 전체 붙여넣기 > Run
-- 순서: step1 → step2 → step3 → step4 → step5 → step6 (반드시 번호 순서, 각 파일 1회만) · 실행 전 step5 완료 필요
-- 오류 시 이 단계만 전부 롤백되므로 원인 수정 후 같은 파일을 다시 실행하면 된다.
-- ============================================================================

begin;

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

commit;

-- ── 결과 확인 ──────────────────────────────────────────────────────────────
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('set_updated_at', 'format_phone')
      and p.proconfig is not null) as 고정함수_기대값_2,
  (select allowed_mime_types::text || ' / ' || file_size_limit
    from storage.buckets where id = 'certificates') as 버킷제한_기대값_pdf_10485760;
