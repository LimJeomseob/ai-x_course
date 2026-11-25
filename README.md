# AI-X 워크숍 신청·관리 시스템

경상국립대학교 글로컬대학30 「AI-X 교과목 개발·인증을 위한 AI 활용 역량 강화 워크숍」 신청·관리 포털.
요구사항: [`PRD.md`](./PRD.md) · 참조 시스템: `limjeomseob/GLOCAL_AI`

## 기능

| 구분 | 경로 | 내용 |
| --- | --- | --- |
| 공개 | `/` | 소개 · 운영개요 · 수료 혜택 · 운영일 카드 4개(세션 7개, 세션별 정원·잔여) · 강사 프로필 모달 |
| 공개 | `/apply` | 세션 단위 신청, 운영일별 복수 선택 1회 제출(`?round=N`, `?day=A`) |
| 공개 | `/lookup` | 성명+연락처 본인확인 · 세션 단위 취소 · 수료증 다운로드 |
| 공개 | `/video` | 동영상 강의 — 성명+연락처 확인 → 4개 차시 YouTube 시청(차시별 실제 시청 90% 이상 이수) → 전 차시 이수 시 신청 상태 '이수' |
| 공개 | `/survey` | 만족도조사(문항 v0.9) |
| 공개 | `/certificate` | 이수 세션별 수료증 PDF 본인 발급 |
| 관리자 | `/admin/applicants` | 필터·검색·상태변경(M2 즉시 발송)·이수처리·수료증 발급·안내확인·수동 발송·CSV·대리등록·출석부 업로드 |
| 관리자 | `/admin/survey` | 문항 평균·분포·세션/운영일별 응답 수·CSV |
| 관리자 | `/admin/certificates` | 레거시(001~070호) + 신규 단일 발급대장·CSV |
| 관리자 | `/admin/emails` | 발송 이력·템플릿 편집/미리보기·설정·테스트 발송 |
| 관리자 | `/admin/sessions` | 3차 Zoom 링크·5차 사전학습 URL·협조사항 편집 |

## 구조

```
supabase/migrations/   0001 스키마·트리거·RPC·RLS / 0002 시드 / 0003 레거시 대장 70건 / 0004 수료증 서식
seed/legacy_certificates.csv          레거시 발급대장 원본(UTF-8 BOM)
supabase/setup/step1~4_*.sql          SQL Editor 실행용 4단계 파일(migrations 0001~0004와 동일 내용)
scripts/generate_legacy_seed.py       CSV → 0003 마이그레이션 생성(npm run seed:legacy)
scripts/build_setup_sql.py            migrations → setup/step1~4 생성(npm run build:setup-sql)
scripts/build_og_image.py             public/brand/gnu-logo.png → 링크 미리보기(public/og-image.png)·파비콘(src/app/icon.png 등) 생성(npm run build:og)
src/app/(portal)/*                    공개 포털 5탭
src/app/admin/*                       관리자 포털
src/app/api/*                         Route Handler(본인확인·취소·공개 발급·관리자 API·Cron)
src/lib/email/*                       Gmail 발송·템플릿·M1~M5 발송 서비스
```

## 주요 규칙(PRD §8)

- 신청 오픈 2026-10-21 09:00 KST, 마감 = 운영일 전날 23:59:59 KST
- DB 트리거 검사 순서: 오픈 전(P0004) → 마감(P0002) → 정원(P0003) → 동일 세션 중복(P0005, 연락처 또는 식별번호)
- 관리자 대리등록은 검사 생략(중복은 화면 confirm)
- 발급번호 `제YYYY-NNN호` — 레거시 ∪ 신규 최대값 + 1 → 첫 신규 발급 `제2026-071호`, 999 초과 시 자릿수 확장
- `zoom_link`·`prelearning_url`은 공개 역할에 컬럼 SELECT 권한 없음(메일로만 발송)
- 협조사항 = 운영일 공통(`workshop_days.notes`) + 세션 추가(`workshops.notes`)

## 동영상 강의(`/video`, migration 0006)

- 동영상 과정은 `workshops.delivery = 'video'`인 세션(8차 「동영상 강의」, Day E 상시)이다. 신청 → 이수 → 수료증 발급 → 발급대장은 기존 흐름을 그대로 쓴다.
- 영상은 **YouTube 임베드로만** 재생한다. mp4 원본은 저장소·Supabase에 올리지 않는다(`/동영상 강의/`는 `.gitignore`).
- 차시(`video_lessons`)마다 실제 시청 구간 ≥ `pass_ratio`(기본 0.9)면 차시 이수. 판정값 = min(본 구간 합, 실제 재생 누적) ÷ 영상 길이.
  건너뛴 구간·일시정지·다른 탭 시간은 제외, 배속 재생은 1배속으로 되돌린다. 서버는 재생 누적을 "처음 재생 시각부터의 경과 시간 + 15초"로 상한을 둔다.
- 전 차시 이수 시 `video_finalize_course()`가 `applications.status`를 '신청완료' → '이수'로 바꾼다. 수료증 '기간' 란은 과정 이수일(`video_course_completed_at()`).
- 차시가 끝나도 다음 차시는 자동재생하지 않는다. 안내 화면(다음 강의 제목·길이·`intro_text`)에서 「다음 강의로 이동」을 눌러야 넘어가며, 누른 시각은 `video_progress.next_confirmed_at`에 남는다.
- 자동 안내 메일(M1·M3·M5·M4)은 동영상 세션을 제외한다. 동영상 세션은 이수 전이면 언제든 본인 취소할 수 있다.
- API: `POST /api/video/session`(진입) · `/api/video/heartbeat`(재생 시작·30초·일시정지·화면 이탈 시 기록) · `/api/video/complete`(차시 판정) · `/api/video/next`(다음 강의 이동 기록)

### 동영상 강의 영상 ID 등록

YouTube에 **일부 공개 + 퍼가기 허용**으로 올린 뒤, 주소의 `v=` 뒤 11자를 SQL Editor에서 등록한다. 등록 전 차시는 화면에 "준비 중"으로 표시된다.

```sql
update public.video_lessons l set youtube_id = v.yt
from (values (1, 'XXXXXXXXXXX'), (2, 'XXXXXXXXXXX'), (3, 'XXXXXXXXXXX'), (4, 'XXXXXXXXXXX')) as v(no, yt),
     public.workshops w
where w.delivery = 'video' and l.workshop_id = w.id and l.lesson_no = v.no;
```

수강 기간(기본 2026-11-25 ~ 12-31) 변경: `update public.workshops set end_at = …, deadline = … where delivery = 'video';`

## 자동 메일(PRD §9)

| Cron(UTC) | KST | 경로 | 내용 |
| --- | --- | --- | --- |
| `0 9 * * *` | 18:00 | `/api/cron/m1` | M1 신청 결과(이메일 기준 1통 통합) |
| `0 0 * * *` | 09:00 | `/api/cron/daily` | M3 D-3(미발송 시 D-2까지) + M5 D-1(Zoom 미입력 시 보류·관리자 알림) |
| `0 23 * * *` | 08:00 | `/api/cron/m4` | M4 당일 최종 안내 |

M2(상태 변경)는 관리자 상태변경 API 성공 직후 발송. `email_logs` 기준 멱등, 즉시 1회 재시도 + 다음 주기 재시도(최대 3회),
성공 시 `notice1~3_confirmed` 자동 갱신(M1→1차, M3→2차, M4→3차). 일 발송 한도(`daily_limit`) 초과분은 다음 주기로 이월.

## 배포 절차

1. Supabase 신규 프로젝트 생성 → SQL Editor에서 `supabase/setup/`의 8개 파일을 **번호 순서대로 1회씩** 실행
   | 순서 | 파일 | 확인 쿼리 기대값 |
   | --- | --- | --- |
   | 1 | `step1_schema.sql` | 테이블 11 |
   | 2 | `step2_seed.sql` | 운영일 4 · 세션 7 · 관리자 eros4424@gmail.com · 메일템플릿 5 |
   | 3 | `step3_legacy_certificates.sql` | 레거시 70 · 최대번호 70 |
   | 4 | `step4_certificate_template.sql` | 서식 1 · 이미지 2 |
   | 5 | `step5_session3_time_change.sql` | 3차 11/11 15:30~17:30 |
   | 6 | `step6_video_lms.sql` | 동영상 세션 1 · 차시 4 |
   | 7 | `step7_video_topic_chatgpt.sql` | 동영상 주제 ChatGPT 스킬·MCP 활용 |
   | 8 | `step8_video_youtube_ids.sql` | 차시 4편 모두 영상ID 등록 · 1차시 안내문 ChatGPT |

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
