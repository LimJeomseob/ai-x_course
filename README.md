# AI-X 워크숍 신청·관리 시스템

경상국립대학교 글로컬대학30 「AI-X 교과목 개발·인증을 위한 AI 활용 역량 강화 워크숍」 신청·관리 포털.
요구사항: [`PRD.md`](./PRD.md) · 참조 시스템: `limjeomseob/GLOCAL_AI`

## 기능

| 구분 | 경로 | 내용 |
| --- | --- | --- |
| 공개 | `/` | 소개 · 운영개요 · 수료 혜택 · 운영일 카드 4개(세션 7개, 세션별 정원·잔여) · 강사 프로필 모달 |
| 공개 | `/apply` | 세션 단위 신청, 운영일별 복수 선택 1회 제출(`?round=N`, `?day=A`) |
| 공개 | `/lookup` | 성명+연락처 본인확인 · 세션 단위 취소(신청 이메일로 받은 확인 코드 입력) · 수료증 다운로드 |
| 공개 | `/survey` | 만족도조사(문항 v0.9) |
| 공개 | `/certificate` | 이수 세션별 수료증 PDF 본인 발급(서버 생성·보관) |
| 공개 | `/en`, `/en/apply` 등 | 위 공개 5탭의 영문 화면(헤더의 `English`/`한국어` 버튼으로 전환) |
| 관리자 | `/admin/applicants` | 필터·검색·상태변경(M2 즉시 발송)·이수처리·수료증 발급·안내확인·수동 발송·CSV·대리등록·출석부 업로드 |
| 관리자 | `/admin/survey` | 문항 평균·분포·세션/운영일별 응답 수·CSV |
| 관리자 | `/admin/certificates` | 레거시(001~070호) + 신규 단일 발급대장·CSV |
| 관리자 | `/admin/emails` | 발송 이력·템플릿 편집/미리보기·설정·테스트 발송 |
| 관리자 | `/admin/sessions` | 3차 Zoom 링크·5차 사전학습 URL·협조사항(한/영) 편집 |

## 구조

```
supabase/migrations/   0001 스키마·트리거·RPC·RLS / 0002 시드 / 0003 레거시 대장 70건 / 0004 수료증 서식
                       0005 3차 시간 변경 / 0006 이중언어·횟수 제한·취소 코드 / 0007 공개 쓰기 차단
seed/legacy_certificates.csv          레거시 발급대장 원본(UTF-8 BOM)
supabase/setup/step1~7_*.sql          SQL Editor 실행용 단계 파일(migrations 0001~0007과 동일 내용)
scripts/generate_legacy_seed.py       CSV → 0003 마이그레이션 생성(npm run seed:legacy)
scripts/build_setup_sql.py            migrations → setup/step1~7 생성(npm run build:setup-sql)
scripts/build_og_image.py             public/brand/gnu-logo.png → 링크 미리보기(public/og-image.png)·파비콘(src/app/icon.png 등) 생성(npm run build:og)
src/app/(ko)/(portal)/*               공개 포털 5탭(한국어, <html lang="ko">)
src/app/(ko)/admin/*                  관리자 포털(한국어 전용)
src/app/(en)/en/*                     공개 포털 5탭(영어, <html lang="en">)
src/app/api/*                         Route Handler(신청·설문·본인확인·취소·공개 발급·관리자 API·Cron)
src/components/views/*                한/영 페이지가 함께 쓰는 화면 본문
src/lib/i18n/*                        언어 설정·화면 문구 사전(dict)·고정 콘텐츠 번역(content)
src/lib/rateLimit.ts                  공개 API 요청 횟수 제한(DB 카운터)
src/lib/email/*                       Gmail 발송·템플릿·M1~M5 발송 서비스
```

## 주요 규칙(PRD §8)

- 신청 오픈 2026-10-21 09:00 KST, 마감 = 운영일 전날 23:59:59 KST
- DB 트리거 검사 순서: 오픈 전(P0004) → 마감(P0002) → 정원(P0003) → 동일 세션 중복(P0005, 연락처 또는 식별번호)
- 관리자 대리등록은 검사 생략(중복은 화면 confirm)
- 발급번호 `제YYYY-NNN호` — 레거시 ∪ 신규 최대값 + 1 → 첫 신규 발급 `제2026-071호`, 999 초과 시 자릿수 확장
- `zoom_link`·`prelearning_url`은 공개 역할에 컬럼 SELECT 권한 없음(메일로만 발송)
- 협조사항 = 운영일 공통(`workshop_days.notes`) + 세션 추가(`workshops.notes`)

## 한·영 이중언어

- 한국어는 기존 주소, 영어는 `/en` 접두 주소. 미들웨어 없이 `app/(en)/en/*` 실제 경로로 구현했다.
- 화면 문구는 `src/lib/i18n/dict.ts`, 프로그램 소개·설문 문항·강사 프로필 번역은 `src/lib/i18n/content.ts`에 있다.
- 세션 주제·내용·장소·협조사항은 DB의 `*_en` 컬럼(0006)을 쓰고, 비어 있으면 한국어 값을 표시한다.
- DB 저장값(상태 `신청완료/대기/취소/이수`, 수준, 설문 선택지)은 한국어 그대로이며 화면 표시만 번역한다.
- 신청 화면 언어는 `applications.locale`에 저장되고 안내 메일(M1~M5) 언어를 결정한다.
  관리자 화면의 템플릿 수정은 한국어 메일에만 적용되며, 영문 메일은 코드 기본 템플릿(`DEFAULT_TEMPLATES_EN`)을 쓴다.
- 수료증은 한국어 공식 서식만 발급한다. 연락처는 국내 휴대폰 형식만 허용한다.
- 영문 고유명사(기관·강사·장소명)와 개인정보 동의문 영문본은 초안이므로 대학 공식 표기·담당 부서 검수가 필요하다.

## 보안

- 의존성: Next.js 15.5.29 · React 19 · nodemailer 10 · zod 4. `npm audit --omit=dev` 0건 기준으로 관리한다.
- Next.js 기능 제한: 미들웨어·rewrites/redirects·Server Actions·`next/image`를 쓰지 않는다
  (`images.unoptimized`로 `/_next/image` 비활성화). 새 기능도 Route Handler로 구현한다.
- 보안 헤더(`next.config.mjs`): CSP(외부 스크립트·프레임 차단), HSTS, `X-Frame-Options: DENY` 등. 폰트는 자체 호스팅.
- 공개 쓰기(신청·설문)는 서버 API(`/api/apply`, `/api/survey`)만 받는다. 브라우저의 DB 직접 호출은 0007에서 차단.
- 요청 횟수 제한: 공개 API 5종에 IP·식별자 기준 한도(`rate_limits`, `check_rate_limit`). 초과 시 429.
- 신청 취소: 성명+연락처 확인 후 신청 이메일로 보낸 6자리 코드(10분 유효, 5회 오입력 시 재발급)를 입력해야 취소된다.
  메일 발송 환경변수가 없으면 본인 취소가 불가하다(관리자가 대신 취소).
- 수료증 PDF는 서버가 생성해 Storage에 보관한다(발급자가 보관본을 바꿀 수 없음).
- 공개 API·Cron 오류 응답은 고정 문구만 반환하고 상세는 서버 로그에 남긴다. Cron 인증은 상수 시간 비교.

## 자동 메일(PRD §9)

| Cron(UTC) | KST | 경로 | 내용 |
| --- | --- | --- | --- |
| `0 9 * * *` | 18:00 | `/api/cron/m1` | M1 신청 결과(이메일 기준 1통 통합) |
| `0 0 * * *` | 09:00 | `/api/cron/daily` | M3 D-3(미발송 시 D-2까지) + M5 D-1(Zoom 미입력 시 보류·관리자 알림) |
| `0 23 * * *` | 08:00 | `/api/cron/m4` | M4 당일 최종 안내 |

M2(상태 변경)는 관리자 상태변경 API 성공 직후 발송. `email_logs` 기준 멱등, 즉시 1회 재시도 + 다음 주기 재시도(최대 3회),
성공 시 `notice1~3_confirmed` 자동 갱신(M1→1차, M3→2차, M4→3차). 일 발송 한도(`daily_limit`) 초과분은 다음 주기로 이월.

## 배포 절차

1. Supabase 신규 프로젝트 생성 → SQL Editor에서 `supabase/setup/`의 파일을 **번호 순서대로 1회씩** 실행
   | 순서 | 파일 | 확인 쿼리 기대값 |
   | --- | --- | --- |
   | 1 | `step1_schema.sql` | 테이블 11 |
   | 2 | `step2_seed.sql` | 운영일 4 · 세션 7 · 관리자 eros4424@gmail.com · 메일템플릿 5 |
   | 3 | `step3_legacy_certificates.sql` | 레거시 70 · 최대번호 70 |
   | 4 | `step4_certificate_template.sql` | 서식 1 · 이미지 2 |
   | 5 | `step5_session3_time_change.sql` | 3차 11/11 15:30~17:30 |
   | 6 | `step6_i18n_security.sql` | 영문주제 7 · 영문운영일 4 · 신청언어컬럼 1 · 보안테이블 2 |
   | 7 | `step7_lockdown_public_writes.sql` | anon 신청RPC false · 서버 true · 설문 공개정책 0 |

   **운영 중인 시스템에 이중언어·보안 버전을 반영하는 순서**: ① `step6` 실행 → ② 새 코드 배포 → ③ `step7` 실행.
   `step6`은 추가 변경만 담아 구버전 화면이 계속 동작하고, `step7`은 구버전의 신청·설문 경로를 막으므로 반드시 배포 뒤에 실행한다.

   각 파일은 트랜잭션이라 오류 시 해당 단계만 롤백된다. CLI 사용 시에는 `supabase db push`(`supabase/migrations/` 적용).
   migrations 수정 후에는 `npm run build:setup-sql`로 단계 파일을 재생성한다.
2. Supabase Auth → Google Provider 활성화, Site URL·Redirect URLs에 Vercel 도메인(`https://<project>.vercel.app/admin/login`) 등록
3. Vercel에 `LimJeomseob/ai-x_course` Git 연동 → 환경변수 등록(`.env.example` 참고)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`, `GMAIL_USER` + (`GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`/`GMAIL_REFRESH_TOKEN` 또는 `GMAIL_APP_PASSWORD`), `CRON_SECRET`
4. 배포 후 `/admin/emails` → 테스트 발송으로 Gmail 연동 확인, `/admin/sessions`에서 3차 Zoom 링크·5차 사전학습 URL 입력

## 로컬 개발

```bash
npm install
cp .env.example .env.local   # 값 입력
npm run dev
npm run typecheck && npm run lint
```
