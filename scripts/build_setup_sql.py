# supabase/migrations/*.sql → supabase/setup/step1~4_*.sql (Supabase SQL Editor 실행용 4개 파일) 생성
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
]

for i, step in enumerate(STEPS, start=1):
    body = (src_dir / step["src"]).read_text(encoding="utf-8").rstrip()
    lines = [
        "-- ============================================================================",
        f"-- [{i}/4단계] {step['title']}",
        f"-- 원본: supabase/migrations/{step['src']} (자동 생성: scripts/build_setup_sql.py — 직접 수정 금지)",
        "-- 실행: Supabase 대시보드 > SQL Editor > New query > 이 파일 전체 붙여넣기 > Run",
        "-- 순서: step1 → step2 → step3 → step4 (반드시 번호 순서, 각 파일 1회만)"
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
