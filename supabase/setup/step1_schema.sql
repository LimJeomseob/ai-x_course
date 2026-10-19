-- ============================================================================
-- [1/4단계] 스키마 생성(테이블·트리거·RPC·RLS·Storage 버킷)
-- 원본: supabase/migrations/0001_init.sql (자동 생성: scripts/build_setup_sql.py — 직접 수정 금지)
-- 실행: Supabase 대시보드 > SQL Editor > New query > 이 파일 전체 붙여넣기 > Run
-- 순서: step1 → step2 → step3 → step4 (반드시 번호 순서, 각 파일 1회만)
-- 오류 시 이 단계만 전부 롤백되므로 원인 수정 후 같은 파일을 다시 실행하면 된다.
-- ============================================================================

begin;

-- ============================================================================
-- AI-X 교과목 개발·인증을 위한 AI 활용 역량 강화 워크숍 신청·관리 시스템 — 초기 스키마
-- PRD §7(데이터 모델), §8(비즈니스 규칙), §6.1(관리자 인증·RLS), §9.4(메일 테이블) 참조
-- 참조 시스템(limjeomseob/GLOCAL_AI) 0001~0012 마이그레이션을 통합·재설계한 신규 프로젝트용 스키마.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 공통 유틸
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 연락처 정규화: 숫자만 추출 → 11자리 3-4-4, 10자리 3-3-4 (src/lib/format.ts formatPhone과 동일 규칙)
create or replace function public.format_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case length(d)
    when 11 then substr(d, 1, 3) || '-' || substr(d, 4, 4) || '-' || substr(d, 8, 4)
    when 10 then substr(d, 1, 3) || '-' || substr(d, 4, 3) || '-' || substr(d, 7, 4)
    else coalesce(p_phone, '')
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) s;
$$;

-- ============================================================================
-- 7.1 workshop_days — 운영일(세션 묶음·표시 단위)
-- ============================================================================
create table public.workshop_days (
  id uuid primary key default gen_random_uuid(),
  day_code text not null unique check (day_code ~ '^[A-Z]$'),
  day_label text not null,                -- 예: 11/5(목)
  program_group text not null default '11월 워크숍',
  instructor text not null,
  instructor_title text not null default '',
  instructor_org text not null default '',
  location text not null,
  location_url text,                      -- 대면: https://naver.me/5chMgpBo, 온라인: NULL
  is_online boolean not null default false,
  level text not null check (level in ('초급', '중급', '고급')),
  target text not null,
  notes text not null default '',         -- 운영일 공통 협조사항
  link_notice text,                       -- 같은 날 세션 연계 수강 권장 문구
  created_at timestamptz not null default now()
);

comment on table public.workshop_days is '운영일(Day A~D). 신청·정원·마감은 세션(workshops) 단위 (PRD §7.1)';

-- ============================================================================
-- 7.2 workshops — 세션(차수) = 신청 단위
-- ============================================================================
create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.workshop_days(id) on delete restrict,
  round int not null unique check (round > 0),
  round_label text not null,              -- 1차~7차
  topic text not null,
  contents jsonb not null default '[]'::jsonb,   -- [{no, content}]
  start_at timestamptz not null,
  end_at timestamptz not null,
  order_in_day int not null default 1,
  capacity int not null check (capacity > 0),    -- 대면 25 / 온라인 9999(제한 없음)
  deadline timestamptz not null,                 -- 운영일 KST 전날 23:59:59 (D-1)
  apply_open_at timestamptz not null default '2026-10-21T09:00:00+09:00',
  notes text not null default '',                -- 세션별 추가 협조사항
  prelearning_url text,                          -- 사전학습 URL(5차) — 관리자 입력, M3로만 발송
  zoom_link text,                                -- Zoom 링크(3차) — 관리자 입력, M5·M4로만 발송
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index workshops_day_id_idx on public.workshops (day_id);

comment on table public.workshops is '세션(1~7차) 메타. deadline = 운영일 전날 23:59:59 KST (PRD §8)';
comment on column public.workshops.zoom_link is '포털 비노출 — 공개 역할에는 컬럼 SELECT 권한을 주지 않는다';
comment on column public.workshops.prelearning_url is '포털 비노출 — 공개 역할에는 컬럼 SELECT 권한을 주지 않는다';

-- ============================================================================
-- 7.3 applications — 신청(세션 단위)
-- ============================================================================
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete restrict,
  batch_id uuid,                                  -- 같은 제출에서 함께 생성된 신청 묶음
  name text not null check (char_length(name) between 1 and 50),
  affiliation text not null check (char_length(affiliation) between 1 and 100),
  id_number text not null check (char_length(id_number) between 1 and 50),
  axis_participant text not null check (axis_participant in ('axis', 'faculty', 'other')),
  phone text not null,
  phone_digits text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored,
  email text not null default '',
  consent boolean not null check (consent = true),
  status text not null default '신청완료' check (status in ('신청완료', '대기', '취소', '이수')),
  cert_issued boolean not null default false,
  created_by_admin boolean not null default false,
  notice1_confirmed boolean not null default false,  -- 1차 신청결과 안내(M1)
  notice2_confirmed boolean not null default false,  -- 2차 수강안내(M3)
  notice3_confirmed boolean not null default false,  -- 3차 최종안내(M4)
  created_at timestamptz not null default now()
);

create index applications_workshop_id_idx on public.applications (workshop_id);
create index applications_lookup_idx on public.applications (name, phone);
create index applications_batch_id_idx on public.applications (batch_id);
create index applications_email_idx on public.applications (lower(email));

-- 동일 세션 중복신청 차단(PRD §7.3). 관리자 대리등록(created_by_admin)은 UI confirm 후 허용하므로 제외한다.
-- 공개 신청은 트리거(P0005)가 관리자 등록 건까지 포함해 연락처·식별번호를 검사한다.
create unique index applications_unique_active_phone
  on public.applications (workshop_id, phone_digits)
  where status in ('신청완료', '대기', '이수') and created_by_admin = false;

comment on table public.applications is '세션 신청. 신청내역조회는 성명+연락처 일치 건만 서버 API에서 반환 (PRD §5.3)';

-- ============================================================================
-- 7.4 survey_responses — 만족도 응답 (문항 v0.9, PRD §5.4)
-- ============================================================================
create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  workshop_round int,
  workshop text not null,
  axis_participant text not null check (axis_participant in ('axis', 'faculty', 'other')),
  college_group text not null,
  awareness_path text not null,
  q1 int not null check (q1 between 1 and 5),
  q2 int not null check (q2 between 1 and 5),
  q3 int not null check (q3 between 1 and 5),
  q4 int not null check (q4 between 1 and 5),
  q5 int not null check (q5 between 1 and 5),
  q6 int not null check (q6 between 1 and 5),
  q7 int not null check (q7 between 1 and 5),
  o1 text not null default '' check (char_length(o1) <= 500),
  o2 text not null default '' check (char_length(o2) <= 2000),
  submitted_at timestamptz not null default now()
);

-- ============================================================================
-- 7.5 certificates — 신규 발급(세션 신청 단위)
-- ============================================================================
create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  cert_no text not null unique,
  issuer text not null default '경상국립대학교 AI융합원장',
  issued_at timestamptz not null default now(),
  reissue_count int not null default 0,
  pdf_path text,
  issued_channel text not null default 'admin' check (issued_channel in ('admin', 'public')),
  updated_at timestamptz not null default now()
);

create trigger trg_certificates_updated_at
before update on public.certificates
for each row execute function public.set_updated_at();

-- ============================================================================
-- 7.6 legacy_certificates — 레거시 발급대장 이관(제2026-001호~070호)
-- ============================================================================
create table public.legacy_certificates (
  seq int primary key,
  cert_no text not null unique,
  name text not null,
  affiliation text not null default '',
  course text not null default '',
  period text not null default '',
  issued_at timestamptz,                  -- 068·069·070번은 NULL
  issued_at_raw text not null default '',
  issued_channel text not null,           -- '본인 발급' / '관리자 발급' (원문)
  reissue_count int not null default 0,
  reissued_at timestamptz,
  reissue_raw text not null default '',
  issuer text not null default '경상국립대학교 AI융합원장',
  pdf_status text not null default '보관', -- 원문값. 신규 Storage에는 파일 없음 → 화면 '미보관(레거시)'
  source text not null default 'legacy_import_2026-10-12',
  imported_at timestamptz not null default now()
);

comment on table public.legacy_certificates is '수료증발급대장_2026-10-12.csv 이관분(읽기 전용). 신규 채번은 이 표의 최대 일련번호를 이어받는다';

-- ============================================================================
-- 7.8 certificate_templates · admin_users
-- ============================================================================
create table public.certificate_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique default 'default',
  template jsonb not null,
  updated_at timestamptz not null default now()
);

create trigger trg_certificate_templates_updated_at
before update on public.certificate_templates
for each row execute function public.set_updated_at();

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'admin' check (role in ('admin', 'superadmin')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 9.4 자동 안내 메일 — email_logs · email_templates · email_settings
-- ============================================================================
create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete set null,
  batch_key text not null,                 -- 통합 발송 묶음(1통 = 1 batch_key)
  type text not null check (type in ('M1', 'M2', 'M3', 'M4', 'M5', 'TEST', 'ALERT')),
  to_email text not null,
  subject text not null default '',
  status text not null default '대기' check (status in ('대기', '성공', '실패')),
  error_message text,
  retry_count int not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_logs_application_type_idx on public.email_logs (application_id, type);
create index email_logs_created_at_idx on public.email_logs (created_at desc);

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  type text not null unique check (type in ('M1', 'M2', 'M3', 'M4', 'M5')),
  subject text,            -- NULL이면 코드 기본 템플릿(src/lib/email/templates.ts) 사용
  body_html text,
  body_text text,
  variables text[] not null default '{}',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger trg_email_templates_updated_at
before update on public.email_templates
for each row execute function public.set_updated_at();

create table public.email_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  m1_send_time text not null default '18:00',
  m3_days_before int not null default 3 check (m3_days_before between 1 and 14),
  m5_send_time text not null default '09:00',
  m4_send_time text not null default '08:00',
  send_on_self_cancel boolean not null default false,
  daily_limit int not null default 450 check (daily_limit > 0),
  admin_alert_email text not null default 'eros4424@gmail.com',
  updated_at timestamptz not null default now()
);

create trigger trg_email_settings_updated_at
before update on public.email_settings
for each row execute function public.set_updated_at();

comment on table public.email_settings is '메일 발송 설정(단일행). 실제 발송 시각은 vercel.json crons가 결정하며 *_send_time은 안내 표기용';

-- ============================================================================
-- 권한 검사 함수
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ============================================================================
-- 신청 검증 트리거 (PRD §5.2, §8)
-- 검사 순서: ① 오픈 전(P0004) ② 마감(P0002) ③ 정원 초과(P0003) ④ 동일 세션 중복(P0005)
-- 관리자(is_admin) INSERT는 모든 검사를 생략한다(중복은 관리자 UI에서 confirm).
-- ============================================================================
create or replace function public.check_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_open_at timestamptz;
  v_deadline timestamptz;
  v_count int;
  v_phone_digits text;
begin
  perform pg_advisory_xact_lock(hashtext('workshop_capacity_' || new.workshop_id::text));

  select capacity, apply_open_at, deadline into v_capacity, v_open_at, v_deadline
  from public.workshops where id = new.workshop_id;

  if v_capacity is null then
    raise exception '존재하지 않는 세션입니다.' using errcode = 'P0001';
  end if;

  new.phone := public.format_phone(new.phone);

  if public.is_admin() then
    return new;
  end if;

  -- 공개 신청 경로: 관리자 등록 표기·상태를 위조할 수 없도록 강제
  new.created_by_admin := false;
  new.status := '신청완료';
  new.cert_issued := false;
  new.notice1_confirmed := false;
  new.notice2_confirmed := false;
  new.notice3_confirmed := false;

  if now() < v_open_at then
    raise exception '아직 신청 기간이 아닙니다.' using errcode = 'P0004';
  end if;

  if now() > v_deadline then
    raise exception '신청 마감된 세션입니다.' using errcode = 'P0002';
  end if;

  select count(*) into v_count
  from public.applications
  where workshop_id = new.workshop_id
    and status in ('신청완료', '이수');

  if v_count >= v_capacity then
    raise exception '정원이 초과된 세션입니다.' using errcode = 'P0003';
  end if;

  v_phone_digits := regexp_replace(new.phone, '[^0-9]', '', 'g');

  if exists (
    select 1 from public.applications a
    where a.workshop_id = new.workshop_id
      and a.status in ('신청완료', '대기', '이수')
      and (
        a.phone_digits = v_phone_digits
        or lower(btrim(a.id_number)) = lower(btrim(new.id_number))
      )
  ) then
    raise exception '이미 해당 세션에 신청된 정보입니다. 신청내역조회에서 확인해 주세요.'
      using errcode = 'P0005';
  end if;

  return new;
end;
$$;

create trigger trg_check_application
before insert on public.applications
for each row execute function public.check_application();

-- ============================================================================
-- 공개 신청 RPC — 선택한 세션마다 applications 1행 INSERT (PRD §5.2, §7.3)
-- 세션별 서브 트랜잭션(savepoint)으로 처리해 일부 실패 시 성공 세션은 유지한다.
-- 반환: { batch_id, results: [{workshop_id, round, round_label, topic, ok, application_id?, code?, message?}] }
-- ============================================================================
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
-- ============================================================================
create or replace function public.get_workshop_availability()
returns table (workshop_id uuid, applied_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select workshop_id, count(*) as applied_count
  from public.applications
  where status in ('신청완료', '이수')
  group by workshop_id;
$$;

grant execute on function public.get_workshop_availability() to anon, authenticated;

-- ============================================================================
-- 수료증 발급/재발급 (PRD §8 발급번호 채번)
--  - 제YYYY-NNN호, 연도별 전역 순차. 레거시(legacy_certificates) ∪ 신규(certificates)의 최대 일련번호 + 1
--    → 레거시 70건 이관 직후 첫 신규 발급 = 제2026-071호
--  - 999 초과 시 자릿수 자동 확장(lpad 잘림 결함 수정)
--  - 재발급: 번호·발급일 유지, reissue_count + 1
-- ============================================================================
create or replace function public.issue_certificate(
  p_application_id uuid,
  p_channel text default 'admin'
) returns public.certificates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications%rowtype;
  v_existing public.certificates%rowtype;
  v_year text;
  v_pattern text;
  v_serial int;
  v_serial_text text;
  v_result public.certificates%rowtype;
begin
  if not (public.is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception '관리자만 수료증을 발급할 수 있습니다.' using errcode = '42501';
  end if;

  if p_channel not in ('admin', 'public') then
    raise exception '잘못된 발급 채널입니다.';
  end if;

  select * into v_app from public.applications where id = p_application_id;
  if v_app.id is null then
    raise exception '신청 건을 찾을 수 없습니다.';
  end if;

  if v_app.status <> '이수' then
    raise exception '이수 상태인 신청 건만 수료증을 발급할 수 있습니다.';
  end if;

  v_year := to_char(now() at time zone 'Asia/Seoul', 'YYYY');
  v_pattern := '^제' || v_year || '-(\d+)호$';

  perform pg_advisory_xact_lock(hashtext('cert_serial_' || v_year));

  select * into v_existing from public.certificates where application_id = p_application_id;

  if v_existing.id is not null then
    update public.certificates
      set reissue_count = reissue_count + 1
      where id = v_existing.id
      returning * into v_result;
    return v_result;
  end if;

  select coalesce(max(s), 0) + 1 into v_serial
  from (
    select (regexp_match(cert_no, v_pattern))[1]::int as s
      from public.certificates where cert_no ~ v_pattern
    union all
    select (regexp_match(cert_no, v_pattern))[1]::int as s
      from public.legacy_certificates where cert_no ~ v_pattern
  ) serials;

  v_serial_text := v_serial::text;

  insert into public.certificates (application_id, cert_no, issuer, issued_at, reissue_count, issued_channel)
  values (
    p_application_id,
    '제' || v_year || '-' || lpad(v_serial_text, greatest(3, length(v_serial_text)), '0') || '호',
    '경상국립대학교 AI융합원장',
    now(),
    0,
    p_channel
  )
  returning * into v_result;

  update public.applications set cert_issued = true where id = p_application_id;

  return v_result;
end;
$$;

revoke all on function public.issue_certificate(uuid, text) from public;
grant execute on function public.issue_certificate(uuid, text) to authenticated, service_role;

-- ============================================================================
-- 7.7 certificate_ledger — 레거시 ∪ 신규 단일 발급대장 (PRD §6.4)
-- security_invoker: 조회자의 RLS(is_admin)를 그대로 적용한다.
-- ============================================================================
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
    to_char(w.start_at at time zone 'Asia/Seoul', 'YYYY.MM.DD. HH24:MI') || ' ~ '
      || to_char(w.end_at at time zone 'Asia/Seoul', 'HH24:MI'),
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

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.workshop_days enable row level security;
alter table public.workshops enable row level security;
alter table public.applications enable row level security;
alter table public.survey_responses enable row level security;
alter table public.certificates enable row level security;
alter table public.legacy_certificates enable row level security;
alter table public.certificate_templates enable row level security;
alter table public.admin_users enable row level security;
alter table public.email_logs enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_settings enable row level security;

-- workshop_days / workshops: 공개 조회, 수정은 관리자
create policy "workshop_days_select_public" on public.workshop_days for select using (true);
create policy "workshop_days_update_admin" on public.workshop_days
  for update using (public.is_admin()) with check (public.is_admin());

create policy "workshops_select_public" on public.workshops for select using (true);
create policy "workshops_update_admin" on public.workshops
  for update using (public.is_admin()) with check (public.is_admin());

-- zoom_link·prelearning_url은 공개 역할에 SELECT 권한을 주지 않는다(포털 비노출, PRD §5.1).
-- 관리자 화면은 서버 API(/api/admin/sessions, service role)로 조회·수정한다.
revoke select on public.workshops from anon, authenticated;
grant select (
  id, day_id, round, round_label, topic, contents, start_at, end_at, order_in_day,
  capacity, deadline, apply_open_at, notes, created_at
) on public.workshops to anon, authenticated;

-- applications: 공개 신청은 apply_sessions RPC(security definer)로만. 직접 INSERT는 관리자 대리등록만.
create policy "applications_insert_admin" on public.applications
  for insert with check (public.is_admin());
create policy "applications_select_admin" on public.applications
  for select using (public.is_admin());
create policy "applications_update_admin" on public.applications
  for update using (public.is_admin()) with check (public.is_admin());
create policy "applications_delete_admin" on public.applications
  for delete using (public.is_admin());

-- survey_responses: 공개 제출(INSERT)만, 조회·삭제는 관리자
create policy "survey_insert_public" on public.survey_responses for insert with check (true);
create policy "survey_select_admin" on public.survey_responses for select using (public.is_admin());
create policy "survey_delete_admin" on public.survey_responses for delete using (public.is_admin());

-- certificates: 관리자만(공개 발급은 서버 API의 service role이 본인확인 후 처리)
create policy "certificates_select_admin" on public.certificates for select using (public.is_admin());
create policy "certificates_update_admin" on public.certificates
  for update using (public.is_admin()) with check (public.is_admin());

-- legacy_certificates: 관리자 조회 전용(읽기 전용)
create policy "legacy_certificates_select_admin" on public.legacy_certificates
  for select using (public.is_admin());

create policy "certificate_templates_admin_all" on public.certificate_templates
  for all using (public.is_admin()) with check (public.is_admin());

-- admin_users: 본인 행만 조회(로그인 후 allowlist 확인), 쓰기는 SQL로만 관리
create policy "admin_users_select_self" on public.admin_users
  for select using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy "email_logs_admin_all" on public.email_logs
  for all using (public.is_admin()) with check (public.is_admin());
create policy "email_templates_admin_all" on public.email_templates
  for all using (public.is_admin()) with check (public.is_admin());
create policy "email_settings_admin_all" on public.email_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Storage: 수료증 PDF(비공개 버킷, signed URL 600초로만 접근)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', false)
on conflict (id) do nothing;

create policy "certificates_storage_admin_all" on storage.objects
  for all using (bucket_id = 'certificates' and public.is_admin())
  with check (bucket_id = 'certificates' and public.is_admin());

commit;

-- ── 결과 확인 ──────────────────────────────────────────────────────────────
select count(*) as 생성된_테이블수_기대값_11
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';
