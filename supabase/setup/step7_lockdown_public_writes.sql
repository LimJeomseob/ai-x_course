-- ============================================================================
-- [7/7단계] 공개 역할의 직접 신청·설문 쓰기 차단 (※ 반드시 새 코드 배포 후에 실행)
-- 원본: supabase/migrations/0007_lockdown_public_writes.sql (자동 생성: scripts/build_setup_sql.py — 직접 수정 금지)
-- 실행: Supabase 대시보드 > SQL Editor > New query > 이 파일 전체 붙여넣기 > Run
-- 순서: step1 → step2 → step3 → step4 → step5 → step6 → step7 (반드시 번호 순서, 각 파일 1회만) · 실행 전 step6 완료 필요
-- 오류 시 이 단계만 전부 롤백되므로 원인 수정 후 같은 파일을 다시 실행하면 된다.
-- ============================================================================

begin;

-- ============================================================================
-- 보안 보완(2/2) — 공개 역할의 직접 쓰기 경로 차단.
--   ※ 반드시 새 코드 배포 "후"에 실행한다(0006 → 배포 → 0007).
--     배포 전에 실행하면 구버전 화면의 신청·만족도 제출이 실패한다.
--
--   신청·만족도 제출은 서버 Route Handler(/api/apply, /api/survey)가 요청 횟수 제한을
--   거친 뒤 service role로 처리한다. 브라우저(anon key)의 직접 호출은 막는다.
-- ============================================================================

-- 신청 RPC: anon/authenticated 실행 권한 회수(서버 전용)
revoke execute on function public.apply_sessions(jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.apply_sessions(jsonb, uuid[]) to service_role;

-- 만족도조사: 공개 INSERT 정책 제거(서버 전용). 조회·삭제 정책(관리자)은 유지.
drop policy if exists "survey_insert_public" on public.survey_responses;

commit;

-- ── 결과 확인 ──────────────────────────────────────────────────────────────
select
  has_function_privilege('anon', 'public.apply_sessions(jsonb, uuid[])', 'execute') as anon_신청RPC_기대값_false,
  has_function_privilege('service_role', 'public.apply_sessions(jsonb, uuid[])', 'execute') as 서버_신청RPC_기대값_true,
  (select count(*) from pg_policies
    where schemaname = 'public' and policyname = 'survey_insert_public') as 설문_공개정책_기대값_0;
