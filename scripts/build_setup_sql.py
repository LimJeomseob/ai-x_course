# supabase/migrations/*.sql(번호 순) → supabase/setup_all.sql 단일 실행 파일 생성
#   사용법: python3 scripts/build_setup_sql.py   (또는 npm run build:setup-sql)
# Supabase SQL Editor에 한 번에 붙여넣어 실행하는 용도. 전체를 하나의 트랜잭션으로 감싸
# 중간에 오류가 나면 모두 롤백된다(빈 프로젝트에 1회만 실행).
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
migrations = sorted((root / "supabase" / "migrations").glob("*.sql"))
out = root / "supabase" / "setup_all.sql"

parts = [
    "-- ============================================================================",
    "-- AI-X 워크숍 신청·관리 시스템 — Supabase 초기 설정 단일 실행 파일",
    "-- 자동 생성: scripts/build_setup_sql.py (직접 수정 금지 — migrations/를 고친 뒤 재생성)",
    "-- 포함: " + ", ".join(m.name for m in migrations),
    "-- 실행: Supabase 대시보드 > SQL Editor > New query > 전체 붙여넣기 > Run",
    "-- 주의: 빈 프로젝트에 1회만 실행. 오류 시 전체 롤백되므로 원인 수정 후 다시 실행하면 된다.",
    "-- ============================================================================",
    "",
    "begin;",
    "",
]
for m in migrations:
    parts += [
        "-- ############################################################################",
        f"-- {m.name}",
        "-- ############################################################################",
        m.read_text(encoding="utf-8").rstrip(),
        "",
    ]
parts += [
    "commit;",
    "",
    "-- ============================================================================",
    "-- 실행 결과 확인 — 기대값: 운영일 4 / 세션 7 / 레거시 70 / 레거시 최대번호 70 / 서식 1 / 메일템플릿 5 / 관리자 eros4424@gmail.com",
    "-- ============================================================================",
    "select",
    "  (select count(*) from public.workshop_days) as 운영일,",
    "  (select count(*) from public.workshops) as 세션,",
    "  (select count(*) from public.legacy_certificates) as 레거시,",
    "  (select max((regexp_match(cert_no, '-(\\d+)호$'))[1]::int) from public.legacy_certificates) as 레거시_최대번호,",
    "  (select count(*) from public.certificate_templates) as 서식,",
    "  (select count(*) from public.email_templates) as 메일템플릿,",
    "  (select string_agg(email, ', ') from public.admin_users) as 관리자;",
    "",
]
out.write_text("\n".join(parts), encoding="utf-8")
print(f"{out.relative_to(root)}: {len(migrations)} files, {out.stat().st_size:,} bytes")
