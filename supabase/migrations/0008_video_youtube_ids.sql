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
