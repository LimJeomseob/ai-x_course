# supabase/migrations/*.sql → supabase/setup/step1~N_*.sql (Supabase SQL Editor 실행용 단계별 파일) 생성
#   사용법: python3 scripts/build_setup_sql.py   (또는 npm run build:setup-sql)
# 각 단계 파일은 트랜잭션으로 감싸 오류 시 그 단계만 전부 롤백되고, 끝에 결과 확인 쿼리가 붙는다.
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
src_dir = root / "supabase" / "migrations"
out_dir = root / "supabase" / "setup"
out_dir.mkdir(exist_ok=True)

STEPS = [
    {
        "src": "0001_init.sql",
        "out": "step1_schema.sql",
        "title": "스키마 생성(테이블·트리거·RPC·RLS·Storage 버킷)",
        "check": [
            "select count(*) as 생성된_테이블수_기대값_11",
            "from information_schema.tables",
            "where table_schema = 'public' and table_type = 'BASE TABLE';",
        ],
    },
    {
        "src": "0002_seed.sql",
        "out": "step2_seed.sql",
        "title": "기본 데이터(운영일 4·세션 7·관리자·메일 설정/템플릿)",
        "check": [
            "select",
            "  (select count(*) from public.workshop_days) as 운영일_기대값_4,",
            "  (select count(*) from public.workshops) as 세션_기대값_7,",
            "  (select string_agg(email, ', ') from public.admin_users) as 관리자,",
            "  (select count(*) from public.email_templates) as 메일템플릿_기대값_5;",
        ],
    },
    {
        "src": "0003_legacy_certificates.sql",
        "out": "step3_legacy_certificates.sql",
        "title": "레거시 수료증 발급대장 70건 이관(제2026-001호~070호)",
        "check": [
            "select count(*) as 레거시_기대값_70,",
            "  max((regexp_match(cert_no, '-(\\d+)호$'))[1]::int) as 최대번호_기대값_70",
            "from public.legacy_certificates;",
        ],
    },
    {
        "src": "0004_certificate_template.sql",
        "out": "step4_certificate_template.sql",
        "title": "수료증 서식(GNU 테두리·직인 이미지 포함)",
        "check": [
            "select count(*) as 서식_기대값_1,",
            "  jsonb_array_length(template -> 'images') as 이미지_기대값_2",
            "from public.certificate_templates where name = 'default'",
            "group by template;",
        ],
    },
    {
        "src": "0005_session3_time_change.sql",
        "out": "step5_session3_time_change.sql",
        "title": "3차(11/11) 운영시간 변경 13:30~15:30 → 15:30~17:30",
        "check": [
            "select round_label,",
            "  to_char(start_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI') as 시작_기대값_11_11_15_30,",
            "  to_char(end_at at time zone 'Asia/Seoul', 'HH24:MI') as 종료_기대값_17_30",
            "from public.workshops where round = 3;",
        ],
    },
    {
        "src": "0006_i18n_security.sql",
        "out": "step6_i18n_security.sql",
        "title": "한·영 이중언어 컬럼 + 요청 횟수 제한·취소 확인 코드 (※ 새 코드 배포 전에 실행)",
        "check": [
            "select",
            "  (select count(*) from public.workshops where topic_en is not null) as 영문주제_기대값_7,",
            "  (select count(*) from public.workshop_days where day_label_en is not null) as 영문운영일_기대값_4,",
            "  (select count(*) from information_schema.columns",
            "    where table_schema = 'public' and table_name = 'applications' and column_name = 'locale') as 신청언어컬럼_기대값_1,",
            "  (select count(*) from information_schema.tables",
            "    where table_schema = 'public' and table_name in ('rate_limits', 'cancel_codes')) as 보안테이블_기대값_2;",
        ],
    },
    {
        "src": "0007_lockdown_public_writes.sql",
        "out": "step7_lockdown_public_writes.sql",
        "title": "공개 역할의 직접 신청·설문 쓰기 차단 (※ 반드시 새 코드 배포 후에 실행)",
        "check": [
            "select",
            "  has_function_privilege('anon', 'public.apply_sessions(jsonb, uuid[])', 'execute') as anon_신청RPC_기대값_false,",
            "  has_function_privilege('service_role', 'public.apply_sessions(jsonb, uuid[])', 'execute') as 서버_신청RPC_기대값_true,",
            "  (select count(*) from pg_policies",
            "    where schemaname = 'public' and policyname = 'survey_insert_public') as 설문_공개정책_기대값_0;",
        ],
    },
]

for i, step in enumerate(STEPS, start=1):
    body = (src_dir / step["src"]).read_text(encoding="utf-8").rstrip()
    lines = [
        "-- ============================================================================",
        f"-- [{i}/{len(STEPS)}단계] {step['title']}",
        f"-- 원본: supabase/migrations/{step['src']} (자동 생성: scripts/build_setup_sql.py — 직접 수정 금지)",
        "-- 실행: Supabase 대시보드 > SQL Editor > New query > 이 파일 전체 붙여넣기 > Run",
        "-- 순서: " + " → ".join(f"step{n}" for n in range(1, len(STEPS) + 1)) + " (반드시 번호 순서, 각 파일 1회만)"
        + (f" · 실행 전 step{i - 1} 완료 필요" if i > 1 else ""),
        "-- 오류 시 이 단계만 전부 롤백되므로 원인 수정 후 같은 파일을 다시 실행하면 된다.",
        "-- ============================================================================",
        "",
        "begin;",
        "",
        body,
        "",
        "commit;",
        "",
        "-- ── 결과 확인 ──────────────────────────────────────────────────────────────",
        *step["check"],
        "",
    ]
    path = out_dir / step["out"]
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"{path.relative_to(root)}: {path.stat().st_size:,} bytes")
