# 배포 + 부하 측정 Plan

**Goal:** 이미 만든 Incident Radar를 (A) 인증을 풀스택으로 완성해 main에 합치고, (B) Railway + Vercel에 라이브로 띄우고, (C) 부하 테스트로 수치를 뽑아 README에 남긴다. 새 도메인 기능은 안 만든다.

**포트폴리오 약점 → 대응**
- 라이브 URL 없음 → Track B (배포)
- 기능이 평범 → **Track A** (인증: A1 백엔드 머지 + A2 프론트 로그인 = 풀스택)
- 성능 증명 없음 → Track C (부하 측정)

**제외:** 아티팩트 6기능 중 #2~#6 (큐 분리 / 그룹핑 / `/metrics`+Grafana / 멀티테넌시 / 알림 채널). Grafana는 새 서브시스템이라 "보완" 방향과 안 맞음.

**공통 규칙**
- 문서·커밋에 "포트폴리오" 단어 금지 → "학습 프로젝트"
- 자동 커밋 금지. 태스크 끝마다 메시지 제안 → 확인받고 커밋
- 커밋 꼬리말: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01JCA3uq8wo5J8jcuXdv6rRz`
- 브랜치: A1은 PR #1을 main 머지. A2 + Track B·C는 main에서 `chore/deploy-and-benchmark` 파서 별도 PR

---

## Track A — 인증 (풀스택 완성)

### A1. `feat/auth` (PR #1) 검증 후 main 머지 — ✅ 검증 완료
- ✅ `pnpm --filter backend test` 23 suites / 100 tests 통과
- ✅ `pnpm typecheck` 5/5, `pnpm lint` 5/5
- 남은 것: `gh pr merge 1 --merge` (merge commit / squash 여부는 사용자 확인) → main 재검증 → `docs/superpowers/specs`·`plans`에서 "인증 없음" 문구 있으면 수정 후 별도 커밋
- **rebase 안 함** (충돌 없음 확인됨)

**참고:** `feat/auth`는 백엔드만. 머지하면 `SessionGuard`가 `/stats`·`/status`·`/alerts`·`GET /errors`를 막는데 프론트엔 로그인 화면이 없음 → A2가 필수.

### A2. 프론트 로그인 (아티팩트 Phase 3)
- 로그인 페이지 `app/login/page.tsx`: email/password 폼 → `POST /auth/login` (쿠키 세션)
- `lib/api/client.ts`: 모든 요청에 `credentials: "include"` (세션 쿠키 전송). 401 응답이면 `/login`으로 리다이렉트
- 로그아웃: `top-bar.tsx`에 버튼 → `POST /auth/logout` → `/login`
- (선택) 대시보드 진입 시 `GET /auth/me`로 로그인 상태 확인 — 없어도 401 리다이렉트가 게이트 역할
- `NEXT_PUBLIC_API_URL`은 기존 클라이언트가 이미 사용

**데모 인증 정책:** 로그인 벽 유지 (옵션 c). README에 계정 공개 안 함, 면접관은 스크린샷 + 라이브 `/health`·`/docs`로 확인. (viewer 계정 공개는 마음 바뀌면 쉬운 후속.)

**검증(로컬):** 백엔드 + 프론트 띄우고 → 미로그인 대시보드 접속 시 `/login`으로 튕김 → seed한 admin으로 로그인 → 대시보드 로드 → 로그아웃 시 `/login` 복귀. 기존 프론트 vitest 회귀 없음

---

## Track B — Railway + Vercel 배포

### B1. 프로덕션 세션 쿠키
- `session.module.ts`: 쿠키 `sameSite`를 프로덕션에서만 `"none"` (이미 `secure`는 prod에서 true)
- `main.ts`: `trust proxy` 켜기 (Railway 프록시 뒤 Secure 쿠키용)
- 자동 테스트 새로 안 붙임 (스펙이 앱 하나 공유해서 prod 모드 격리가 번거로움) — 실검증은 B4 Step 5

**검증:** `pnpm --filter backend test` 회귀 없음

### B2. Railway에 백엔드 + Postgres + Redis
- `railway.json`: `builder: DOCKERFILE`, `dockerfilePath: apps/backend/Dockerfile`, `healthcheckPath: /health`. `startCommand` 안 씀 (Dockerfile CMD가 이미 `migration:run && node dist/main.js`)
- Railway 프로젝트 + PostgreSQL 플러그인 + Redis 플러그인
- 백엔드 env: `NODE_ENV=production`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `REDIS_URL=${{Redis.REDIS_URL}}`, `SESSION_SECRET`, `CORS_ORIGIN`(placeholder, B4에서 교체), `RATE_LIMIT_PER_MIN=600`, `WEBHOOK_URL`(빈값). `PORT`는 Railway 자동 주입
- Root Directory는 레포 루트

**검증:** `curl /health` → 200, `curl /docs-json` → OpenAPI JSON

### B3. 관리자 계정 seed
- Railway env에 `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` 임시 추가
- Railway 대시보드 one-off 명령으로 `pnpm --filter backend seed:admin` (`railway run`은 내부 DB 주소라 노트북에서 안 닿음)
- `SEED_ADMIN_PASSWORD` env 제거
- sim용 API 키는 B5에서 admin 로그인 후 `POST /api-keys`로 발급

**검증:** `curl POST /auth/login` → 200 + Set-Cookie, 쿠키로 `GET /status` → 200

### B4. Vercel에 프론트 배포 + `CORS_ORIGIN` 되먹임
- Vercel 프로젝트: Root Directory `apps/frontend`, Framework Next.js
- **Build Command 오버라이드**: `cd ../.. && pnpm turbo run build --filter=@incident-radar/frontend...` (그냥 `next build`면 `@incident-radar/shared` dist 없어서 실패)
- 프론트 env: `NEXT_PUBLIC_API_URL`(Railway 백엔드 URL), `NEXT_PUBLIC_ALERT_THRESHOLD=10`, `NEXT_PUBLIC_COOLDOWN_SEC=300`
- 배포 후 Railway 백엔드 `CORS_ORIGIN`을 실제 Vercel URL로 교체 → 백엔드 재배포

**검증:** Vercel URL 접속 → `/login`으로 튕김 → admin 로그인 → 패널 정상, 콘솔 CORS 에러 없음, 새로고침해도 세션 유지 (= B1 검증)

### B5. 데모 트래픽 cron
- admin 로그인 → `POST /api-keys`로 sim 키 발급
- Railway cron 서비스 `demo-traffic`: 같은 레포, `*/15 * * * *`, 커맨드 `pnpm --filter @incident-radar/tools sim -- --url "$API_URL" --rate 1 --duration 120s`
- env: `API_URL`, `SIM_API_KEY`
- (선택) 스파이크 cron 별도 서비스, `7 */2 * * *`, `--spike checkout`

**검증:** 수동 트리거 → 로그에 `sent N requests` 요약 후 종료, 대시보드에 데이터 반영

### B6. README에 라이브 링크 + 스크린샷
- `mkdir -p docs/images`, 브라우저로 admin 로그인 후 대시보드 전체 캡처 → `docs/images/dashboard-live.png`
- README 상단: 대시보드/`/docs`/`/health` 링크 + 스크린샷 + "로그인 뒤에 있음, 15분마다 시뮬레이터가 트래픽 넣음" 한 줄
- `## 로컬 실행` 근처: "배포는 Railway(백+PG+Redis) + Vercel(프론트), `railway.json` 참고" 한 줄

---

## Track C — 부하 측정 (로컬)

### C1. autocannon 부하 테스트
- `bench/run.sh`: `npx autocannon`으로 `POST /errors` (API 키 헤더, body 고정), `-c 50 -d 30`
- SETUP: 인프라 기동 → `pnpm --filter backend build` → 마이그레이션 → `seed:api-key bench`로 토큰 → 백엔드를 `NODE_ENV=production RATE_LIMIT_PER_MIN=1000000`로 띄우고 로그를 `bench/ingest.log`로
- 워밍업 1회 + 본 측정 3회, 출력을 `bench/raw-2026-09-09.txt`에 저장

**측정 경로 주의:** 전부 같은 서비스라 수신→INSERT→카운트→임계값 판정까지. cooldown 때문에 enqueue 1건, webhook 발송은 거의 안 들어감. RESULTS에 명시.

### C2. `ingest … latencyMs=` 로그 파서
- `tools/bench-latency.mjs`: 로그에서 `latencyMs` 추출 → count/p50/p95/p99/max 출력. 순수 함수(`extractLatencies`, `percentile`) export
- `tools/bench-latency.test.ts`: vitest, 파싱(pretty/JSON 둘 다) + 백분위 + 빈 배열 케이스

**검증:** `pnpm --filter @incident-radar/tools exec vitest run bench-latency` 통과, 실제 `ingest.log`에 실행

### C3. `bench/RESULTS.md` + README 성능 섹션
- `bench/RESULTS.md`: 방법론(머신 스펙, PG·Redis는 같은 머신 Docker) + autocannon 표(req/s, p50/p97.5/p99) + latencyMs 표 + 관찰 + "규모 커지면 /stats·/status 캐시가 첫 손댈 곳"
- README `## 설계 근거` 뒤에 `## 성능` 압축판 + RESULTS.md 링크
- PR 생성

**검증:** RESULTS.md에 미기입 placeholder 없음

---

## 미해결 (사용자 판단)
- merge vs squash (A1)
- Railway 유료 플랜 여부 (B2)
- 데모 트래픽 누적분 정리 정책 (B5) — 지금은 자동 정리 없음
- B1 대안: Next.js rewrites로 `/api/*` 프록시하면 크로스사이트 쿠키 문제 자체가 사라짐 (설정 더 많음). P3에서 프론트를 어차피 손대므로 이 대안도 재고 가능

## 실행 순서
A1(머지) → A2(프론트 로그인) → B1 → B2 → B3 → B4 → B5 → B6 → C1 → C2 → C3.
시간 빠듯하면 A1+A2+B까지 = "라이브 + 풀스택 인증" 확보. C는 로컬이라 나중에 추가 가능.
