# 인증 완성 + 부하 측정 Plan

**Goal:** 이미 만든 Incident Radar를 (A) 인증을 풀스택으로 완성해 main에 합치고, (C) 부하 테스트로 수치를 뽑아 README에 남긴다. 새 도메인 기능은 안 만든다.

> **배포(Track B) 폐기 (2026-09-09):** 무료 배포 경로가 계정 3개 + 콜드스타트 + 커맨드 제한이라 품 대비 얻는 게 적고, 사용자 판단상 라이브 데모가 결정타가 아님. B1(프로덕션 세션 쿠키)만 이미 커밋됨(`db542f1`) — 나중에 배포하면 그대로 쓰임. 나머지 B2~B6은 안 함. "눈에 보이는 결과물"은 README 스크린샷 + `docker compose up`(T28 풀스택 compose)로 대체.

**포트폴리오 약점 → 대응**
- 눈에 보이는 결과물 없음 → README 스크린샷/GIF + `docker compose up` 실행법 (C3에 포함)
- 기능이 평범 → **Track A** (인증: A1 백엔드 머지 + A2 프론트 로그인 = 풀스택)
- 성능 증명 없음 → Track C (부하 측정)

**제외:** 아티팩트 6기능 중 #2~#6 (큐 분리 / 그룹핑 / `/metrics`+Grafana / 멀티테넌시 / 알림 채널). Grafana는 새 서브시스템이라 "보완" 방향과 안 맞음.

**공통 규칙**
- 문서·커밋에 "포트폴리오" 단어 금지 → "학습 프로젝트"
- 자동 커밋 금지. 태스크 끝마다 메시지 제안 → 확인받고 커밋
- 커밋 꼬리말: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01JCA3uq8wo5J8jcuXdv6rRz`
- 브랜치: A1은 PR #1을 main 머지. A2 + Track C는 main에서 `chore/deploy-and-benchmark` 파서 별도 PR

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

## Track B — 폐기

B1(프로덕션 세션 쿠키: `session.module.ts` `sameSite:"none"` + `main.ts` `trust proxy`)만 커밋됨(`db542f1`). B2~B6(Railway/Vercel 배포, 데모 cron, 라이브 링크)은 안 함.

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

### C3. `bench/RESULTS.md` + README 성능 섹션 + README 폴리시
- `bench/RESULTS.md`: 방법론(머신 스펙, PG·Redis는 같은 머신 Docker) + autocannon 표(req/s, p50/p97.5/p99) + latencyMs 표 + 관찰 + "규모 커지면 /stats·/status 캐시가 첫 손댈 곳"
- README `## 설계 근거` 뒤에 `## 성능` 압축판 + RESULTS.md 링크
- README 폴리시(배포 대신): `docker compose up`으로 풀스택 띄우는 실행법(로그인 계정 seed 포함) + 대시보드 스크린샷 1장(`docs/images/dashboard.png`, 로컬에서 캡처)
- PR 생성

**검증:** RESULTS.md에 미기입 placeholder 없음, README 스크린샷 렌더됨

---

## 미해결
- 없음 (배포 관련 항목은 Track B 폐기로 소멸)

## 실행 순서
A1(머지) ✅ → A2(프론트 로그인) ✅ → B1(프로덕션 쿠키) ✅ → C1 → C2 → C3.
남은 건 Track C — 로컬 부하 측정 + README 폴리시.
