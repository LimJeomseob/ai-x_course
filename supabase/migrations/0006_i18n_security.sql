-- ============================================================================
-- 한·영 이중언어 + 보안 보완(1/2) — 추가(additive) 변경만 담는다.
--   ※ 새 코드 배포 "전"에 실행한다. 기존(구버전) 화면은 이 마이그레이션 후에도 그대로 동작한다.
--   ※ 구 신청 경로 차단(anon 권한 회수)은 배포 "후" 0007에서 수행한다.
--
--   1) 운영일·세션 영문 표시 컬럼(*_en) — NULL이면 화면·메일이 한국어 값으로 대체 표시
--   2) applications.locale — 신청 언어(ko/en). 안내 메일 언어 결정에 사용
--   3) apply_sessions — locale 저장
--   4) rate_limits / check_rate_limit — 공개 API 요청 횟수 제한(서버 전용)
--   5) cancel_codes — 본인 취소 이메일 확인 코드(서버 전용)
-- ============================================================================

-- ── 1) 영문 표시 컬럼 ───────────────────────────────────────────────────────
alter table public.workshop_days
  add column if not exists day_label_en text,
  add column if not exists instructor_en text,
  add column if not exists instructor_title_en text,
  add column if not exists instructor_org_en text,
  add column if not exists location_en text,
  add column if not exists target_en text,
  add column if not exists notes_en text,
  add column if not exists link_notice_en text;

alter table public.workshops
  add column if not exists topic_en text,
  add column if not exists contents_en jsonb,
  add column if not exists notes_en text;

-- workshops는 컬럼 단위 SELECT 권한이므로(0001) 새 공개 컬럼에도 권한을 준다.
grant select (topic_en, contents_en, notes_en) on public.workshops to anon, authenticated;

update public.workshop_days set
  day_label_en = 'Thu, Nov 5',
  instructor_en = 'Park Seongjae', instructor_title_en = 'CEO', instructor_org_en = 'MOMOEDU',
  location_en = 'HyFlex Classroom, 1F Academic Information Center (Bldg. 4)',
  target_en = 'Humanities & social sciences faculty',
  notes_en = 'Held in a computer lab — you do not need to bring a laptop. Please check your Google account and make sure you can sign in beforehand. Paid Claude (or ChatGPT) accounts are provided (details will be sent one day before).',
  link_notice_en = 'Sessions on the same day build on each other (basics → advanced), so we recommend taking them together.'
where day_code = 'A';

update public.workshop_days set
  day_label_en = 'Wed, Nov 11',
  instructor_en = 'Im Sanghoon', instructor_title_en = 'Professor', instructor_org_en = 'Kumoh National Institute of Technology',
  location_en = 'Online (Zoom)',
  target_en = 'All faculty',
  notes_en = 'The Zoom link will be emailed to applicants one day before. Using a camera and microphone is recommended.'
where day_code = 'B';

update public.workshop_days set
  day_label_en = 'Fri, Nov 13',
  instructor_en = 'Yeon Jeongho', instructor_title_en = 'Ph.D.', instructor_org_en = 'SK hynix',
  location_en = 'Computer Lab, Room 105 (Bldg. 4)',
  target_en = 'AI-X faculty',
  notes_en = 'Held in a computer lab — you do not need to bring a laptop. Please check your Google account and make sure you can sign in beforehand. Paid Claude (or ChatGPT) accounts are provided (details will be sent one day before).',
  link_notice_en = 'Sessions on the same day build on each other (basics → advanced), so we recommend taking them together.'
where day_code = 'C';

update public.workshop_days set
  day_label_en = 'Fri, Nov 20',
  instructor_en = 'Choi Youngbok', instructor_title_en = 'CEO', instructor_org_en = 'Nplus Consulting',
  location_en = 'HyFlex Classroom, 1F Academic Information Center (Bldg. 4)',
  target_en = 'AI-X faculty',
  notes_en = 'Held in a computer lab — you do not need to bring a laptop. Please check your Google account and make sure you can sign in beforehand. Paid Claude (or ChatGPT) accounts are provided (details will be sent one day before).',
  link_notice_en = 'Sessions on the same day build on each other (basics → advanced), so we recommend taking them together.'
where day_code = 'D';

update public.workshops w set
  topic_en = s.topic_en,
  contents_en = s.contents_en::jsonb,
  notes_en = s.notes_en
from (values
  (1, 'Teaching with Claude Skills (Basics)',
   '[{"no":1,"content":"Core concepts of Claude Skills and automating teaching tasks"},{"no":2,"content":"Hands-on: building lecture materials with Skills and applying them in class"}]',
   null),
  (2, 'Building a Major–AI Integration Model',
   '[{"no":1,"content":"Major–AI integration model: approaches centered on translation (languages, classics, etc.)"},{"no":2,"content":"Hands-on: major–AI integration model"}]',
   null),
  (3, 'Reflecting AI Ethics Guidelines in the Syllabus / Process-Assessment Rubrics & CQI for AI Use (Online)',
   '[{"no":1,"content":"Understanding guidelines on AI usage rules, citation, personal data, and copyright"},{"no":2,"content":"Hands-on: reflecting the guidelines in an AX course syllabus"},{"no":3,"content":"Designing process-assessment rubrics for running AX courses"},{"no":4,"content":"How to write a CQI report for AX course feedback"}]',
   null),
  (4, 'Building an AI Tutor with NotebookLM and RAG',
   '[{"no":1,"content":"Building a NotebookLM/RAG learning partner (AI study guide) from your course materials"},{"no":2,"content":"Verifying evidence-based answers and designing classroom use"}]',
   null),
  (5, 'Teaching with Claude Skills (Advanced)',
   '[{"no":1,"content":"Automating teaching tasks such as lecture materials and feedback with Claude Skills"},{"no":2,"content":"Hands-on: building course-specific Skills and applying them in class"}]',
   '※ A pre-learning video on Claude Skill basics is provided — the link will be sent three days before the session.'),
  (6, 'Teaching with ChatGPT Skills',
   '[{"no":1,"content":"Designing class activities with custom ChatGPT Skills"},{"no":2,"content":"Hands-on: Skill-based class activities by course"}]',
   null),
  (7, 'Building AI Agents with MCP',
   '[{"no":1,"content":"Building a classroom AI agent that connects external tools and data via MCP (Model Context Protocol) (advanced)"}]',
   null)
) as s(round, topic_en, contents_en, notes_en)
where w.round = s.round;

-- ── 2) 신청 언어 ────────────────────────────────────────────────────────────
alter table public.applications
  add column if not exists locale text not null default 'ko' check (locale in ('ko', 'en'));

comment on column public.applications.locale is '신청 화면 언어(ko/en). 안내 메일 언어 결정에 사용';

-- ── 3) apply_sessions — locale 저장(그 외 로직은 0001과 동일) ────────────────
create or replace function public.apply_sessions(p_payload jsonb, p_session_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_results jsonb := '[]'::jsonb;
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
  v_affiliation text := btrim(coalesce(p_payload ->> 'affiliation', ''));
  v_id_number text := btrim(coalesce(p_payload ->> 'id_number', ''));
  v_axis text := coalesce(p_payload ->> 'axis_participant', '');
  v_phone text := btrim(coalesce(p_payload ->> 'phone', ''));
  v_email text := lower(btrim(coalesce(p_payload ->> 'email', '')));
  v_consent boolean := coalesce((p_payload ->> 'consent')::boolean, false);
  v_locale text := case when p_payload ->> 'locale' = 'en' then 'en' else 'ko' end;
  v_ids uuid[];
  v_row record;
  v_app_id uuid;
begin
  if char_length(v_name) not between 1 and 50 then
    raise exception '성명을 확인해 주세요.' using errcode = '22023';
  end if;
  if char_length(v_affiliation) not between 1 and 100 then
    raise exception '소속을 확인해 주세요.' using errcode = '22023';
  end if;
  if char_length(v_id_number) not between 1 and 50 then
    raise exception '교번/직번/학번/생년월일을 확인해 주세요.' using errcode = '22023';
  end if;
  if v_axis not in ('axis', 'faculty', 'other') then
    raise exception 'AI-X 교과목 개발·인증 신청 여부를 선택해 주세요.' using errcode = '22023';
  end if;
  if v_phone !~ '^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$' then
    raise exception '휴대폰 번호 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception '이메일 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if not v_consent then
    raise exception '개인정보 수집·이용에 동의해 주세요.' using errcode = '22023';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_session_ids) as x;
  if v_ids is null or array_length(v_ids, 1) = 0 then
    raise exception '신청할 세션을 1개 이상 선택해 주세요.' using errcode = '22023';
  end if;
  if array_length(v_ids, 1) > 7 then
    raise exception '한 번에 신청할 수 있는 세션은 최대 7개입니다.' using errcode = '22023';
  end if;

  for v_row in
    select w.id, w.round, w.round_label, w.topic
    from public.workshops w
    where w.id = any (v_ids)
    order by w.round
  loop
    begin
      insert into public.applications
        (workshop_id, batch_id, name, affiliation, id_number, axis_participant, phone, email, consent, locale)
      values
        (v_row.id, v_batch, v_name, v_affiliation, v_id_number, v_axis, v_phone, v_email, true, v_locale)
      returning id into v_app_id;

      v_results := v_results || jsonb_build_object(
        'workshop_id', v_row.id, 'round', v_row.round, 'round_label', v_row.round_label,
        'topic', v_row.topic, 'ok', true, 'application_id', v_app_id);
    -- P0004(오픈 전)는 Postgres의 assert_failure 코드라 WHEN OTHERS로 잡히지 않으므로 명시한다.
    exception when assert_failure or others then
      v_results := v_results || jsonb_build_object(
        'workshop_id', v_row.id, 'round', v_row.round, 'round_label', v_row.round_label,
        'topic', v_row.topic, 'ok', false,
        'code', case when sqlstate = '23505' then 'P0005' else sqlstate end,
        'message', case
          when sqlstate = '23505' then '이미 해당 세션에 신청된 정보입니다. 신청내역조회에서 확인해 주세요.'
          when sqlstate in ('P0001', 'P0002', 'P0003', 'P0004', 'P0005') then sqlerrm
          else '신청 처리 중 오류가 발생했습니다.'
        end);
    end;
  end loop;

  -- 존재하지 않는 세션 id
  v_results := v_results || coalesce((
    select jsonb_agg(jsonb_build_object('workshop_id', x, 'ok', false, 'code', 'P0001',
                                        'message', '존재하지 않는 세션입니다.'))
    from unnest(v_ids) as x
    where not exists (select 1 from public.workshops w where w.id = x)
  ), '[]'::jsonb);

  return jsonb_build_object('batch_id', v_batch, 'results', v_results);
end;
$$;

-- 서버(Route Handler, service role)가 호출할 수 있도록 권한을 추가한다. anon 회수는 0007.
grant execute on function public.apply_sessions(jsonb, uuid[]) to service_role;

-- ── 4) 요청 횟수 제한(고정 구간 카운터) ──────────────────────────────────────
-- key에는 "용도:해시" 형태만 저장한다(IP·연락처 원문은 저장하지 않는다).
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;  -- 정책 없음 = service role 전용

comment on table public.rate_limits is '공개 API 요청 횟수 제한 카운터(서버 전용). 하루 지난 행은 자동 정리';

create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- 오래된 카운터 정리(호출의 약 1%에서만 수행)
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

-- ── 5) 본인 취소 이메일 확인 코드 ────────────────────────────────────────────
create table if not exists public.cancel_codes (
  application_id uuid primary key references public.applications(id) on delete cascade,
  code_hash text not null,          -- sha256(application_id:code) — 코드 원문은 저장하지 않는다
  attempts int not null default 0,  -- 오입력 횟수(5회 초과 시 재발급 필요)
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.cancel_codes enable row level security;  -- 정책 없음 = service role 전용

comment on table public.cancel_codes is '본인 취소 확인 코드(신청 이메일로 발송, 10분 유효). 서버 전용';
