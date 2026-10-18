# 레거시 수료증 발급대장(seed/legacy_certificates.csv, UTF-8 BOM) → legacy_certificates INSERT 마이그레이션 생성
#   사용법: python3 scripts/generate_legacy_seed.py seed/legacy_certificates.csv supabase/migrations/0003_legacy_certificates.sql
# 파싱 규칙(PRD §7.6, §13-B):
#   - issued_at_raw "2026. 07. 23. 11:12" → KST timestamptz, "2026. 10. 13." → 해당일 00:00 KST, 공란 → NULL
#   - reissue_raw "3회 (2026. 07. 31. 22:19)" → reissue_count=3, reissued_at, "0회" → 0 / NULL
#   - 원문(course_raw·period_raw·issued_at_raw·reissue_raw)은 그대로 보존
import csv
import re
import sys

src, dst = sys.argv[1], sys.argv[2]

DATETIME_RE = re.compile(r"(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{1,2}):(\d{2}))?")
REISSUE_RE = re.compile(r"^(\d+)회(?:\s*\((.+)\))?$")


def to_ts(raw: str):
    raw = (raw or "").strip()
    if not raw:
        return None
    m = DATETIME_RE.search(raw)
    if not m:
        raise ValueError(f"날짜 형식 오류: {raw!r}")
    y, mo, d, hh, mm = m.groups()
    return f"{y}-{int(mo):02d}-{int(d):02d}T{int(hh or 0):02d}:{int(mm or 0):02d}:00+09:00"


def q(value):
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


rows = []
serials = []
with open(src, encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        m = REISSUE_RE.match(r["reissue_raw"].strip())
        if not m:
            raise ValueError(f"재발급 형식 오류: {r['reissue_raw']!r}")
        reissue_count = int(m.group(1))
        serials.append(int(re.search(r"-(\d+)호$", r["cert_no"].strip()).group(1)))
        reissued_at = to_ts(m.group(2)) if m.group(2) else None
        rows.append(
            "  ({seq}, {cert_no}, {name}, {aff}, {course}, {period}, {issued_at}, {issued_raw}, "
            "{channel}, {rc}, {reissued_at}, {reissue_raw}, {issuer}, {pdf}, {source})".format(
                seq=int(r["seq"]),
                cert_no=q(r["cert_no"].strip()),
                name=q(r["name"].strip()),
                aff=q(r["affiliation"].strip()),
                course=q(r["course_raw"].strip()),
                period=q(r["period_raw"].strip()),
                issued_at=q(to_ts(r["issued_at_raw"])) + ("::timestamptz" if r["issued_at_raw"].strip() else ""),
                issued_raw=q(r["issued_at_raw"].strip()),
                channel=q(r["issued_channel"].strip()),
                rc=reissue_count,
                reissued_at=q(reissued_at) + ("::timestamptz" if reissued_at else ""),
                reissue_raw=q(r["reissue_raw"].strip()),
                issuer=q(r["issuer"].strip()),
                pdf=q(r["pdf_status"].strip()),
                source=q(r["source"].strip()),
            )
        )

assert sorted(serials) == list(range(1, len(rows) + 1)), "발급번호가 001부터 연속이 아닙니다"

with open(dst, "w", encoding="utf-8") as out:
    out.write("-- ============================================================================\n")
    out.write("-- 레거시 수료증 발급대장 이관 (제2026-001호 ~ 제2026-%03d호, %d건)\n" % (len(rows), len(rows)))
    out.write("-- 자동 생성: scripts/generate_legacy_seed.py ← seed/legacy_certificates.csv (직접 수정 금지)\n")
    out.write("-- 검증(PRD §10): count = %d, max serial = %d → 첫 신규 발급 = 제2026-%03d호\n"
              % (len(rows), len(rows), len(rows) + 1))
    out.write("-- ============================================================================\n\n")
    out.write("insert into public.legacy_certificates\n")
    out.write("  (seq, cert_no, name, affiliation, course, period, issued_at, issued_at_raw,\n")
    out.write("   issued_channel, reissue_count, reissued_at, reissue_raw, issuer, pdf_status, source)\nvalues\n")
    out.write(",\n".join(rows))
    out.write("\non conflict (seq) do nothing;\n")

print(f"{src} -> {dst}: {len(rows)} rows")
