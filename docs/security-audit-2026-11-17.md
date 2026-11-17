# 보안 점검 보고서 (기준일 2026-11-17)

대상: AI-X 워크숍 신청·관리 포털 (Next.js App Router · Supabase · Gmail SMTP · Vercel)

## 1. 요약

- 의존성 권고 14개 패키지(critical 1 · high 6 · moderate 7) 중 **11개 해소**. 남은 3개(zod, next 내장 postcss, 그리고 그 postcss 때문에 함께 표시되는 next)는 사유를 들어 보류(§5).
- 코드·설정 취약 지점 6건 개선(§3).
- 개선 전·후 동일 시나리오로 회귀 시험: 자동 메일 발송 47항목, 보안 개선 14항목, 화면·공개 API 비교 모두 통과(§4).
- **운영자가 직접 해야 하는 작업이 남아 있다**(§6): DB 보강 SQL 실행, 배포 후 실제 Gmail 테스트 발송, Vercel·Supabase 설정 확인.

## 2. 수집한 최근 보안 이슈

출처: npm 레지스트리 권고 DB(GitHub Advisory Database 연동, `npm audit`), 벤더 공지·웹 검색.

| 대상(점검 시점 버전) | 내용 | 이 시스템 해당 여부 | 조치 |
|---|---|---|---|
| next 14.2.35 | 14.x 지원 종료. 2026년 권고 24건(서버 컴포넌트 DoS, 캐시 혼동·오염, 이미지 최적화 RCE 등)의 패치가 15.5.x·16.x에만 제공됨 | 미들웨어·rewrites·서버 액션·`next/image` 미사용이고 Vercel에서 구동되어 실제 위험은 낮았으나 패치를 받을 수 없는 상태 | **15.5.29로 업그레이드** |
| nodemailer 6.10.1 | 주소 파서 오배송·DoS 다수, OAuth2 토큰 요청 시 TLS 인증서 미검증(GHSA-r7g4-qg5f-qqm2) 등 22건 | **해당** — 신청자가 입력한 이메일이 수신 주소로 쓰이고 OAuth2 인증을 지원 | **10.6.0으로 업그레이드** + 수신 주소 검증 |
| glob · minimatch · @typescript-eslint · postcss-selector-parser | CLI 명령 주입, DoS | 린트 도구 전용(배포 번들 미포함) | eslint-config-next 15.5.29 및 `npm audit fix`로 해소 |
| zod 3.25.76 | 대형 컬렉션 검증 시 메모리 고갈(GHSA-mrhx-c7xc-m3w5), 패치는 4.x에만 있음 | 낮음(§5) | 보류 |
| postcss 8.4.31 (next 내장) | 소스맵 경로 관련 파일 노출 등 | 낮음(§5) | 보류 |
| React2Shell (CVE-2025-55182 / CVE-2025-66478) | 서버 컴포넌트 원격 코드 실행 | Next 14.x는 대상 아님 | 없음 |
| npm 공급망 공격(2026년 5월 @tanstack·@antv, 8월 keyv 계열) | 악성 버전 유포 | 공개된 악성 버전 목록과 `package-lock.json` 대조 결과 해당 없음 | 없음 |
| Supabase | 클라이언트 라이브러리 권고 없음. anon/service_role 키가 publishable/secret 키 체계로 전환 예정. Security Advisor 0011(함수 search_path) | search_path 미고정 함수 2개 | DB 보강 SQL(§3-6), 키 전환은 §6 |
| Vercel 2026년 4월 보안 사고 | Sensitive로 표시하지 않은 환경변수가 노출됐을 수 있음 | 운영자 확인 필요 | §6 |

## 3. 적용한 개선

1. **의존성 업그레이드** — `next` 15.5.29, `react`/`react-dom` 19, `eslint-config-next` 15.5.29, `nodemailer` 10.6.0(타입 내장으로 `@types/nodemailer` 제거). 설정 키 `experimental.serverComponentsExternalPackages` → `serverExternalPackages`. 애플리케이션 코드 수정은 필요 없었다.
2. **보안 응답 헤더** (`next.config.mjs`) — HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, `X-Powered-By` 제거. CSP는 화면 동작과 무관한 지시어(`frame-ancestors`·`base-uri`·`form-action`·`object-src`)만 강제하고, 전체 정책은 `Content-Security-Policy-Report-Only`로 보낸다(차단 없음). `/api/*`는 `Cache-Control: no-store`, `/admin/*`은 검색 색인 제외.
3. **공개 본인확인 API 시도 제한** (`src/lib/rateLimit.ts`, 신청내역조회·취소·수료증 발급) — IP·API별로 본인확인 **실패**만 집계해 10분간 50회를 넘으면 429와 안내 문구를 돌려준다. 성공한 요청과 입력 형식 오류는 집계하지 않는다. 서버 인스턴스 메모리 기준의 최선 노력 방식이다.
4. **Cron 시크릿 상수시간 비교** (`src/lib/supabase/server.ts`).
5. **내부 오류 문구 비노출** — 수료증 발급 API의 DB 오류 원문, Cron 응답의 예외 문구를 고정 문구로 바꿨다(상세는 서버 로그에 그대로 남는다).
6. **수신 주소 검증** (`src/lib/email/mailer.ts`) — 쉼표·세미콜론·괄호·꺾쇠 등 주소 파서가 여러 수신자로 해석할 수 있는 문자가 있으면 발송하지 않고 발송 이력에 실패로 남긴다.
7. **DB 보강** (`supabase/migrations/0006_security_hardening.sql`, 실행용 `supabase/setup/step6_security_hardening.sql`) — `set_updated_at`·`format_phone` 함수의 search_path 고정, 수료증 버킷을 PDF·10MB 이하로 제한. 여러 번 실행해도 결과가 같다.

기존에 이미 갖춰져 있어 변경하지 않은 것: 전 테이블 RLS, service role 키 서버 전용, 입력 검증(zod), 메일 본문 HTML 이스케이프, CSV 수식 인젝션 방지, 관리자 API의 `is_admin()` 재검증, 로그인 후 이동 경로 제한, 비공개 버킷과 서명 URL.

## 4. 검증 결과

시험 환경: 로컬 PostgreSQL 16에 실제 마이그레이션(0001~0006)을 적용하고 PostgREST로 Supabase REST를 대신했다. 메일은 로컬 가짜 SMTP 서버로 받아 내용을 확인했다. 운영 코드는 수정하지 않고 nodemailer의 접속 대상만 시험용으로 바꿨다.

| 구분 | 변경 전(Next 14 · nodemailer 6) | 변경 후(Next 15 · nodemailer 10) |
|---|---|---|
| 자동 메일 발송 시나리오 47항목 | 47 통과 | 47 통과 |
| 화면 7개·공개 API 10종 응답 기록 | 기준선 | 기준선과 완전 일치, 브라우저 콘솔 오류 없음 |
| 보안 개선 14항목(시도 제한·헤더·주소 검증) | 해당 없음 | 14 통과 |
| 관리자 화면 5개(세션 주입)·브라우저 신청 제출 | 미실시 | 정상 |
| `typecheck` · `lint` · `build` | 통과 | 통과 |
| 0006 SQL | — | 2회 연속 실행 성공, 전화번호 정규화·`updated_at` 트리거 정상 |

### 자동 메일 발송 시험 항목 (실제 Cron 경로 `/api/cron/{m1,daily,m4}` 호출)

| 항목 | 확인 내용 | 결과 |
|---|---|---|
| Cron 인증 | 시크릿 없음·오답이면 401, 발송 없음 | 통과 |
| M1 신청 결과 안내 | 같은 이메일의 5개 세션을 1통으로 통합, 발신자명·회신 주소·변수 치환, 포털 링크, 이메일 없는 대리등록 건 제외, 발송 이력·`notice1_confirmed` 갱신 | 통과 |
| M3 운영 안내(D-3) | 대상 날짜 선정, 운영일 단위 통합, 사전학습 URL 반영, `notice2_confirmed` 갱신 | 통과 |
| M5 준비 안내(D-1) | Zoom 링크 미입력 시 발송 보류와 관리자 알림 1회, 링크 입력 후 발송 | 통과 |
| M4 당일 안내 | 당일 세션 통합 발송, `notice3_confirmed` 갱신 | 통과 |
| 멱등성 | M1·daily·M4 재실행 시 중복 발송 0건, 알림 재발송 없음 | 통과 |
| 실패 처리 | SMTP 오류 시 즉시 1회 재시도, 실패 이력 기록, 3회 누적 후 자동 대상 제외, 관리자 수동 재발송 | 통과 |
| 설정 | 발송 중지, 템플릿 비활성, 일 발송 한도 도달 시 이월·복구 후 발송 | 통과 |
| 템플릿 | 관리자 편집 제목·본문 적용, 성명의 HTML 태그 이스케이프 | 통과 |
| M2 상태 변경 안내 | 관리자 상태 변경 즉시 발송, `notify=false` 미발송, 본인 취소 시 설정에 따른 발송 | 통과 |
| 테스트 발송 | M1~M5 5종을 관리자 주소로 발송, TEST 이력 기록 | 통과 |

### 시험하지 못한 것

- **실제 Gmail 서버를 통한 발송.** 시험 환경에 Gmail 자격증명이 없다. nodemailer 10에서 `service: "gmail"`이 `smtp.gmail.com:465`(TLS)로, 인증 방식이 OAuth2/앱 비밀번호로 구성되는 것까지만 확인했다. OAuth2 토큰 발급과 Gmail 로그인은 배포 후 확인이 필요하다(§6-2).
- **Google 로그인(OAuth) 화면 전환과 Supabase Storage**(수료증 PDF 업로드·서명 URL). 관리자 화면은 로그인 세션을 주입해 확인했고, Storage를 쓰는 수료증 발급 완료 단계는 시험 환경에 Storage가 없어 실행하지 못했다. 해당 코드는 이번에 수정하지 않았다.
- Vercel 실제 배포 환경(Cron 스케줄 실행, 플랫폼 헤더).

## 5. 적용하지 않은 항목과 사유

| 항목 | 사유 |
|---|---|
| zod 4.x 전환 | 4.x는 오류 메시지 지정 방식 등이 달라 폼 검증 동작이 바뀔 위험이 있다. 취약점은 매우 큰 배열 검증에서 발생하는데, 서버에서 배열을 검증하는 API는 관리자 인증 뒤에만 있고 상한(300·500건)이 있다. |
| next 내장 postcss 8.4.31 | Next가 고정한 버전이라 임의 교체 시 빌드 위험이 있다. 빌드 시점에 저장소의 자체 CSS만 처리하므로 외부 입력이 닿지 않는다. |
| 전체 CSP 강제 | 정책 누락 시 화면이 깨질 수 있어 Report-Only로만 적용했다. 운영에서 브라우저 콘솔에 위반 보고가 없음을 확인한 뒤 `next.config.mjs`의 `reportOnlyCsp`를 강제 정책으로 옮기면 된다. |
| 신청 폼 자동 제출 방지(CAPTCHA) | 화면·신청 흐름이 바뀐다. 현재는 허위 정보로 대면 세션 정원(25명)을 채우는 것을 막는 장치가 없다. |
| 수료증 PDF 서버 생성 | 현재는 본인확인을 통과한 사용자의 브라우저가 만든 PDF를 보관함에 올린다. 보관본 내용을 서버가 보증하지 않는다. 구조 변경이 커서 보류했고, 버킷의 형식·용량 제한(§3-7)만 적용했다. |

## 6. 운영자 조치 사항

1. **DB 보강 SQL 실행** — Supabase 대시보드 → SQL Editor에서 `supabase/setup/step6_security_hardening.sql` 전체를 1회 실행한다. 결과가 `고정함수 2`, `{application/pdf} / 10485760`이면 정상이다. 실행 전에도 포털은 그대로 동작한다.
2. **배포 후 실제 발송 확인** — 관리자 포털 [메일 발송 관리] → 테스트 발송으로 Gmail 수신을 확인한다. 실패하면 발송 이력의 오류 메시지를 확인한다. nodemailer 9부터 TLS 인증서를 항상 검증한다.
3. **Vercel** — `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_*`, `CRON_SECRET`이 Sensitive로 등록돼 있는지 확인한다. 2026년 4월 이전부터 Sensitive가 아니었다면 값을 교체한다(Supabase 키 재발급, Gmail 앱 비밀번호·OAuth 토큰 재발급, 새 `CRON_SECRET` 후 재배포). 계정 2단계 인증을 켠다.
4. **Supabase** — Authentication → Providers에서 사용하지 않는 Email 가입을 끄거나 "Confirm email"이 켜져 있는지 확인한다(관리자 판정이 로그인 이메일 기준이다). Advisors → Security Advisor를 실행해 경고를 확인한다. publishable/secret 키 전환 일정이 공지되면 환경변수 값을 교체한다(코드 변경 불필요).
5. **속도 제한 보강** — 시도 제한은 인스턴스 메모리 기준이다. 더 엄격하게 하려면 Vercel Firewall에서 `/api/lookup`, `/api/cancel-application`, `/api/issue-certificate`에 속도 제한 규칙을 추가한다.
6. **외부 사이트 삽입** — 다른 사이트에서 이 포털을 iframe으로 넣어 쓰고 있다면 `X-Frame-Options`·`frame-ancestors` 때문에 표시되지 않는다. 그런 사용처가 있으면 알려 주면 허용 출처를 추가한다.
