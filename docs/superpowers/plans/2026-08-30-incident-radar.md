# Incident Radar 구현 플랜

> **실행 방식:** 태스크 단위로 진행. 각 태스크는 독립적으로 검증 가능한 산출물로 끝난다.
> 체크박스(`- [ ]`)로 추적한다. 코드는 이 문서에 넣지 않는다 — 무엇을 할지와 어떻게
> 확인할지만 적는다.

**목표:** 에러 수집 → 슬라이딩 윈도우 카운팅 → 임계값 알림(cooldown·재시도) →
Redis 장애 시 DB fallback 까지 도는 풀스택 모노레포를, 기본기(테스트/CI/마이그레이션/
문서/보안)를 갖춘 상태로 만든다.

**아키텍처:** pnpm + Turborepo 모노레포. NestJS 백엔드가 코어 로직을, Next.js
프론트가 개요 대시보드를, `packages/shared`가 Zod로 API 계약을 담당한다. 상태는
Postgres(영속)와 Redis(카운팅·큐·cooldown)에 나눠 둔다.

**기술 스택:** TypeScript, NestJS, TypeORM, BullMQ, ioredis, Zod, Next.js(App
Router), Tailwind, shadcn/ui, TanStack Query, Zustand, recharts, Jest, supertest,
GitHub Actions, Docker Compose.

**스펙:** `docs/superpowers/specs/2026-08-30-incident-radar-design.md` (이 플랜은
스펙을 근거로 하며 함께 읽는다)

## 전역 제약 (모든 태스크에 암묵 적용)

- Node 20 LTS, pnpm 9+, 패키지 매니저는 pnpm 워크스페이스로 고정
- 공유 패키지 이름 `@incident-radar/shared`, 앱에서 `workspace:*`로 참조
- TypeORM `synchronize: false` — 스키마 변경은 반드시 마이그레이션 파일로
- 모든 API 입출력 스키마는 Zod에 정의하고 타입은 `z.infer`로 파생 (수기 타입 금지)
- 전역 임계값 기본값: 10건 / 60000ms 윈도우 (env로 오버라이드)
- cooldown 은 `SET <key> <val> NX EX <sec>` 단일 명령으로만 구현
- BullMQ 재시도: attempts 5, 지수 백오프 base delay 1000ms + 소량 지터
- 보안: helmet 적용, CORS 는 `CORS_ORIGIN` env 로 명시, `POST /errors` 에
  `@nestjs/throttler` IP 기준 분당 100회
- `/health`: DB 다운이면 503, 정상이면 200에 `ok`/`degraded`(Redis 다운이면 degraded)
- 로깅은 `nestjs-pino` 구조화 로그 (dev pretty, prod JSON)
- 테스트는 목이 아닌 실제 Redis·Postgres 사용 — 로컬은 `docker-compose.test.yml`,
  CI는 서비스 컨테이너
- 시뮬레이터는 `tools/simulator.ts`, docker-compose 에는 넣지 않음
- 커밋은 태스크 끝, 또는 태스크 내 논리 단위마다 자주

---

## Phase 0 — 스캐폴딩

### Task 1: 모노레포 뼈대

**파일:** create `pnpm-workspace.yaml`, `turbo.json`, `package.json`(root),
`.gitignore`, `.env.example`, `tsconfig.base.json`

- [ ] `git init` 하고 `.gitignore` 작성 (node_modules, dist, .next, .env, coverage)
- [ ] `pnpm-workspace.yaml` 에 `apps/*`, `packages/*`, `tools` 등록
- [ ] root `package.json` 에 workspace 스크립트(`dev`/`build`/`lint`/`test`)를
      turbo 로 위임하도록 작성
- [ ] `turbo.json` 파이프라인 정의 (`build` 는 `^build` 의존, `dev` 는 캐시/persistent)
- [ ] `tsconfig.base.json` 공통 컴파일러 옵션 (strict, moduleResolution 등)
- [ ] `.env.example` 스켈레톤 (DB/REDIS/THRESHOLD/WINDOW/COOLDOWN/CORS_ORIGIN/
      WEBHOOK_URL/RATE_LIMIT 자리만)

**검증:** `pnpm install` 성공, `pnpm turbo run build --dry` 가 그래프를 출력

**개념:** pnpm 워크스페이스가 심링크로 로컬 패키지를 잇는 방식. Turborepo
태스크 파이프라인과 `^` (upstream) 의존. 왜 tsconfig 를 base 로 쪼개는지.

### Task 2: `packages/shared` — Zod 스키마

**파일:** create `packages/shared/package.json`, `tsconfig.json`,
`src/index.ts`, `src/schemas.ts`, `src/schemas.test.ts`

- [ ] 패키지 초기화, 빌드 타깃 설정 (tsup 또는 tsc, ESM+d.ts)
- [ ] `ErrorLogInput`, `ErrorLog`, `Alert`, `ServiceStatus`, `StatsResponse`,
      `AlertFailure` 스키마 정의 (스펙 5절 필드 기준)
- [ ] 각 스키마의 `z.infer` 타입을 같은 이름으로 재수출
- [ ] `index.ts` 에서 전부 배럴 익스포트
- [ ] 스키마 라운드트립 유닛 테스트 1~2개 (유효 입력 parse 성공 / 잘못된 타입 실패)

**검증:** `pnpm --filter @incident-radar/shared build` 성공,
`pnpm --filter @incident-radar/shared test` 통과

**개념:** 스키마를 단일 출처로 두고 타입을 파생하는 이유. `z.infer` 동작.
모노레포에서 라이브러리 패키지의 빌드 산출물(d.ts 포함) 구성.

### Task 3: NestJS 백엔드 스캐폴드

**파일:** create `apps/backend/` (nest new 결과), `src/config/` 모듈,
`src/health/` 모듈, `.env` (git 제외)

- [ ] `apps/backend` 에 NestJS 앱 생성, `@incident-radar/shared` 의존 추가
- [ ] `@nestjs/config` 로 env 로딩 + Zod 로 env 스키마 검증 (누락 시 부팅 실패)
- [ ] `GET /health` 스텁 (아직 DB/Redis 체크 없이 `{status:'ok'}` 200)
- [ ] pino 는 아직 미도입 — 기본 로거로 부팅만 확인
- [ ] `pnpm --filter backend start:dev` 스크립트 확인

**검증:** `pnpm --filter backend start:dev` 부팅,
`curl localhost:3000/health` → 200

**개념:** Nest 모듈/프로바이더/DI 컨테이너 기본. env 를 부팅 시점에 검증해
"설정 오류를 런타임 깊은 곳이 아니라 시작할 때" 잡는 패턴.

### Task 4: Next.js 프론트 스캐폴드

**파일:** create `apps/frontend/` (App Router), Tailwind 설정, shadcn 초기화,
`app/page.tsx` 플레이스홀더

- [ ] `apps/frontend` 에 Next.js(App Router, TS) 생성
- [ ] Tailwind 설치·설정, shadcn/ui init (버튼/카드 정도만 추가)
- [ ] `@incident-radar/shared` 의존 추가
- [ ] `NEXT_PUBLIC_API_URL` env 배선
- [ ] 루트 페이지에 "Incident Radar" 헤더만 렌더

**검증:** `pnpm --filter frontend dev` 부팅, 브라우저에서 헤더 확인.
루트에서 `pnpm dev` 시 백엔드+프론트 동시 기동 확인.

**개념:** App Router 의 서버/클라이언트 컴포넌트 경계. `NEXT_PUBLIC_` prefix 가
클라이언트 번들에 노출되는 규칙.

---

## Phase 1 — 수집과 이력

### Task 5: TypeORM DataSource + `error_logs` 마이그레이션

**파일:** create `apps/backend/src/db/data-source.ts`, `src/db/migrations/*`,
modify config 모듈

- [ ] TypeORM DataSource 설정 (`synchronize:false`, migrations glob, CLI 스크립트)
- [ ] `error_logs` 엔티티 (id uuid pk, service text, message text, created_at timestamptz)
- [ ] 첫 마이그레이션 생성 — 테이블 + `(service, created_at)` 복합 인덱스
- [ ] `migration:run` / `migration:revert` npm 스크립트

**검증:** 로컬 Postgres 띄운 상태에서 `pnpm --filter backend migration:run` →
psql 로 테이블·인덱스 존재 확인, `migration:revert` 로 롤백 확인

**개념:** `synchronize:true` 가 왜 위험한지(운영 데이터 유실). 마이그레이션이
스키마 변경 이력을 코드로 남기는 방식. 복합 인덱스 `(service, created_at)` 가
leftmost-prefix 규칙으로 "서비스별 시간범위" 쿼리를 받치는 원리.

### Task 6: 테스트 인프라 (`docker-compose.test.yml`)

**파일:** create `docker-compose.test.yml`, `apps/backend/test/setup.ts`,
Jest 설정(유닛/e2e 프로젝트 분리)

- [ ] test 용 Postgres·Redis 서비스 정의 (고정 포트, tmpfs 볼륨)
- [ ] Jest 를 `unit` / `e2e` 두 프로젝트로 분리, 각각 setup 파일
- [ ] 테스트 시작 전 마이그레이션 실행(T5), 테스트 간 테이블 truncate 유틸
- [ ] `pnpm test` 가 compose up → migrate → jest → compose down 을 감싸도록

**검증:** `pnpm --filter backend test` 가 빈 스위트라도 실제 DB·Redis 붙어서 초록

**개념:** 카운터·cooldown·fallback 은 Redis 동작 자체가 테스트 대상이라 목이
아니라 실물을 써야 하는 이유. Jest projects 로 유닛/통합 분리. 이 태스크가
뒤의 모든 e2e·통합 테스트의 전제라 수집 엔드포인트(T7)보다 먼저 온다.

### Task 7: `POST /errors` · `GET /errors`

**파일:** create `apps/backend/src/errors/` 모듈(controller/service/repo),
`src/common/zod-validation.pipe.ts`, e2e `test/errors.e2e-spec.ts`

- [ ] shared 스키마를 쓰는 Zod 검증 파이프 구현 (실패 시 400 + 이슈 목록)
- [ ] `POST /errors` — 본문 검증 후 1행 저장, 201
- [ ] `GET /errors` — `service`(필수)·`from`/`to`(선택 ISO)·`limit`(기본 100,
      상한 1000), `created_at` 내림차순
- [ ] e2e(T6 하네스 사용): POST 후 GET 라운드트립, 잘못된 본문 400, limit 상한 클램프

**검증:** `curl -XPOST .../errors -d '{"service":"checkout","message":"boom"}'`
→ 201, `curl '.../errors?service=checkout'` → 방금 값 포함.
`pnpm --filter backend test:e2e` 통과.

**개념:** DTO 검증을 신뢰 경계(컨트롤러 입구)에 두는 이유. Nest 파이프의 위치.
`limit` 상한으로 무제한 결과 쿼리를 막는 것도 보안 표면.

---

## Phase 2 — 슬라이딩 윈도우 카운팅

### Task 8: `CounterStrategy` + `RedisSlidingWindowCounter`

**파일:** create `apps/backend/src/counter/counter.strategy.ts`,
`redis-sliding-window.counter.ts`, `redis-sliding-window.counter.spec.ts`,
`src/common/clock.ts` (주입식 `now()`)

- [ ] 주입식 Clock 프로바이더 (테스트에서 시간 고정용)
- [ ] `CounterStrategy` 인터페이스: `record(service, at) → Promise<number>`
- [ ] Redis 구현: 서비스별 Sorted Set 에 ZADD → ZREMRANGEBYSCORE(윈도우 밖 제거)
      → ZCARD → PEXPIRE(윈도우×2), 파이프라인/MULTI 로 묶기
- [ ] 멤버 충돌 방지용 유니크 멤버 값 규칙
- [ ] 유닛 테스트: 윈도우 내 이벤트 카운트 / 윈도우 밖 이벤트 트리밍 / 경계값
      (`at - windowMs` 정확히) 동작 / idle 후 키 TTL

**검증:** `pnpm --filter backend test -- counter` 통과

**개념:** Sorted Set score 를 타임스탬프로 써서 범위 삭제로 윈도우를 유지하는
기법. 고정 윈도우(INCR+EXPIRE)의 경계 스파이크 문제(최대 2배 누락). 파이프라인
으로 왕복을 줄이고 원자적으로 읽는 이유. 주입식 시계로 테스트를 결정론화.

### Task 9: 카운터를 수집 경로에 배선 + 임계값 감지(로그만)

**파일:** modify `errors` 서비스, create `src/detector/threshold.service.ts`

- [ ] `POST /errors` 저장 직후 `counter.record()` 호출
- [ ] 반환 카운트 > 임계값이면 구조화 로그 한 줄 (`service`, `count`, `window`)
- [ ] 아직 알림·cooldown 없음

**검증:** 짧은 간격으로 같은 service 에 11회 POST → 임계값 초과 로그 1회 이상

**개념:** 수집과 판정을 한 요청 흐름에 두되, 부수효과(알림)는 뒤 단계로 미루는
단계적 구현. "먼저 관측 가능하게, 그다음 행동".

---

## Phase 3 — 트래픽 시뮬레이터

### Task 10: `tools/simulator.ts`

**파일:** create `tools/simulator.ts`, `tools/package.json`

- [ ] 가짜 서비스 목록 + 서비스별 기본 에러율
- [ ] 지수 분포 간격으로 `POST /errors` 반복
- [ ] `--rate`, `--duration`, `--spike <service>`, `--url` 옵션
- [ ] `--spike` 는 대상 서비스에 임계값 초과 버스트 주입
- [ ] 종료 시 전송 건수 요약 출력

**검증:** `pnpm tsx tools/simulator.ts --duration 10s` 실행 후
`GET /errors?service=checkout` 에 데이터 축적 확인. `--spike checkout` 시
Task 9 의 임계값 초과 로그 발생.

**개념:** 부하 생성기를 리포에 두면 대시보드·알림·나중의 k6 를 전부 데모 가능.
지수 분포 간격이 "자연스러운" 트래픽에 가까운 이유(포아송 과정).

---

## Phase 4 — 알림 발송 (cooldown · 재시도 · 실패 이력)

### Task 11: Cooldown 서비스

**파일:** create `apps/backend/src/alerting/cooldown.service.ts`,
`cooldown.service.spec.ts`

- [ ] `tryAcquire(service) → boolean` — `SET cooldown:<svc> 1 NX EX <sec>` 결과로 판정
- [ ] 유닛 테스트: 1차 true / 윈도우 내 2차 false / 짧은 TTL 만료 후 재획득 true

**검증:** `pnpm --filter backend test -- cooldown` 통과

**개념:** `SET NX EX` 가 단일 원자 연산이라 분산 락으로 안전한 이유.
GET-후-SET 이 레이스인 이유(둘 다 없음을 읽고 둘 다 씀). cooldown 이 "알림
폭풍"을 억제하는 역할.

### Task 12: `alerts` · `alert_failures` 마이그레이션 + BullMQ 파이프라인

**파일:** create 마이그레이션 2건, `src/alerting/alerts.module.ts`,
`alert.queue.ts`, `alert.worker.ts`, `alert.repo.ts`

- [ ] `alerts`(id, service, count, threshold, window_ms, status, at),
      `alert_failures`(id, service, payload jsonb, error, attempts, failed_at)
      마이그레이션
- [ ] BullMQ 큐 `alerts` 생성 (Redis 연결 재사용)
- [ ] 임계값 초과 && `cooldown.tryAcquire()` 성공 → 잡 추가
- [ ] 워커: `WEBHOOK_URL` 있으면 POST, 없으면 "alert dispatched" 구조화 로그
- [ ] 잡 옵션: attempts 5, 지수 백오프 base 1000ms + 커스텀 지터
- [ ] `completed` 리스너 → `alerts` 행, `failed`(최종) 리스너 → `alert_failures` 행

**검증:** 시뮬레이터 `--spike checkout` → `alerts` 에 1행,
`GET /errors` 폭주에도 cooldown 으로 추가 알림 없음.
`WEBHOOK_URL` 을 일부러 404 로 두면 → 재시도 로그 5회 후 `alert_failures` 1행.

**개념:** 큐가 수집 지연과 발송 지연을 분리하는 이유. at-least-once 전달.
지수 백오프에 지터를 더해 동시 재시도(thundering herd)를 흩는 이유.
DLQ 를 별도 큐 대신 실패 테이블로 대신하는 트레이드오프.

### Task 13: 멱등성 키 + 지연시간 로깅

**파일:** modify `alert.worker.ts`, `errors` 서비스; create
`src/common/latency.interceptor.ts` 또는 서비스 내 계측

- [ ] webhook 호출에 멱등성 키 헤더 추가 (`<service>:<윈도우 시작 epoch>`)
- [ ] `POST /errors` 수신 시각 ~ 알림 enqueue(또는 판정 종료) 시각 측정
- [ ] pino 로그 한 줄: `service`, `count`, `path`(`redis`/`db-fallback`),
      `enqueued`, `latencyMs`

**검증:** 시뮬레이터 실행 중 로그에서 `path` 와 `latencyMs` 필드 확인.
webhook 목 서버 로그에 멱등성 키 헤더 도착 확인.

**개념:** at-least-once 환경에서 소비자 멱등성이 필수인 이유. 메트릭 스택 없이
구조화 로그 필드만으로 경로별 지연을 비교하는 방법.

---

## Phase 5 — Redis 장애와 DB fallback

### Task 14: 헬스 플래그 + `DbCountCounter` + 경로 선택

**파일:** create `src/counter/redis-health.service.ts`,
`db-count.counter.ts`, `counter.selector.ts`, 각 spec 파일

- [ ] `RedisHealthService`: 5초 간격 PING + 커맨드 에러 훅 → `healthy` 불리언
- [ ] `DbCountCounter`: `error_logs` 에서 `created_at > now() - interval` COUNT
- [ ] `CounterSelector`: 호출 시 `healthy` 면 Redis, 아니면 DB 카운터 반환
- [ ] `healthy=false` 인데 임계값 초과 시: enqueue 건너뛰고 `alert suppressed:
      redis down` 구조화 로그 한 줄 (스펙 4.5)
- [ ] 유닛 테스트: `healthy=false` → DB 카운터로 라우팅, `true` → Redis 카운터

**검증:** `pnpm --filter backend test -- selector` 통과.
로컬에서 redis 컨테이너 stop → 시뮬레이터 계속 → 로그 `path:"db-fallback"`,
`POST /errors` 여전히 201.

**개념:** graceful degradation. fail-open(정확도 낮춰도 계속) vs fail-close
(막아버림)의 선택 근거 — 알림 시스템에선 fail-open 이 맞다. 이 규모엔 플래그로
충분하고 풀 서킷 브레이커(half-open 프로빙)는 과한 이유.

### Task 15: `/health` degraded 배선

**파일:** modify `src/health/`

- [ ] DB 체크 실패 → 503
- [ ] DB 정상 + Redis 정상 → 200 `{status:'ok'}`
- [ ] DB 정상 + Redis 다운 → 200 `{status:'degraded', redis:'down'}`

**검증:** redis 정상 → `curl /health` `ok`. redis stop → `degraded`, 상태코드 200.
DB stop → 503.

**개념:** 헬스체크가 "살아있음"과 "완전 정상"을 구분해야 하는 이유. 로드밸런서·
오케스트레이터가 이 신호를 어떻게 쓰는지.

---

## Phase 6 — 대시보드 지원 엔드포인트

### Task 16: `GET /stats` · `GET /status` · `GET /alerts`

**파일:** create `src/stats/`, modify `src/alerting/`, e2e
`test/dashboard.e2e-spec.ts`

- [ ] `GET /stats` — 고정 인터벌(기본 1분) 버킷 카운트, shared `StatsResponse` 형태
- [ ] `GET /status` — 최근 24h distinct service 마다 윈도우 카운트 + cooldown TTL
- [ ] `GET /alerts` — `alerts` + `alert_failures` 시간 역순 합침, `limit` 파라미터
- [ ] e2e 세트(스펙 6절): 임계값 초과 버스트 → 알림 1회, `alert_failures` 비어
      있음, `GET /errors` N행, `GET /status` 에 cooldown 활성 표시

**검증:** 세 엔드포인트 응답을 shared 스키마로 parse 시 통과.
`pnpm --filter backend test:e2e` 초록.

**개념:** 프론트가 필요로 하는 읽기 모델을 별도 엔드포인트로 빼는 이유(대시보드는
스캔용, 원장 조회와 다른 형태). SQL 시간 버킷팅(`date_trunc` / `time_bucket`).

---

## Phase 7 — 기본기

### Task 17: GitHub Actions CI

**파일:** create `.github/workflows/ci.yml`

- [ ] `push` · `pull_request` 트리거
- [ ] pnpm 캐시, `pnpm install --frozen-lockfile`
- [ ] `turbo lint`
- [ ] `postgres`·`redis` 서비스 컨테이너 + 마이그레이션 후 `turbo test`

**검증:** 브랜치 푸시 → Actions 초록. 일부러 lint 에러 넣어 빨강 확인 후 되돌림.

**개념:** CI 서비스 컨테이너로 로컬 compose 와 같은 환경 재현. `frozen-lockfile`
로 "내 머신에선 됐는데" 방지.

### Task 18: Swagger

**파일:** modify `main.ts`, 각 컨트롤러/DTO 데코레이터

- [ ] `@nestjs/swagger` 셋업, `/docs` UI + `/docs-json`
- [ ] 각 엔드포인트에 요약·응답 스키마 주석

**검증:** `curl /docs-json` 에 모든 경로 존재, 브라우저에서 `/docs` 렌더.

**개념:** 코드에서 OpenAPI 를 파생해 문서 드리프트를 줄이는 방식.

### Task 19: 구조화 로깅(pino) 전면 적용

**파일:** modify `main.ts`, `app.module.ts`

- [ ] `nestjs-pino` 도입, Nest 기본 로거 교체
- [ ] dev pretty transport / prod JSON
- [ ] 요청 로깅 + 앞 단계에서 심은 커스텀 로그가 같은 포맷으로 나오는지 정리

**검증:** dev 부팅 로그가 pino 포맷, `NODE_ENV=production` 시 JSON 한 줄.

**개념:** 구조화 로그가 grep·집계에 유리한 이유. 요청 스코프 로거와 correlation id.

### Task 20: 보안 마무리

**파일:** modify `main.ts`, `app.module.ts`; complete `.env.example`

- [ ] `helmet` 적용
- [ ] CORS 를 `CORS_ORIGIN` env 로 명시(`origin:true` 금지)
- [ ] `@nestjs/throttler` 를 `POST /errors` 에 IP 기준 분당 100회
- [ ] `.env.example` 에 실제 쓰는 모든 변수 나열 + 설명 주석

**검증:** 레이트리밋 초과하도록 빠르게 연타 → 429. 허용 안 된 Origin 요청 → CORS 차단.
`.env.example` 항목과 코드에서 읽는 env 키가 1:1.

**개념:** 레이트리밋을 수집 엔드포인트에 두는 이유(가장 남용되기 쉬운 표면).
CORS 를 와일드카드로 열면 안 되는 이유.

### Task 21: README

**파일:** create `README.md`

- [ ] mermaid 아키텍처 다이어그램 (수집 → 카운터 → 임계값 → cooldown → 큐 →
      워커 → webhook, Redis 다운 fallback 분기)
- [ ] "설계 근거" 절: 슬라이딩 vs 고정 윈도우 / BullMQ+백오프+실패 테이블 vs
      인프로세스 재시도 / fallback fail-open vs fail-close / cooldown `SET NX EX`
- [ ] 로컬 실행법(`docker compose up`) + 엔드포인트별 curl 예시
- [ ] 시뮬레이터 사용법

**검증:** mermaid 가 GitHub 프리뷰에서 렌더. curl 예시를 그대로 복사해 동작.

**개념:** 설계 결정의 "왜"를 남기는 것이 코드보다 오래 가는 문서. 다이어그램으로
장애 분기를 한눈에.

---

## Phase 8 — 프론트엔드 (개요 대시보드)

### Task 22: API 클라이언트 + 쿼리/상태 배선

**파일:** create `apps/frontend/lib/api.ts`, `lib/queryClient.ts`,
`store/ui.ts`, `app/providers.tsx`

- [ ] fetch 래퍼: 응답을 shared 스키마로 parse, 실패 시 타입이 붙은 에러 throw
- [ ] TanStack Query Provider, 기본 `staleTime`·`refetchInterval`(5초)
- [ ] Zustand 스토어: 선택 서비스, 선택 기간만
- [ ] `/stats` `/status` `/alerts` 각각 쿼리 훅

**검증:** 백엔드 켜고 대시보드 열면 네트워크 탭에 5초 폴링, 응답 parse 통과.
백엔드 끄면 쿼리 에러 상태로 전이.

**개념:** 서버 상태(TanStack Query)와 클라이언트 UI 상태(Zustand)를 분리하는 이유.
공유 타입이 있어도 경계에서 parse 하는 이유(런타임 서버는 컴파일러가 못 본 걸 반환).
`staleTime` vs `refetchInterval` 차이.

### Task 23: 레이아웃 셸 + 스탯 타일

**파일:** create `app/page.tsx`, `components/StatTiles.tsx`,
`components/DashboardShell.tsx`

- [ ] 상단바(제목 + 기간 표시 + 폴링 인디케이터)
- [ ] 스탯 타일 4개: 최근 60분 에러 수 / 24h 알림 수(실패 구분) / cooldown 중 서비스
      수 / p95 수집→알림 지연
- [ ] 시맨틱 마크업(`main`, 제목 있는 `section`)

**검증:** 실제 데이터로 숫자가 채워짐. 데이터 없을 때 0/placeholder.

**개념:** 대시보드는 "요약 먼저, 상세 나중". 상태를 숫자뿐 아니라 형태(색/칩)로도
인코딩.

### Task 24: 에러 추이 라인차트

**파일:** create `components/ErrorTrendChart.tsx`

- [ ] recharts 멀티시리즈 라인차트, `/stats` 데이터 바인딩
- [ ] 임계값 기준선, 흐린 그리드, 끝점 강조
- [ ] 서비스 선택 시 Zustand 상태와 연동

**검증:** 시뮬레이터 `--spike` 시 해당 서비스 라인이 임계선 위로 치솟음.

**개념:** 차트도 타입만큼 디자인 대상(면 채움, 흐린 그리드, 끝점). 시계열 데이터
바인딩과 리렌더 비용.

### Task 25: Cooldown 패널

**파일:** create `components/CooldownPanel.tsx`

- [ ] `/status` 에서 cooldown 활성 서비스 + 남은 TTL 표시
- [ ] 남은 시간 바/카운트다운

**검증:** `--spike` 직후 해당 서비스가 cooldown 으로 뜨고 TTL 이 줄어듦.

**개념:** 폴링 주기와 TTL 표시의 불일치를 어떻게 다룰지(클라이언트 보간 vs 폴링값 그대로).

### Task 26: 최근 알림 테이블

**파일:** create `components/RecentAlertsTable.tsx`

- [ ] `/alerts` 바인딩, 최신순
- [ ] dispatched/failed 상태 칩 + 실패행 좌측 스트라이프
- [ ] 컬럼: 시각 / 서비스 / 상태 / rate / attempts / 상세
- [ ] `aria-live` 로 새 행 안내

**검증:** webhook 강제 실패 후 실패행이 구분되어 표시. 새 알림 도착 시 스크린리더 안내.

**개념:** 표에서 상태를 색+형태 이중으로 인코딩. `aria-live` 의 politeness 레벨.

### Task 27: 로딩/에러/빈 상태 + 접근성 패스

**파일:** modify 위 컴포넌트들, create `components/PanelState.tsx`

- [ ] 각 패널 독립적으로 로딩(스켈레톤)/에러/빈 상태 렌더
- [ ] parse 실패는 해당 패널 에러 상태로
- [ ] 키보드 포커스 링 유지, 탭 순서 점검, 대비 확인
- [ ] `prefers-reduced-motion` 존중

**검증:** 백엔드 끔 → 세 패널 각각 에러 상태(전체 크래시 아님). 데이터 0건 →
빈 상태 문구. 키보드만으로 전체 탐색 가능.

**개념:** 패널 단위 에러 격리(한 쿼리 실패가 화면 전체를 죽이지 않음). 로딩/빈/
에러는 기능이지 예외처리 곁다리가 아님.

---

## Phase 9 — 통합 실행

### Task 28: `docker-compose.yml` 풀스택

**파일:** create `docker-compose.yml`, `apps/backend/Dockerfile`,
`apps/frontend/Dockerfile`, backend 엔트리포인트 스크립트

- [ ] `postgres`(명명 볼륨·헬스체크), `redis`(헬스체크)
- [ ] `backend`: 둘이 healthy 후 시작, 엔트리포인트가 `migration:run` → 앱 기동
- [ ] `frontend`: `backend` 의존, Next.js 프로덕션 빌드·서버, API URL 주입
- [ ] `.env.example` → `.env` 로 한 벌 채우면 뜨도록

**검증:** 클린 상태에서 `docker compose up` 한 번 → 대시보드 접속 가능.
호스트에서 `pnpm tsx tools/simulator.ts --spike checkout` 실행 → 대시보드에
추이·cooldown·알림이 실시간(5초 폴링)으로 반영.

**개념:** 마이그레이션을 엔트리포인트에 두어 "컨테이너 뜨면 스키마 최신" 보장.
compose 헬스체크와 `depends_on: condition: service_healthy` 로 기동 순서 제어.

---

## 스트레치 (코어 완료 후, 이 우선순위 순 — 착수 시 각자 플랜 작성)

1. **고정 윈도우 카운터** — `CounterStrategy` 뒤에 `RedisFixedWindowCounter`
   (INCR + EXPIRE) 추가, env 로 전략 선택, README 에 경계 스파이크 비교 노트
2. **성능 리포트 페이지** — `GET /metrics/latency`(redis vs db-fallback 경로
   p50/p95) + 프론트 `/report` 라우트에 비교 차트
3. **Auth.js 관리자 로그인** — 대시보드 라우트 보호, 세션 기반
4. **`/radar` 3D 레이더** — react-three-fiber + drei, 별도 라우트로 격리,
   에러율에 따른 색/펄스
5. **k6 스크립트** — 100 rps 부하 + p95, cooldown 전/후 알림 횟수 비교 스크립트

---

## 리뷰 결과 (2회)

### 1차 — 스펙 커버리지

| 스펙 항목 | 담당 태스크 |
|---|---|
| 2절 코어: 수집·이력 | T5, T7 |
| 2절 코어: 슬라이딩 윈도우 카운팅 | T8, T9 |
| 2절 코어: 임계값 → BullMQ 알림·백오프·실패 이력 | T12, T13 |
| 2절 코어: cooldown | T11 |
| 2절 코어: Redis 헬스 + DB fallback | T14, T15 |
| 2절 코어: 지연시간 로깅 | T13 |
| 2절 코어: 기본기(테스트/CI/마이그레이션/Swagger/pino/health/보안/README) | T6, T17–T21, T5, T15 |
| 2절 코어: 프론트 개요 대시보드 3패널 + 상태 UI + Zod 검증 | T22–T27 |
| 2절 코어: docker-compose 원커맨드 | T28 |
| 3절: 트래픽 시뮬레이터 | T10 |
| 4.1–4.7 백엔드 세부 | T5–T9, T11–T16 |
| 5절: 공유 패키지 스키마 | T2 |
| 6절: 기본기 세부 | T6, T17–T21 |
| 7절: 프론트 설계 | T22–T27 |
| 8절: docker-compose | T28 |
| 9절: 실행 순서 | Phase 0–9 순서가 일치 |
| 스트레치 1–5 | 스트레치 절 (착수 시 플랜 별도) |

→ 누락 없음. 스펙 4.5 의 "Redis 다운 중 enqueue skip + alert suppressed 로그"를
T14 체크리스트에 명시 항목으로 추가함(반영 완료).

### 2차 — 순서·의존성·일관성

- **순서 버그 수정:** 최초안은 수집 엔드포인트(e2e 포함)가 테스트 인프라보다
  앞이었음. 테스트 하네스를 T6 으로 당기고 수집 엔드포인트를 T7 로 미룸.
  이제 모든 e2e·통합 테스트가 T6 하네스 뒤에 온다.
- **네이밍 일관성:** 카운터 인터페이스 `CounterStrategy` / 메서드
  `record(service, at)` 를 T8·T9·T14 에서 동일하게 사용. `alerts` /
  `alert_failures` 테이블명 T12·T16 동일. 헬스 플래그 `healthy` T14·T15 동일.
- **기본값 단일 정의:** 임계값 10 / 윈도우 60000ms 는 전역 제약에만 정의,
  개별 태스크에서 재정의하지 않음.
- **플레이스홀더 스캔:** "적절한 에러 처리 / 엣지케이스 처리" 류 모호 표현 없음.
  각 태스크에 실행 가능한 검증 명령과 기대값이 있음. 애플리케이션·테스트 코드
  블록은 사용자 지시(체크리스트 위주)에 따라 의도적으로 뺌.
- **잔여 판단 여지:** T2 의 빌드 도구(tsup vs tsc), T16 의 시간 버킷팅 방식
  (`date_trunc` vs `time_bucket`) 은 순수 구현 선택으로 남겨둠 — 실행자가 결정.
