-- ============================================================================
-- 세션별 대기자 접수(기본 5명) + 결원 시 자동 승급 (PRD §5.2, §5.3, §8, §9.2)
--  1. workshops.waitlist_capacity 컬럼 추가(대면 5 / 온라인 0) + 공개 SELECT 컬럼 grant 재지정
--  2. check_application 트리거: 검사 순서를 오픈 전 → 마감 → 동일 세션 중복 → 정원으로 바꾸고,
--     정원 초과 시 대기 한도 내면 status='대기'로 접수, 한도까지 찼으면 P0003 거부
--  3. apply_sessions RPC: 결과에 status('신청완료'|'대기') 포함
--  4. get_workshop_availability: waiting_count(대기 건수) 컬럼 추가
--  5. promote_waitlist(workshop_id): 결원 수만큼 접수 순서(created_at)대로 대기 → 신청완료 전환
--     (서버 API가 취소·상태변경 직후 호출, M2 메일은 서버에서 발송)
-- ============================================================================

-- 1. 대기 한도 컬럼 ------------------------------------------------------------
alter table public.workshops
  add column if not exists waitlist_capacity int not null default 5
  check (waitlist_capacity >= 0);

comment on column public.workshops.waitlist_capacity is
  '정원 초과 시 추가로 접수하는 대기자 한도(대면 5 / 온라인 0). 결원 시 접수 순서대로 자동 승급';

update public.workshops set waitlist_capacity = 0 where capacity >= 9999;

revoke select on public.workshops from anon, authenticated;
grant select (
  id, day_id, round, round_label, topic, contents, start_at, end_at, order_in_day,
  capacity, waitlist_capacity, deadline, apply_open_at, notes, created_at
) on public.workshops to anon, authenticated;

-- 2. 신청 검증 트리거 재정의 ------------------------------------------------------
-- 검사 순서: ① 오픈 전(P0004) ② 마감(P0002) ③ 동일 세션 중복(P0005) ④ 정원(초과 시 대기 접수, 대기도 만석이면 P0003)
-- 중복 검사를 정원 검사보다 앞에 두어 중복 신청자가 대기 자리를 차지하지 않게 한다.
-- 관리자(is_admin) INSERT는 모든 검사를 생략한다(중복은 관리자 UI에서 confirm).
create or replace function public.check_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_waitlist int;
  v_open_at timestamptz;
  v_deadline timestamptz;
  v_count int;
  v_waiting int;
  v_phone_digits text;
begin
  perform pg_advisory_xact_lock(hashtext('workshop_capacity_' || new.workshop_id::text));

  select capacity, waitlist_capacity, apply_open_at, deadline
    into v_capacity, v_waitlist, v_open_at, v_deadline
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

  select count(*) into v_count
  from public.applications
  where workshop_id = new.workshop_id
    and status in ('신청완료', '이수');

  if v_count >= v_capacity then
    select count(*) into v_waiting
    from public.applications
    where workshop_id = new.workshop_id
      and status = '대기';

    if v_waiting >= v_waitlist then
      raise exception '정원과 대기 인원이 모두 마감된 세션입니다.' using errcode = 'P0003';
    end if;

    new.status := '대기';
  end if;

  return new;
end;
$$;

-- 3. 공개 신청 RPC 재정의(결과에 status 포함) -----------------------------------------
-- 반환: { batch_id, results: [{workshop_id, round, round_label, topic, ok, application_id?, status?, code?, message?}] }
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
  v_status text;
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
      returning id, status into v_app_id, v_status;

      v_results := v_results || jsonb_build_object(
        'workshop_id', v_row.id, 'round', v_row.round, 'round_label', v_row.round_label,
        'topic', v_row.topic, 'ok', true, 'application_id', v_app_id, 'status', v_status);
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

-- 4. 공개 정원현황(유효 건수 + 대기 건수) ----------------------------------------------
-- RETURNS TABLE 모양이 바뀌므로 create or replace가 불가 → drop 후 재생성
drop function if exists public.get_workshop_availability();

create function public.get_workshop_availability()
returns table (workshop_id uuid, applied_count bigint, waiting_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select workshop_id,
         count(*) filter (where status in ('신청완료', '이수')) as applied_count,
         count(*) filter (where status = '대기') as waiting_count
  from public.applications
  where status in ('신청완료', '이수', '대기')
  group by workshop_id;
$$;

grant execute on function public.get_workshop_availability() to anon, authenticated;

-- 5. 대기자 자동 승급 ----------------------------------------------------------------
-- 결원 수(capacity - 유효 건수)만큼 접수 순서(created_at, id)대로 '대기' → '신청완료'.
-- 트리거와 같은 advisory lock으로 직렬화해 동시 신청과 경합하지 않는다.
-- 서버 API(service role) 전용: 본인 취소·관리자 상태변경 직후 호출하고 M2 메일은 서버에서 보낸다.
create or replace function public.promote_waitlist(p_workshop_id uuid)
returns table (application_id uuid, from_status text, to_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_count int;
  v_free int;
begin
  perform pg_advisory_xact_lock(hashtext('workshop_capacity_' || p_workshop_id::text));

  select capacity into v_capacity from public.workshops where id = p_workshop_id;
  if v_capacity is null then
    return;
  end if;

  select count(*) into v_count
  from public.applications
  where workshop_id = p_workshop_id
    and status in ('신청완료', '이수');

  v_free := v_capacity - v_count;
  if v_free <= 0 then
    return;
  end if;

  return query
    update public.applications a
       set status = '신청완료'
     where a.id in (
       select w.id
       from public.applications w
       where w.workshop_id = p_workshop_id
         and w.status = '대기'
       order by w.created_at, w.id
       limit v_free
     )
    returning a.id, '대기'::text, '신청완료'::text;
end;
$$;

revoke all on function public.promote_waitlist(uuid) from public;
grant execute on function public.promote_waitlist(uuid) to service_role;
