-- ============================================================================
-- [8/8단계] 동영상 강의(8차) YouTube 영상 ID 4편 등록 + 1차시 안내문 'ChatGPT 스킬' 수정
-- 원본: supabase/migrations/0008_video_youtube_ids.sql (자동 생성: scripts/build_setup_sql.py — 직접 수정 금지)
-- 실행: Supabase 대시보드 > SQL Editor > New query > 이 파일 전체 붙여넣기 > Run
-- 순서: step1 → step2 → step3 → step4 → step5 → step6 → step7 → step8 (반드시 번호 순서, 각 파일 1회만) · 실행 전 step7 완료 필요
-- 오류 시 이 단계만 전부 롤백되므로 원인 수정 후 같은 파일을 다시 실행하면 된다.
-- ============================================================================

begin;

-- ============================================================================
-- 동영상 강의(8차) YouTube 영상 ID 등록 + 1차시 안내문 수정 (2026-11-25)
--   1차시 t8xAWOf2Zcg · 2차시 Pkvl_HFZQoM · 3차시 fl6mZDaMj2c · 4차시 fKd53cg9QgQ
--   (일부 공개·퍼가기 허용 확인: YouTube oEmbed 200)
--   1차시 안내문 'Claude 스킬이 …' → 'ChatGPT 스킬이 …'
-- ============================================================================

update public.video_lessons l
set youtube_id = v.yt
from (values
        (1, 't8xAWOf2Zcg'),
        (2, 'Pkvl_HFZQoM'),
        (3, 'fl6mZDaMj2c'),
        (4, 'fKd53cg9QgQ')
     ) as v(no, yt),
     public.workshops w
where w.delivery = 'video'
  and w.round = 8
  and l.workshop_id = w.id
  and l.lesson_no = v.no;

update public.video_lessons l
set intro_text = 'ChatGPT 스킬이 무엇인지 이해하고, 스킬을 직접 만들어 설치하는 방법을 다룹니다.'
from public.workshops w
where w.delivery = 'video'
  and w.round = 8
  and l.workshop_id = w.id
  and l.lesson_no = 1;

commit;

-- ── 결과 확인 ──────────────────────────────────────────────────────────────
select l.lesson_no as 차시, l.title as 제목, l.youtube_id as 영상ID, l.intro_text as 안내문
from public.video_lessons l join public.workshops w on w.id = l.workshop_id
where w.delivery = 'video' order by l.lesson_no;
