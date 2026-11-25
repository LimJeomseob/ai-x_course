-- ============================================================================
-- [7/8단계] 동영상 강의(8차) 주제 변경 'Claude 스킬·MCP 활용' → 'ChatGPT 스킬·MCP 활용'
-- 원본: supabase/migrations/0007_video_topic_chatgpt.sql (자동 생성: scripts/build_setup_sql.py — 직접 수정 금지)
-- 실행: Supabase 대시보드 > SQL Editor > New query > 이 파일 전체 붙여넣기 > Run
-- 순서: step1 → step2 → step3 → step4 → step5 → step6 → step7 → step8 (반드시 번호 순서, 각 파일 1회만) · 실행 전 step6 완료 필요
-- 오류 시 이 단계만 전부 롤백되므로 원인 수정 후 같은 파일을 다시 실행하면 된다.
-- ============================================================================

begin;

-- ============================================================================
-- 동영상 강의(8차) 주제 변경 (2026-11-25)
--   기존 'Claude 스킬·MCP 활용' → 변경 'ChatGPT 스킬·MCP 활용'
--   소개·신청·조회·수료증 발급 화면과 수료증 프로그램명, 발급대장 과정명에 함께 반영된다.
-- ============================================================================

update public.workshops
set topic = 'ChatGPT 스킬·MCP 활용'
where delivery = 'video'
  and round = 8;

commit;

-- ── 결과 확인 ──────────────────────────────────────────────────────────────
select round_label, topic as 주제_기대값_ChatGPT_스킬_MCP_활용
from public.workshops where delivery = 'video';
