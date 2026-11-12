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
