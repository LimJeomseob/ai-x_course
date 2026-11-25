-- ============================================================================
-- [6/6단계] 동영상 강의(LMS) — 차시·시청 기록 테이블, 동영상 세션(8차)·차시 4편
-- 원본: supabase/migrations/0006_video_lms.sql (자동 생성: scripts/build_setup_sql.py — 직접 수정 금지)
-- 실행: Supabase 대시보드 > SQL Editor > New query > 이 파일 전체 붙여넣기 > Run
-- 순서: step1 → step2 → step3 → step4 → step5 → step6 (반드시 번호 순서, 각 파일 1회만) · 실행 전 step5 완료 필요
-- 오류 시 이 단계만 전부 롤백되므로 원인 수정 후 같은 파일을 다시 실행하면 된다.
-- ============================================================================

begin;

-- ============================================================================
-- 동영상 강의(LMS) — 「동영상 강의」 탭 (2026-11-25)
--  - 동영상 과정 = workshops의 한 종류(delivery = 'video'). 신청·이수·수료증·발급대장은 기존 흐름을 그대로 쓴다.
--  - 영상은 YouTube 임베드로만 재생한다. 영상 파일은 Supabase(Storage·DB)에 저장하지 않는다.
--  - video_lessons: 차시(YouTube 영상 ID·길이·이수 기준·안내문), video_progress: 신청 건 × 차시별 시청 기록
--  - 차시별 실제 시청 구간 ≥ pass_ratio(기본 0.9)면 차시 이수, 전 차시 이수 시 applications.status = '이수'
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) workshops.delivery — 대면/온라인 실시간(live) · 동영상(video)
-- ----------------------------------------------------------------------------
alter table public.workshops
  add column delivery text not null default 'live' check (delivery in ('live', 'video'));

comment on column public.workshops.delivery is 'live = 일시가 정해진 세션, video = 동영상 강의(상시 수강, 자동 안내 메일 제외)';

-- 공개 역할은 컬럼 단위 SELECT 권한만 가진다(0001) — 새 컬럼도 명시적으로 허용한다.
grant select (delivery) on public.workshops to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) video_lessons — 차시
-- ----------------------------------------------------------------------------
create table public.video_lessons (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  lesson_no int not null check (lesson_no > 0),
  title text not null,
  youtube_id text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'), -- NULL = 영상 준비 중
  duration_sec int not null check (duration_sec > 0),
  pass_ratio numeric(4, 3) not null default 0.9 check (pass_ratio > 0 and pass_ratio <= 1),
  intro_text text not null default '',   -- 이 차시 안내문(앞 차시 종료 화면의 "다음 강의 안내"로 표시)
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workshop_id, lesson_no)
);

comment on table public.video_lessons is '동영상 강의 차시. 영상은 YouTube로만 재생하며 youtube_id(11자)만 저장한다';

-- ----------------------------------------------------------------------------
-- 3) video_progress — 신청 건 × 차시 시청 기록
-- ----------------------------------------------------------------------------
create table public.video_progress (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  lesson_id uuid not null references public.video_lessons(id) on delete cascade,
  watched_sec numeric(10, 1) not null default 0,          -- 실제 재생 시간 누적(서버가 경과 시간으로 상한 적용)
  covered_ranges jsonb not null default '[]'::jsonb,       -- 본 구간 [[시작초, 끝초], ...] (병합 상태)
  coverage_ratio numeric(6, 4) not null default 0,         -- min(본 구간 합, 누적 재생) / 영상 길이
  last_position_sec numeric(10, 1) not null default 0,     -- 이어보기 위치
  hb_count int not null default 0,                         -- 수신한 기록 요청 수
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz,
  status text not null default '수강중' check (status in ('수강중', '이수')),
  completed_at timestamptz,
  next_confirmed_at timestamptz,                            -- 「다음 강의로 이동」을 누른 시각
  note text,                                                -- 서버 보정 기록(예: 경과 시간 초과분 절삭)
  updated_at timestamptz not null default now(),
  unique (application_id, lesson_id)
);

create index video_progress_application_idx on public.video_progress (application_id);

create trigger trg_video_progress_updated_at
before update on public.video_progress
for each row execute function public.set_updated_at();

comment on table public.video_progress is '동영상 시청 기록. 쓰기는 서버 API(service role)만, 조회는 관리자';

-- ----------------------------------------------------------------------------
-- 4) 과정 이수 판정 — 신청 건의 모든 활성 차시가 이수면 마지막 차시 이수 시각, 아니면 NULL
-- ----------------------------------------------------------------------------
create or replace function public.video_course_completed_at(p_application_id uuid)
returns timestamptz
language sql
security definer
set search_path = public
stable
as $$
  select case
    when count(l.id) > 0 and count(l.id) = count(p.completed_at) then max(p.completed_at)
  end
  from public.applications a
  join public.video_lessons l on l.workshop_id = a.workshop_id and l.enabled
  left join public.video_progress p
    on p.lesson_id = l.id and p.application_id = a.id and p.status = '이수'
  where a.id = p_application_id;
$$;

revoke all on function public.video_course_completed_at(uuid) from public;
grant execute on function public.video_course_completed_at(uuid) to authenticated, service_role;

-- 전 차시 이수 시 신청 상태를 '이수'로 바꾼다. 신청완료 건만 대상(취소·대기는 바꾸지 않음).
create or replace function public.video_finalize_course(p_application_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done timestamptz;
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;

  v_done := public.video_course_completed_at(p_application_id);
  if v_done is null then
    return false;
  end if;

  update public.applications
     set status = '이수'
   where id = p_application_id
     and status = '신청완료';
  return true;
end;
$$;

revoke all on function public.video_finalize_course(uuid) from public;
grant execute on function public.video_finalize_course(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5) 발급대장 뷰 — 동영상 세션의 '기간'은 과정 이수일로 표기
-- ----------------------------------------------------------------------------
create or replace view public.certificate_ledger
with (security_invoker = true)
as
with unioned as (
  select
    'legacy'::text as source_type,
    l.cert_no,
    l.name,
    l.affiliation,
    l.course,
    l.period,
    l.issued_at,
    nullif(l.issued_at_raw, '') as issued_at_label,
    l.issued_channel,
    l.reissue_count,
    l.reissued_at,
    l.issuer,
    false as pdf_stored,
    null::text as pdf_path,
    null::uuid as application_id,
    null::int as round
  from public.legacy_certificates l
  union all
  select
    'new'::text,
    c.cert_no,
    a.name,
    a.affiliation,
    'AI-X 워크숍 ' || w.round_label || ' · ' || w.topic,
    case
      when w.delivery = 'video' then
        coalesce(
          to_char(public.video_course_completed_at(a.id) at time zone 'Asia/Seoul', 'YYYY.MM.DD.'),
          to_char(c.issued_at at time zone 'Asia/Seoul', 'YYYY.MM.DD.')
        ) || ' AI활용 동영상 강의 이수'
      else
        to_char(w.start_at at time zone 'Asia/Seoul', 'YYYY.MM.DD. HH24:MI') || ' ~ '
          || to_char(w.end_at at time zone 'Asia/Seoul', 'HH24:MI')
    end,
    c.issued_at,
    to_char(c.issued_at at time zone 'Asia/Seoul', 'YYYY. MM. DD. HH24:MI'),
    case c.issued_channel when 'public' then '본인 발급' else '관리자 발급' end,
    c.reissue_count,
    case when c.reissue_count > 0 then c.updated_at end,
    c.issuer,
    c.pdf_path is not null,
    c.pdf_path,
    c.application_id,
    w.round
  from public.certificates c
  join public.applications a on a.id = c.application_id
  join public.workshops w on w.id = a.workshop_id
)
select
  row_number() over (
    order by
      coalesce((regexp_match(cert_no, '^제(\d{4})-'))[1]::int, 9999),
      coalesce((regexp_match(cert_no, '-(\d+)호$'))[1]::int, 2147483647),
      cert_no
  )::int as seq,
  u.*
from unioned u;

-- ----------------------------------------------------------------------------
-- 6) RLS
-- ----------------------------------------------------------------------------
alter table public.video_lessons enable row level security;
alter table public.video_progress enable row level security;

create policy "video_lessons_select_public" on public.video_lessons for select using (true);
create policy "video_lessons_admin_write" on public.video_lessons
  for all using (public.is_admin()) with check (public.is_admin());

create policy "video_progress_select_admin" on public.video_progress
  for select using (public.is_admin());
create policy "video_progress_update_admin" on public.video_progress
  for update using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7) 시드 — 운영일(Day E, 상시) · 동영상 세션(8차) · 차시 4편
--    youtube_id는 업로드 후 README의 「동영상 강의 영상 ID 등록」 SQL로 채운다.
--    수강 기간(2026-11-25 ~ 12-31)은 운영 일정에 맞게 아래 update로 조정할 수 있다.
-- ----------------------------------------------------------------------------
insert into public.workshop_days
  (day_code, day_label, program_group, instructor, instructor_title, instructor_org,
   location, location_url, is_online, level, target, notes, link_notice)
values
  ('E', '상시 수강', '동영상 강의', '경상국립대학교 AI융합원', '', '',
   '온라인(동영상 강의)', null, true, '중급', '전체 교원',
   '신청 후 「동영상 강의」 탭에서 성명·연락처로 확인하고 수강합니다. 4개 차시를 각각 90% 이상 시청하면 이수 처리됩니다.',
   null);

insert into public.workshops
  (day_id, round, round_label, topic, contents, start_at, end_at, order_in_day, capacity, deadline,
   apply_open_at, notes, delivery)
select d.id, 8, '동영상 강의', 'Claude 스킬·MCP 활용',
  '[{"no":1,"content":"스킬 만들기와 설치"},{"no":2,"content":"스킬 저장소 활용과 맞춤 제작"},{"no":3,"content":"MCP 이해와 Gmail 연결"},{"no":4,"content":"MCP 확장과 스킬 조합"}]'::jsonb,
  '2026-11-25T00:00:00+09:00'::timestamptz, '2026-12-31T23:59:59+09:00'::timestamptz, 1, 9999,
  '2026-12-31T23:59:59+09:00'::timestamptz, '2026-11-25T09:00:00+09:00'::timestamptz,
  '※ 총 4차시(약 1시간 57분) · 차시별 90% 이상 시청 시 이수 · 수료증은 「수료증 발급」 탭에서 본인 발급',
  'video'
from public.workshop_days d
where d.day_code = 'E';

insert into public.video_lessons (workshop_id, lesson_no, title, duration_sec, intro_text)
select w.id, l.lesson_no, l.title, l.duration_sec, l.intro_text
from public.workshops w
cross join (values
  (1, '스킬 만들기와 설치', 1779,
   'Claude 스킬이 무엇인지 이해하고, 스킬을 직접 만들어 설치하는 방법을 다룹니다.'),
  (2, '스킬 저장소 활용과 맞춤 제작', 1739,
   '공개된 스킬 저장소에서 필요한 스킬을 찾아 쓰고, 내 수업에 맞게 고쳐 만드는 방법을 다룹니다.'),
  (3, 'MCP 이해와 Gmail 연결', 1769,
   'MCP가 무엇인지 이해하고, Gmail을 연결해 직접 사용해 봅니다.'),
  (4, 'MCP 확장과 스킬 조합', 1741,
   'MCP 연결을 넓히고, 앞에서 만든 스킬과 조합해 활용하는 방법을 다룹니다.')
) as l(lesson_no, title, duration_sec, intro_text)
where w.round = 8;

-- ----------------------------------------------------------------------------
-- 8) apply_sessions — 세션이 8개(1~7차 + 동영상)가 되어 1회 신청 상한을 7 → 8로 올린다.
--    본문은 0001_init.sql과 같고 상한 숫자·문구만 다르다.
-- ----------------------------------------------------------------------------
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
  if array_length(v_ids, 1) > 8 then
    raise exception '한 번에 신청할 수 있는 세션은 최대 8개입니다.' using errcode = '22023';
  end if;

  for v_row in
    select w.id, w.round, w.round_label, w.topic
    from public.workshops w
    where w.id = any (v_ids)
    order by w.round
  loop
    begin
      insert into public.applications
        (workshop_id, batch_id, name, affiliation, id_number, axis_participant, phone, email, consent)
      values
        (v_row.id, v_batch, v_name, v_affiliation, v_id_number, v_axis, v_phone, v_email, true)
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

revoke all on function public.apply_sessions(jsonb, uuid[]) from public;
grant execute on function public.apply_sessions(jsonb, uuid[]) to anon, authenticated;

-- ============================================================================
-- 공개 정원현황(집계값만 노출)

commit;

-- ── 결과 확인 ──────────────────────────────────────────────────────────────
select
  (select count(*) from public.workshops where delivery = 'video') as 동영상세션_기대값_1,
  (select count(*) from public.video_lessons) as 차시_기대값_4,
  (select count(*) from public.video_lessons where youtube_id is null) as 영상ID_미등록_차시수;
