-- ============================================================================
-- AI-X 워크숍 신청·관리 시스템 — Supabase 초기 설정 단일 실행 파일
-- 자동 생성: scripts/build_setup_sql.py (직접 수정 금지 — migrations/를 고친 뒤 재생성)
-- 포함: 0001_init.sql, 0002_seed.sql, 0003_legacy_certificates.sql, 0004_certificate_template.sql
-- 실행: Supabase 대시보드 > SQL Editor > New query > 전체 붙여넣기 > Run
-- 주의: 빈 프로젝트에 1회만 실행. 오류 시 전체 롤백되므로 원인 수정 후 다시 실행하면 된다.
-- ============================================================================

begin;

-- ############################################################################
-- 0001_init.sql
-- ############################################################################
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

-- ############################################################################
-- 0002_seed.sql
-- ############################################################################
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
values ('eros4424@gmail.com', 'superadmin')
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

-- ############################################################################
-- 0003_legacy_certificates.sql
-- ############################################################################
-- ============================================================================
-- 레거시 수료증 발급대장 이관 (제2026-001호 ~ 제2026-070호, 70건)
-- 자동 생성: scripts/generate_legacy_seed.py ← seed/legacy_certificates.csv (직접 수정 금지)
-- 검증(PRD §10): count = 70, max serial = 70 → 첫 신규 발급 = 제2026-071호
-- ============================================================================

insert into public.legacy_certificates
  (seq, cert_no, name, affiliation, course, period, issued_at, issued_at_raw,
   issued_channel, reissue_count, reissued_at, reissue_raw, issuer, pdf_status, source)
values
  (1, '제2026-001호', '엄태우', '교육사 정통학교', '7월 1차 · 제미나이 워크플로우 자동화 · Google Workspace 실습', '2026.07.22. 13:30 ~ 17:30', '2026-07-23T11:12:00+09:00'::timestamptz, '2026. 07. 23. 11:12', '본인 발급', 3, '2026-07-31T22:19:00+09:00'::timestamptz, '3회 (2026. 07. 31. 22:19)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (2, '제2026-002호', '최수연', '경상국립대학교 창업중심대학사업단', '7월 1차 · 제미나이 워크플로우 자동화 · Google Workspace 실습', '2026.07.22. 13:30 ~ 17:30', '2026-07-23T11:47:00+09:00'::timestamptz, '2026. 07. 23. 11:47', '본인 발급', 1, '2026-07-23T17:08:00+09:00'::timestamptz, '1회 (2026. 07. 23. 17:08)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (3, '제2026-003호', '오남경', '공군 교육사령부', '7월 1차 · 제미나이 워크플로우 자동화 · Google Workspace 실습', '2026.07.22. 13:30 ~ 17:30', '2026-07-23T17:09:00+09:00'::timestamptz, '2026. 07. 23. 17:09', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (4, '제2026-004호', '류훈', '공군항공과학고등학교', '7월 2차 · 바이브코딩 이해 · 자연어 업무 자동화 스크립트', '2026.07.24. 13:30 ~ 17:00', '2026-07-25T12:33:00+09:00'::timestamptz, '2026. 07. 25. 12:33', '본인 발급', 2, '2026-07-29T16:06:00+09:00'::timestamptz, '2회 (2026. 07. 29. 16:06)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (5, '제2026-005호', '임선택', '경상국립대학교 공동실험실습관', '7월 1차 · 제미나이 워크플로우 자동화 · Google Workspace 실습', '2026.07.22. 13:30 ~ 17:30', '2026-07-27T09:43:00+09:00'::timestamptz, '2026. 07. 27. 09:43', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (6, '제2026-006호', '권혜근', '공동실험실습관', '7월 1차 · 제미나이 워크플로우 자동화 · Google Workspace 실습', '2026.07.22. 13:30 ~ 17:30', '2026-07-27T09:44:00+09:00'::timestamptz, '2026. 07. 27. 09:44', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (7, '제2026-007호', '손성문', '경상국립대학교 경영대학 국제통상학과', '7월 2차 · 바이브코딩 이해 · 자연어 업무 자동화 스크립트', '2026.07.24. 13:30 ~ 17:00', '2026-07-29T16:35:00+09:00'::timestamptz, '2026. 07. 29. 16:35', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (8, '제2026-008호', '김경수', '공군교육사령부 방공포병학교  작전교육대대', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T17:35:00+09:00'::timestamptz, '2026. 07. 29. 17:35', '본인 발급', 3, '2026-07-29T17:39:00+09:00'::timestamptz, '3회 (2026. 07. 29. 17:39)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (9, '제2026-009호', '최성호', '공군 방공포병학교 작전교육대대 장거리유도무기고관실', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T17:35:00+09:00'::timestamptz, '2026. 07. 29. 17:35', '본인 발급', 2, '2026-07-29T18:58:00+09:00'::timestamptz, '2회 (2026. 07. 29. 18:58)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (10, '제2026-010호', '최주현', '방공포병학교 작전교육대대 전술학교관실', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T17:47:00+09:00'::timestamptz, '2026. 07. 29. 17:47', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (11, '제2026-011호', '신진호', '교육사령부 방공포병학교 중거리교관실', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T18:03:00+09:00'::timestamptz, '2026. 07. 29. 18:03', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (12, '제2026-012호', '이도근', '방공포병학교 중거리교관실', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T18:49:00+09:00'::timestamptz, '2026. 07. 29. 18:49', '본인 발급', 13, '2026-07-30T17:55:00+09:00'::timestamptz, '13회 (2026. 07. 30. 17:55)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (13, '제2026-013호', '전민규', '경상국립대 전자공학부', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T18:50:00+09:00'::timestamptz, '2026. 07. 29. 18:50', '본인 발급', 2, '2026-07-29T18:51:00+09:00'::timestamptz, '2회 (2026. 07. 29. 18:51)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (14, '제2026-014호', '손정우', '경상국립대  물리교육과', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T19:00:00+09:00'::timestamptz, '2026. 07. 29. 19:00', '본인 발급', 2, '2026-07-30T11:12:00+09:00'::timestamptz, '2회 (2026. 07. 30. 11:12)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (15, '제2026-015호', '이정문', '공군 교육사령부 방공포병학교 작전교육대대 작전교육대 장거리유도무기교관실', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T19:03:00+09:00'::timestamptz, '2026. 07. 29. 19:03', '본인 발급', 2, '2026-07-30T07:50:00+09:00'::timestamptz, '2회 (2026. 07. 30. 07:50)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (16, '제2026-016호', '정우진', '경상국립대학교 교육혁신처', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T19:07:00+09:00'::timestamptz, '2026. 07. 29. 19:07', '본인 발급', 1, '2026-07-30T09:52:00+09:00'::timestamptz, '1회 (2026. 07. 30. 09:52)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (17, '제2026-017호', '정진환', '공군교육사령부', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T19:12:00+09:00'::timestamptz, '2026. 07. 29. 19:12', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (18, '제2026-018호', '이은주', '경상국립대학교 인권센터', '7월 2차 · 바이브코딩 이해 · 자연어 업무 자동화 스크립트', '2026.07.24. 13:30 ~ 17:00', '2026-07-29T21:06:00+09:00'::timestamptz, '2026. 07. 29. 21:06', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (19, '제2026-019호', '정만직', '방공포병학교 중거리교관실', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T21:12:00+09:00'::timestamptz, '2026. 07. 29. 21:12', '본인 발급', 2, '2026-07-29T21:17:00+09:00'::timestamptz, '2회 (2026. 07. 29. 21:17)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (20, '제2026-020호', '심규하', '공군교육사령부 행정학교 재정교육실', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-29T21:23:00+09:00'::timestamptz, '2026. 07. 29. 21:23', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (21, '제2026-021호', '정미리', '경상국립대학교 기업가정신센터', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-30T08:48:00+09:00'::timestamptz, '2026. 07. 30. 08:48', '본인 발급', 1, '2026-07-31T22:59:00+09:00'::timestamptz, '1회 (2026. 07. 31. 22:59)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (22, '제2026-022호', '이상진', '진주교육사령부 방공포병학교 작전교육대대 작전교육대 중거리교관실', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-30T09:00:00+09:00'::timestamptz, '2026. 07. 30. 09:00', '본인 발급', 8, '2026-07-30T10:52:00+09:00'::timestamptz, '8회 (2026. 07. 30. 10:52)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (23, '제2026-023호', '전욱희', '공군 교육사령부 방공포병학교', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-30T09:15:00+09:00'::timestamptz, '2026. 07. 30. 09:15', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (24, '제2026-024호', '홍진주', '경상국립대학교 도서관', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-30T09:16:00+09:00'::timestamptz, '2026. 07. 30. 09:16', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (25, '제2026-025호', '곽나희', '경상국립대학교 대학일자리플러스센터', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-30T09:19:00+09:00'::timestamptz, '2026. 07. 30. 09:19', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (26, '제2026-026호', '김정조', '경상국립대학교 학생상담센터', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-30T11:01:00+09:00'::timestamptz, '2026. 07. 30. 11:01', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (27, '제2026-027호', '김혜정', '경상국립대학교 도서관', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-07-30T13:15:00+09:00'::timestamptz, '2026. 07. 30. 13:15', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (28, '제2026-028호', '문종일', '경상국립대학교 항공우주공학과', '7월 2차 · 바이브코딩 이해 · 자연어 업무 자동화 스크립트', '2026.07.24. 13:30 ~ 17:00', '2026-07-31T13:08:00+09:00'::timestamptz, '2026. 07. 31. 13:08', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (29, '제2026-029호', '정진수', '공군 교육사 항공과학고', '7월 2차 · 바이브코딩 이해 · 자연어 업무 자동화 스크립트', '2026.07.24. 13:30 ~ 17:00', '2026-07-31T14:59:00+09:00'::timestamptz, '2026. 07. 31. 14:59', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (30, '제2026-030호', '변윤희', '경상국립대학교 GADIST', '7월 4차 · Claude 데스크탑 파일 자동화 · 한글(hwp) 문서 자동 작성', '2026.07.31. 13:00 ~ 17:00', '2026-07-31T18:24:00+09:00'::timestamptz, '2026. 07. 31. 18:24', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (31, '제2026-031호', '홍진주', '경상국립대학교 도서관', '7월 4차 · Claude 데스크탑 파일 자동화 · 한글(hwp) 문서 자동 작성', '2026.07.31. 13:00 ~ 17:00', '2026-07-31T18:25:00+09:00'::timestamptz, '2026. 07. 31. 18:25', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (32, '제2026-032호', '강경화', '경상국립대, 문화콘텐츠학', '7월 1차 · 제미나이 워크플로우 자동화 · Google Workspace 실습', '2026.07.22. 13:30 ~ 17:30', '2026-07-31T18:31:00+09:00'::timestamptz, '2026. 07. 31. 18:31', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (33, '제2026-033호', '한철우', '경상국립대학교 도서관', '7월 4차 · Claude 데스크탑 파일 자동화 · 한글(hwp) 문서 자동 작성', '2026.07.31. 13:00 ~ 17:00', '2026-07-31T18:40:00+09:00'::timestamptz, '2026. 07. 31. 18:40', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (34, '제2026-034호', '엄태우', '교육사 정통학교', '7월 4차 · Claude 데스크탑 파일 자동화 · 한글(hwp) 문서 자동 작성', '2026.07.31. 13:00 ~ 17:00', '2026-07-31T22:19:00+09:00'::timestamptz, '2026. 07. 31. 22:19', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (35, '제2026-035호', '피용진', '경상대학교 교육대학원 컴퓨터교육', '7월 1차 · 제미나이 워크플로우 자동화 · Google Workspace 실습', '2026.07.22. 13:30 ~ 17:30', '2026-08-02T11:45:00+09:00'::timestamptz, '2026. 08. 02. 11:45', '본인 발급', 5, '2026-08-03T10:23:00+09:00'::timestamptz, '5회 (2026. 08. 03. 10:23)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (36, '제2026-036호', '피용진', '경상대학교 교육대학원 컴퓨터교육', '7월 2차 · 바이브코딩 이해 · 자연어 업무 자동화 스크립트', '2026.07.24. 13:30 ~ 17:00', '2026-08-02T11:48:00+09:00'::timestamptz, '2026. 08. 02. 11:48', '본인 발급', 2, '2026-08-03T10:23:00+09:00'::timestamptz, '2회 (2026. 08. 03. 10:23)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (37, '제2026-037호', '피용진', '경상국립대학교 교육대학원 컴퓨터교육전공', '7월 4차 · Claude 데스크탑 파일 자동화 · 한글(hwp) 문서 자동 작성', '2026.07.31. 13:00 ~ 17:00', '2026-08-02T11:49:00+09:00'::timestamptz, '2026. 08. 02. 11:49', '본인 발급', 2, '2026-08-03T10:23:00+09:00'::timestamptz, '2회 (2026. 08. 03. 10:23)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (38, '제2026-038호', '오남경', '공군 교육사령부', '7월 4차 · Claude 데스크탑 파일 자동화 · 한글(hwp) 문서 자동 작성', '2026.07.31. 13:00 ~ 17:00', '2026-08-03T08:22:00+09:00'::timestamptz, '2026. 08. 03. 08:22', '본인 발급', 6, '2026-08-04T13:18:00+09:00'::timestamptz, '6회 (2026. 08. 04. 13:18)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (39, '제2026-039호', '권혁진', '경제학부', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-08-04T11:17:00+09:00'::timestamptz, '2026. 08. 04. 11:17', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (40, '제2026-040호', '조유정', '경상국립대학교 창업중심대학사업단', '7월 4차 · Claude 데스크탑 파일 자동화 · 한글(hwp) 문서 자동 작성', '2026.07.31. 13:00 ~ 17:00', '2026-08-07T10:15:00+09:00'::timestamptz, '2026. 08. 07. 10:15', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (41, '제2026-041호', '박상혁', '공군교육사', '7월 4차 · Claude 데스크탑 파일 자동화 · 한글(hwp) 문서 자동 작성', '2026.07.31. 13:00 ~ 17:00', '2026-08-09T09:18:00+09:00'::timestamptz, '2026. 08. 09. 09:18', '관리자 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (42, '제2026-042호', '박상혁', '공군교육사', '7월 5차 · 데이터 분석·보고서 자동화 · MCP 기반 도구 연동', '2026.08.07. 13:00 ~ 17:00', '2026-08-09T09:19:00+09:00'::timestamptz, '2026. 08. 09. 09:19', '관리자 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (43, '제2026-043호', '이진태', '한국저작권위원회', '7월 5차 · 데이터 분석·보고서 자동화 · MCP 기반 도구 연동', '2026.08.07. 13:00 ~ 17:00', '2026-08-09T10:10:00+09:00'::timestamptz, '2026. 08. 09. 10:10', '본인 발급', 2, '2026-08-12T13:29:00+09:00'::timestamptz, '2회 (2026. 08. 12. 13:29)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (44, '제2026-044호', '박은미', '경상국립대학교 AI융합원', '7월 5차 · 데이터 분석·보고서 자동화 · MCP 기반 도구 연동', '2026.08.07. 13:00 ~ 17:00', '2026-08-09T10:11:00+09:00'::timestamptz, '2026. 08. 09. 10:11', '본인 발급', 2, '2026-08-10T10:49:00+09:00'::timestamptz, '2회 (2026. 08. 10. 10:49)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (45, '제2026-045호', '박환수', '공군교육사령부', '7월 2차 · 바이브코딩 이해 · 자연어 업무 자동화 스크립트', '2026.07.24. 13:30 ~ 17:00', '2026-08-09T10:38:00+09:00'::timestamptz, '2026. 08. 09. 10:38', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (46, '제2026-046호', '박환수', '공군교육사령부', '7월 5차 · 데이터 분석·보고서 자동화 · MCP 기반 도구 연동', '2026.08.07. 13:00 ~ 17:00', '2026-08-09T10:38:00+09:00'::timestamptz, '2026. 08. 09. 10:38', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (47, '제2026-047호', '손정우', '경상국립대학교 물리교육과', '7월 5차 · 데이터 분석·보고서 자동화 · MCP 기반 도구 연동', '2026.08.07. 13:00 ~ 17:00', '2026-08-10T10:11:00+09:00'::timestamptz, '2026. 08. 10. 10:11', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (48, '제2026-048호', '손유경', '경상국립대학교 중어중문학과', '8월 1차 · 바이브코딩 이해 · AI 활용 업무 자동화', '2026.08.10. 13:00 ~ 17:00', '2026-08-10T17:58:00+09:00'::timestamptz, '2026. 08. 10. 17:58', '본인 발급', 1, '2026-08-15T23:09:00+09:00'::timestamptz, '1회 (2026. 08. 15. 23:09)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (49, '제2026-049호', '김동훈', '한국세라믹기술원', '8월 1차 · 바이브코딩 이해 · AI 활용 업무 자동화', '2026.08.10. 13:00 ~ 17:00', '2026-08-10T18:00:00+09:00'::timestamptz, '2026. 08. 10. 18:00', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (50, '제2026-050호', '김창열', '한국세라믹기술원', '8월 1차 · 바이브코딩 이해 · AI 활용 업무 자동화', '2026.08.10. 13:00 ~ 17:00', '2026-08-10T18:19:00+09:00'::timestamptz, '2026. 08. 10. 18:19', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (51, '제2026-051호', '김윤진', '경상국립대학교 경제학과', '8월 1차 · 바이브코딩 이해 · AI 활용 업무 자동화', '2026.08.10. 13:00 ~ 17:00', '2026-08-10T20:52:00+09:00'::timestamptz, '2026. 08. 10. 20:52', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (52, '제2026-052호', '권영복', '경상국립대학교 산학협력단', '7월 3차 · 한국어에 효과적인 프롬프트 작성법(온라인)', '2026.07.29. 14:00 ~ 16:00', '2026-08-11T13:51:00+09:00'::timestamptz, '2026. 08. 11. 13:51', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (53, '제2026-053호', '권영복', '경상국립대학교 산학협력단', '7월 5차 · 데이터 분석·보고서 자동화 · MCP 기반 도구 연동', '2026.08.07. 13:00 ~ 17:00', '2026-08-11T13:51:00+09:00'::timestamptz, '2026. 08. 11. 13:51', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (54, '제2026-054호', '김현숙', '한국세라믹기술원 수석행정원', '8월 1차 · 바이브코딩 이해 · AI 활용 업무 자동화', '2026.08.10. 13:00 ~ 17:00', '2026-08-11T15:09:00+09:00'::timestamptz, '2026. 08. 11. 15:09', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (55, '제2026-055호', '황태성', '경상국립대학교 통영캠퍼스 해양과학대학 해양과학도서관', '7월 5차 · 데이터 분석·보고서 자동화 · MCP 기반 도구 연동', '2026.08.07. 13:00 ~ 17:00', '2026-08-13T14:59:00+09:00'::timestamptz, '2026. 08. 13. 14:59', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (56, '제2026-056호', '황태성', '경상국립대학교 통영캠퍼스 해양과학대학 해양과학도서관', '8월 1차 · 바이브코딩 이해 · AI 활용 업무 자동화', '2026.08.10. 13:00 ~ 17:00', '2026-08-13T14:59:00+09:00'::timestamptz, '2026. 08. 13. 14:59', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (57, '제2026-057호', '박환수', '공군교육사령부 정보통신학교', '8월 3차 · Claude 데스크탑 파일 정리 자동화 · 스킬 활용 문서 자동 작성', '2026.08.14. 13:00 ~ 17:00', '2026-08-17T09:38:00+09:00'::timestamptz, '2026. 08. 17. 09:38', '본인 발급', 1, '2026-08-19T16:23:00+09:00'::timestamptz, '1회 (2026. 08. 19. 16:23)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (58, '제2026-058호', '박상혁', '공군교육사', '8월 3차 · Claude 데스크탑 파일 정리 자동화 · 스킬 활용 문서 자동 작성', '2026.08.14. 13:00 ~ 17:00', '2026-08-17T16:44:00+09:00'::timestamptz, '2026. 08. 17. 16:44', '본인 발급', 3, '2026-08-17T17:02:00+09:00'::timestamptz, '3회 (2026. 08. 17. 17:02)', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (59, '제2026-059호', '정온유', '한국세라믹기술원 예산정책실', '8월 3차 · Claude 데스크탑 파일 정리 자동화 · 스킬 활용 문서 자동 작성', '2026.08.14. 13:00 ~ 17:00', '2026-08-20T17:39:00+09:00'::timestamptz, '2026. 08. 20. 17:39', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (60, '제2026-060호', '이정근', '한국세라믹기술원', 'AI로 완성하는 대학 행정 보고서 작성, AI로 읽고 정리하는 업무자료:노트북LM 실무 활용,AI로 만드는 홍보 콘텐츠:영상 제작 및 편집', '2026. 09. 29. ~10. 6. 14:00~18:00', '2026-10-13T00:00:00+09:00'::timestamptz, '2026. 10. 13.', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (61, '제2026-061호', '김지은', '한국세라믹기술원', 'AI로 완성하는 대학 행정 보고서 작성, AI로 읽고 정리하는 업무자료:노트북LM 실무 활용,AI로 만드는 홍보 콘텐츠:영상 제작 및 편집, AI로 만드는 업무 보고 PPT 제작', '2026. 09. 29. 14:00~18:00', '2026-10-13T00:00:00+09:00'::timestamptz, '2026. 10. 13.', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (62, '제2026-062호', '안차근', '한국세라믹기술원', 'AI로 완성하는 대학 행정 보고서 작성, AI로 읽고 정리하는 업무자료:노트북LM 실무 활용,AI로 만드는 홍보 콘텐츠:영상 제작 및 편집, AI로 만드는 업무 보고 PPT 제작', '2026. 09. 29. 14:00~18:00', '2026-10-13T00:00:00+09:00'::timestamptz, '2026. 10. 13.', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (63, '제2026-063호', '심소의', '한국세라믹기술원', 'AI로 완성하는 대학 행정 보고서 작성, AI로 읽고 정리하는 업무자료:노트북LM 실무 활용,AI로 만드는 홍보 콘텐츠:영상 제작 및 편집, AI로 만드는 업무 보고 PPT 제작', '2026. 09. 29. 14:00~18:00', '2026-10-13T00:00:00+09:00'::timestamptz, '2026. 10. 13.', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (64, '제2026-064호', '이욱희', '한국세라믹기술원', 'AI로 완성하는 대학 행정 보고서 작성, AI로 읽고 정리하는 업무자료:노트북LM 실무 활용', '2026. 09. 29. 14:00~18:00', '2026-10-13T00:00:00+09:00'::timestamptz, '2026. 10. 13.', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (65, '제2026-065호', '송창곡', '한국세라믹기술원', 'AI로 완성하는 대학 행정 보고서 작성', '2026. 09. 29. 14:00~18:00', '2026-10-13T00:00:00+09:00'::timestamptz, '2026. 10. 13.', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (66, '제2026-066호', '김경환', '한국세라믹기술원', 'AI로 완성하는 대학 행정 보고서 작성', '2026. 09. 29. 14:00~18:00', '2026-10-13T00:00:00+09:00'::timestamptz, '2026. 10. 13.', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (67, '제2026-067호', '이창래', '한국세라믹기술원', 'AI로 읽고 정리하는 업무자료:노트북LM 실무 활용', '2026. 09. 29. 14:00~18:00', '2026-10-13T00:00:00+09:00'::timestamptz, '2026. 10. 13.', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (68, '제2026-068호', '최성필', '한국세라믹기술원', 'AI로 읽고 정리하는 업무자료:노트북LM 실무 활용', '2026. 09. 29. 14:00~18:00', null, '', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (69, '제2026-069호', '임정현', '한국세라믹기술원', 'AI로 만드는 업무 보고 PPT 제작', '2026. 09. 29. 14:00~18:00', null, '', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12'),
  (70, '제2026-070호', '안주영', '한국세라믹기술원', 'AI로 만드는 업무 보고 PPT 제작', '2026. 09. 29. 14:00~18:00', null, '', '본인 발급', 0, null, '0회', '경상국립대학교 AI융합원장', '보관', 'legacy_import_2026-10-12')
on conflict (seq) do nothing;

-- ############################################################################
-- 0004_certificate_template.sql
-- ############################################################################
-- ============================================================================
-- 수료증 서식(JSON) 시드 — 참조 시스템(GLOCAL_AI 0006)의 GNU 테두리 프레임·직인 이미지(base64)와
-- 문구·좌표를 그대로 재사용한다. 변경점(PRD §7.8):
--   - 프로그램명(progV): 세션명이 길어 wrap(최대 3줄, 자동 축소 하한 10pt) 적용
--   - flowGroup 'rows': 프로그램명이 여러 줄이 되면 아래 '기간' 행을 줄 수만큼 내려 겹침을 방지
-- 렌더러: src/lib/certificatePdf.ts
-- ============================================================================
insert into public.certificate_templates (name, template)
values ('default', $tpl${"version":1,"page":{"width":595.28,"height":841.89},"images":[{"key":"frame","dataUrl":"data:image/jpeg;base64,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jRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTejRy262hzTegNTUNFSNHLbraHNN6NHLbraHNN6A1NQ0VI0ctutoc03o0ctutoc03oDU1DRUjRy262hzTenzRy2a2hzR9AamoaKkqQE6x//9kN","x":28.305,"y":34.043,"w":538.271,"h":778.668},{"key":"seal","dataUrl":"data:image/jpeg;base64,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","x":418.215,"y":133.414,"w":95.948,"h":95.895}],"texts":[{"key":"certNo","text":"{발급번호}","x":80.7,"y":744.5,"size":15,"weight":"regular","align":"left"},{"key":"title","text":"수  료  증","y":649.7,"size":50,"weight":"bold","align":"center"},{"key":"nameL1","text":"성","x":83.6,"y":565.4,"size":16,"weight":"regular","align":"left"},{"key":"nameL2","text":"명","x":147.5,"y":565.4,"size":16,"weight":"regular","align":"left"},{"key":"nameC","text":":","x":163.5,"y":565.4,"size":16,"weight":"regular","align":"left"},{"key":"nameV","text":"{성명}","x":179.5,"y":565.4,"size":16,"weight":"regular","align":"left"},{"key":"affL1","text":"소","x":83.6,"y":539.9,"size":16,"weight":"regular","align":"left"},{"key":"affL2","text":"속","x":147.5,"y":539.9,"size":16,"weight":"regular","align":"left"},{"key":"affC","text":":","x":163.5,"y":539.9,"size":16,"weight":"regular","align":"left"},{"key":"affV","text":"{소속}","x":179.5,"y":539.9,"size":16,"weight":"regular","align":"left","maxWidth":330},{"key":"progL","text":"프로그램명","x":83.6,"y":514.3,"size":16,"weight":"regular","align":"left"},{"key":"progC","text":":","x":163.5,"y":514.3,"size":16,"weight":"regular","align":"left"},{"key":"progV","text":"{프로그램명}","x":179.5,"y":514.3,"size":16,"weight":"regular","align":"left","maxWidth":330,"wrap":{"maxLines":3,"minSize":10,"lineHeight":1.25},"flowGroup":"rows"},{"key":"periodL1","text":"기","x":83.6,"y":488.7,"size":16,"weight":"regular","align":"left","flowGroup":"rows"},{"key":"periodL2","text":"간","x":147.5,"y":488.7,"size":16,"weight":"regular","align":"left","flowGroup":"rows"},{"key":"periodC","text":":","x":163.5,"y":488.7,"size":16,"weight":"regular","align":"left","flowGroup":"rows"},{"key":"periodV","text":"{기간}","x":179.5,"y":488.7,"size":16,"weight":"regular","align":"left","maxWidth":330,"flowGroup":"rows"},{"key":"body1","text":"위 사람은 본 기관의 상기 교육과정을","y":402.8,"size":21,"weight":"regular","align":"center"},{"key":"body2","text":"수료하였으므로 이 증서를 수여 합니다.","y":365,"size":21,"weight":"regular","align":"center"},{"key":"issueDate","text":"{발급일}","y":274.1,"size":20,"weight":"regular","align":"center"},{"key":"issuer","text":"경상국립대학교 AI융합원장","y":170.6,"size":29,"weight":"bold","align":"center"}]}$tpl$::jsonb)
on conflict (name) do update set template = excluded.template;

commit;

-- ============================================================================
-- 실행 결과 확인 — 기대값: 운영일 4 / 세션 7 / 레거시 70 / 레거시 최대번호 70 / 서식 1 / 메일템플릿 5 / 관리자 eros4424@gmail.com
-- ============================================================================
select
  (select count(*) from public.workshop_days) as 운영일,
  (select count(*) from public.workshops) as 세션,
  (select count(*) from public.legacy_certificates) as 레거시,
  (select max((regexp_match(cert_no, '-(\d+)호$'))[1]::int) from public.legacy_certificates) as 레거시_최대번호,
  (select count(*) from public.certificate_templates) as 서식,
  (select count(*) from public.email_templates) as 메일템플릿,
  (select string_agg(email, ', ') from public.admin_users) as 관리자;
