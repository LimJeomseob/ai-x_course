-- ============================================================================
-- [2/4단계] 기본 데이터(운영일 4·세션 7·관리자·메일 설정/템플릿)
-- 원본: supabase/migrations/0002_seed.sql (자동 생성: scripts/build_setup_sql.py — 직접 수정 금지)
-- 실행: Supabase 대시보드 > SQL Editor > New query > 이 파일 전체 붙여넣기 > Run
-- 순서: step1 → step2 → step3 → step4 (반드시 번호 순서, 각 파일 1회만) · 실행 전 step1 완료 필요
-- 오류 시 이 단계만 전부 롤백되므로 원인 수정 후 같은 파일을 다시 실행하면 된다.
-- ============================================================================

begin;

-- ============================================================================
-- 시드: 운영일 4개(Day A~D) · 세션 7개 · 관리자 · 메일 설정/템플릿 (PRD §13-A, §5.1, §9.4)
-- 차시 번호는 개설일 순서로 재부여(계획안 원문 5차→3차, 3·4차→4·5차).
-- 마감(deadline) = 운영일 전날 23:59:59 KST, 신청 오픈 = 2026-10-21 09:00 KST
-- ============================================================================

insert into public.workshop_days
  (day_code, day_label, program_group, instructor, instructor_title, instructor_org,
   location, location_url, is_online, level, target, notes, link_notice)
values
  ('A', '11/5(목)', '11월 워크숍', '박성재', '대표', '모모에듀',
   '4동 학술정보관 1층 하이플렉스강의실', 'https://naver.me/5chMgpBo', false, '중급', '인문사회계열 교원',
   '전산 실습실로 개인 노트북은 미지참해도 됨. 구글 계정 확인 후 사전 로그인 확인 요청, Claude(또는 ChatGPT) 유료계정 사용 지원(D-1 안내 예정)',
   '같은 날 세션은 기초→심화로 연계 구성되어 있어 함께 수강을 권장합니다'),
  ('B', '11/11(수)', '11월 워크숍', '임상훈', '교수', '국립 금오공대',
   '온라인(Zoom)', null, true, '초급', '전체 교원',
   'Zoom 링크는 신청자 이메일로 D-1 발송, 카메라·마이크 사용 권장',
   null),
  ('C', '11/13(금)', '11월 워크숍', '연정호', '박사', 'SK hynics',
   '4동 105호 전산실습실', 'https://naver.me/5chMgpBo', false, '고급', 'AI-X 교원',
   '전산 실습실로 개인 노트북은 미지참해도 됨. 구글 계정 확인 후 사전 로그인 확인 요청, Claude(또는 ChatGPT) 유료계정 사용 지원(D-1 안내 예정)',
   '같은 날 세션은 기초→심화로 연계 구성되어 있어 함께 수강을 권장합니다'),
  ('D', '11/20(금)', '11월 워크숍', '최영복', '대표', 'Nplus',
   '4동 학술정보관 1층 하이플렉스강의실', 'https://naver.me/5chMgpBo', false, '고급', 'AI-X 교원',
   '전산 실습실로 개인 노트북은 미지참해도 됨. 구글 계정 확인 후 사전 로그인 확인 요청, Claude(또는 ChatGPT) 유료계정 사용 지원(D-1 안내 예정)',
   '같은 날 세션은 기초→심화로 연계 구성되어 있어 함께 수강을 권장합니다');

insert into public.workshops
  (day_id, round, round_label, topic, contents, start_at, end_at, order_in_day, capacity, deadline, apply_open_at, notes)
select d.id, s.round, s.round_label, s.topic, s.contents::jsonb,
       s.start_at::timestamptz, s.end_at::timestamptz, s.order_in_day, s.capacity,
       s.deadline::timestamptz, '2026-10-21T09:00:00+09:00'::timestamptz, s.notes
from (values
  ('A', 1, '1차', 'Claude Skill 기반 교수법 활용(기초)',
   '[{"no":1,"content":"Claude Skill 기초 개념 및 교수 업무 자동화"},{"no":2,"content":"Skill을 활용한 강의자료 제작 및 수업 적용 실습"}]',
   '2026-11-05T13:30:00+09:00', '2026-11-05T15:30:00+09:00', 1, 25, '2026-11-04T23:59:59+09:00', ''),
  ('A', 2, '2차', '전공-AI 연계 모델 수립',
   '[{"no":1,"content":"전공-AI 연계 모델: 번역(언어, 고전 등)을 중심으로 한 연계 방법"},{"no":2,"content":"전공-AI 연계 모델 실습"}]',
   '2026-11-05T15:30:00+09:00', '2026-11-05T17:30:00+09:00', 2, 25, '2026-11-04T23:59:59+09:00', ''),
  ('B', 3, '3차', 'AI 윤리 가이드 강의계획서 반영 / AI 활용 과정평가 루브릭·CQI(온라인)',
   '[{"no":1,"content":"AI 사용규칙·출처 표기·개인정보·저작권 가이드 이해"},{"no":2,"content":"AX 교과목 강의계획서 반영 실습"},{"no":3,"content":"AX 교과목 운영을 위한 과정평가 루브릭 설계"},{"no":4,"content":"AX 교과목 환류를 위한 CQI 작성 방법"}]',
   '2026-11-11T13:30:00+09:00', '2026-11-11T15:30:00+09:00', 1, 9999, '2026-11-10T23:59:59+09:00', ''),
  ('C', 4, '4차', 'NotebookLM·RAG 기반 AI 튜터 만들기',
   '[{"no":1,"content":"전공 자료 기반 NotebookLM·RAG 학습 파트너(AI 학습가이드) 구축"},{"no":2,"content":"근거 기반 답변 검증 및 수업 적용 방안 설계"}]',
   '2026-11-13T13:30:00+09:00', '2026-11-13T15:30:00+09:00', 1, 25, '2026-11-12T23:59:59+09:00', ''),
  ('C', 5, '5차', 'Claude Skill 기반 교수법 활용(심화)',
   '[{"no":1,"content":"Claude Skill 기반 강의자료·피드백 등 교수 업무 자동화"},{"no":2,"content":"교과목 맞춤형 Skill 제작 및 수업 적용 실습"}]',
   '2026-11-13T15:30:00+09:00', '2026-11-13T17:30:00+09:00', 2, 25, '2026-11-12T23:59:59+09:00',
   '※ Claude Skill 기초 동영상 강의 사전 학습 제공 — 사전학습 링크는 D-3일 전 안내 예정'),
  ('D', 6, '6차', 'ChatGPT Skill 기반 교수법 활용',
   '[{"no":1,"content":"ChatGPT 맞춤형 Skill 기반 수업 활동 설계"},{"no":2,"content":"교과목별 Skill 활용 수업 활동 실습"}]',
   '2026-11-20T13:30:00+09:00', '2026-11-20T15:30:00+09:00', 1, 25, '2026-11-19T23:59:59+09:00', ''),
  ('D', 7, '7차', 'MCP 기반 AI 에이전트 제작',
   '[{"no":1,"content":"MCP(Model Context Protocol)를 활용한 외부 도구·데이터 연동 수업용 AI 에이전트 제작(심화)"}]',
   '2026-11-20T15:30:00+09:00', '2026-11-20T17:30:00+09:00', 2, 25, '2026-11-19T23:59:59+09:00', '')
) as s(day_code, round, round_label, topic, contents, start_at, end_at, order_in_day, capacity, deadline, notes)
join public.workshop_days d on d.day_code = s.day_code;

insert into public.admin_users (email, role)
values
  ('eros4424@gmail.com', 'superadmin'),
  ('ssh850920@gmail.com', 'admin')
on conflict (email) do nothing;

insert into public.email_settings (id) values (1) on conflict (id) do nothing;

-- 제목·본문 NULL = 코드 기본 템플릿(src/lib/email/templates.ts) 사용. 관리자 화면에서 덮어쓸 수 있다.
insert into public.email_templates (type, variables)
values
  ('M1', array['성명', '신청건수', '세션목록표', '정원대기안내', '협조사항', '취소방법', '포털URL']),
  ('M2', array['성명', '차수', '주제', '일시', '변경전상태', '변경후상태', '안내문', '변경목록표']),
  ('M3', array['성명', '운영일', '세션목록', '장소', '강사', '협조사항', '사전학습URL', '참석확인취소방법']),
  ('M5', array['성명', '운영일', '세션목록', '유료계정안내', '구글계정안내', 'Zoom링크', '장소']),
  ('M4', array['성명', '운영일', '세션목록', '장소', '입실시간', '준비물', 'Zoom링크', '문의처'])
on conflict (type) do nothing;

commit;

-- ── 결과 확인 ──────────────────────────────────────────────────────────────
select
  (select count(*) from public.workshop_days) as 운영일_기대값_4,
  (select count(*) from public.workshops) as 세션_기대값_7,
  (select string_agg(email, ', ') from public.admin_users) as 관리자,
  (select count(*) from public.email_templates) as 메일템플릿_기대값_5;
