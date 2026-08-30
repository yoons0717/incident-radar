# Incident Radar 구현 플랜

태스크 단위로 진행. 각 태스크는 독립 검증 가능한 산출물로 끝난다. 코드는 넣지
않는다 — 무엇을 할지·어떻게 확인할지·짚을 개념만. 커밋은 태스크마다.

**스펙:** `docs/superpowers/specs/2026-08-30-incident-radar-design.md` (함께 읽는다)

## 전역 제약 (모든 태스크에 적용)

- Node 20 LTS, pnpm 9+ 워크스페이스 + Turborepo
- 공유 패키지 `@incident-radar/shared`, 앱에서 `workspace:*`
- TypeORM `synchronize:false` — 스키마 변경은 마이그레이션 파일로만
- 모든 API 스키마는 Zod, 타입은 `z.infer` 파생 (수기 타입 금지)
- 전역 임계값 기본 10건 / 60000ms 윈도우 (env 오버라이드), 태스크에서 재정의 금지
- cooldown 은 `SET <key> <val> NX EX <sec>` 단일 명령
- BullMQ 재시도: attempts 5, 지수 백오프 base 1000ms + 소량 지터
- helmet, CORS 는 `CORS_ORIGIN` env 명시, `POST /errors` throttler IP 분당 100회
- `/health`: DB 다운 503 / 정상 200 `ok`·`degraded`(Redis 다운이면 degraded)
- `nestjs-pino` 구조화 로깅 (dev pretty, prod JSON)
- 테스트는 실제 Redis·Postgres (로컬 `docker-compose.test.yml`, CI 서비스 컨테이너)
- 시뮬레이터는 `tools/simulator.ts`, docker-compose 에는 미포함
- 카운터 인터페이스 `CounterStrategy` / `record(service, at)→Promise<number>`,
  테이블명 `alerts`·`alert_failures`, 헬스 플래그 `healthy` — 전 태스크 동일 명칭

## 태스크

### Phase 0 — 스캐폴딩

| # | 태스크 | 핵심 할 일 → 검증 | 개념 |
|---|---|---|---|
| 1 | 모노레포 뼈대 | `git init`·`.gitignore`; `pnpm-workspace.yaml`(apps/*, packages/*, tools); root `package.json` 스크립트→turbo 위임; `turbo.json` 파이프라인; `tsconfig.base.json`; `.env.example` 스켈레톤 → `pnpm install` 성공, `turbo run build --dry` 그래프 출력 | pnpm 워크스페이스 심링크, Turborepo `^`(upstream) 의존, tsconfig base 분리 |
| 2 | `packages/shared` Zod 스키마 | 패키지 초기화(빌드 타깃 ESM+d.ts); `ErrorLogInput`·`ErrorLog`·`Alert`·`ServiceStatus`·`StatsResponse`·`AlertFailure` 스키마 + `z.infer` 동명 재수출; 배럴 익스포트; parse 라운드트립 유닛 1~2개 → `build`·`test` 통과 | 스키마 단일 출처에서 타입 파생, 라이브러리 패키지 빌드 산출물 구성 |
| 3 | NestJS 백엔드 스캐폴드 | `apps/backend` 생성 + shared 의존; `@nestjs/config` + Zod env 검증(누락 시 부팅 실패); `GET /health` 스텁 200 → `start:dev` 부팅, `curl /health` 200 | Nest 모듈/DI, env 를 부팅 시점 검증 |
| 4 | Next.js 프론트 스캐폴드 | `apps/frontend`(App Router, TS); Tailwind+shadcn init(버튼/카드만); shared 의존; `NEXT_PUBLIC_API_URL` 배선; 루트에 헤더만 → `pnpm dev` 로 백+프론트 동시 기동 | 서버/클라 컴포넌트 경계, `NEXT_PUBLIC_` 노출 규칙 |

### Phase 1 — 수집·이력

| # | 태스크 | 핵심 할 일 → 검증 | 개념 |
|---|---|---|---|
| 5 | TypeORM + `error_logs` 마이그레이션 | DataSource(`synchronize:false`, migrations glob, CLI); `error_logs` 엔티티(id uuid, service, message, created_at tz); 첫 마이그레이션 = 테이블 + `(service, created_at)` 복합 인덱스; `migration:run`/`revert` 스크립트 → `migration:run` 후 psql 로 테이블·인덱스 확인, `revert` 롤백 | `synchronize:true` 위험(데이터 유실), 마이그레이션이 스키마 이력을 코드로, 복합 인덱스 leftmost-prefix 로 서비스별 시간범위 쿼리 |
| 6 | 테스트 인프라 | `docker-compose.test.yml`(pg·redis, 고정 포트, tmpfs); Jest `unit`/`e2e` 프로젝트 분리 + setup; 테스트 전 마이그레이션, 간 truncate 유틸; `pnpm test` 가 compose up→migrate→jest→down 감쌈 → 빈 스위트도 실제 DB·Redis 붙어 초록 | 카운터·cooldown·fallback 은 Redis 동작이 테스트 대상이라 실물 필요; 이 태스크가 뒤 모든 e2e 의 전제 |
| 7 | `POST`/`GET /errors` | shared 스키마 Zod 검증 파이프(실패 400+이슈); `POST` 저장 201; `GET`(service 필수, from/to, limit 기본100·상한1000, created_at desc); e2e(T6 하네스): 라운드트립·잘못된 본문 400·limit 클램프 → curl POST 201 / GET 값 포함 / `test:e2e` 초록 | 신뢰 경계 입력 검증, Nest 파이프 위치, limit 상한도 보안 표면 |

### Phase 2 — 슬라이딩 윈도우 카운팅

| # | 태스크 | 핵심 할 일 → 검증 | 개념 |
|---|---|---|---|
| 8 | `RedisSlidingWindowCounter` | 주입식 Clock(`now()`); `CounterStrategy` 인터페이스; Redis 구현: 서비스별 ZSET 에 ZADD→ZREMRANGEBYSCORE(윈도우 밖)→ZCARD→PEXPIRE(윈도우×2), 파이프라인/MULTI; 유니크 멤버 규칙; 유닛: 윈도우 내 카운트 / 밖 트리밍 / 경계값(`at-windowMs`) / idle TTL → `test -- counter` 통과 | ZSET score=타임스탬프 로 범위삭제 윈도우 유지; 고정 윈도우 경계 스파이크(최대 2배 누락); 파이프라인 원자 읽기; 주입식 시계로 결정론 |
| 9 | 카운터 배선 + 임계값 감지(로그만) | `POST /errors` 저장 직후 `counter.record()`; 반환 > 임계값이면 구조화 로그 한 줄(`service`, `count`, `window`); 알림·cooldown 아직 없음 → 같은 service 11회 POST 시 초과 로그 1회+ | 관측 먼저 → 행동 나중, 부수효과를 뒤 단계로 |

### Phase 3 — 시뮬레이터

| # | 태스크 | 핵심 할 일 → 검증 | 개념 |
|---|---|---|---|
| 10 | `tools/simulator.ts` | 가짜 서비스 목록 + 서비스별 에러율; 지수 분포 간격으로 `POST /errors` 반복; `--rate`/`--duration`/`--spike <svc>`/`--url`; `--spike` 는 임계값 초과 버스트; 종료 시 전송 건수 요약 → `--duration 10s` 후 데이터 축적, `--spike checkout` 시 T9 초과 로그 | 부하 생성기를 리포에 두면 대시보드·알림·k6 데모 가능; 지수 분포 간격 ≈ 포아송 트래픽 |

### Phase 4 — 알림 발송

| # | 태스크 | 핵심 할 일 → 검증 | 개념 |
|---|---|---|---|
| 11 | Cooldown 서비스 | `tryAcquire(service)→boolean` = `SET cooldown:<svc> 1 NX EX <sec>` 결과 판정; 유닛: 1차 true / 윈도우 내 2차 false / 짧은 TTL 만료 후 true → `test -- cooldown` 통과 | `SET NX EX` 원자성으로 분산 락 안전, GET-후-SET 레이스, cooldown 이 알림 폭풍 억제 |
| 12 | `alerts`·`alert_failures` + BullMQ | 마이그레이션 2건(`alerts`: id·service·count·threshold·window_ms·status·at / `alert_failures`: id·service·payload jsonb·error·attempts·failed_at); 큐 `alerts`(Redis 재사용); 임계값 초과 && `tryAcquire` 성공 → 잡 추가; 워커: `WEBHOOK_URL` 있으면 POST, 없으면 로그; attempts 5·지수 백오프+지터; `completed`→`alerts` 행, 최종 `failed`→`alert_failures` 행 → `--spike` 시 `alerts` 1행, 폭주에도 추가 없음; `WEBHOOK_URL` 404 시 재시도 5회 후 실패 행 | 큐가 수집/발송 지연 분리, at-least-once, 지터로 thundering herd 방지, DLQ 대신 실패 테이블 트레이드 |
| 13 | 멱등성 키 + 지연 로깅 | webhook 에 멱등성 키 헤더(`<service>:<윈도우시작 epoch>`); `POST /errors` 수신~enqueue(또는 판정 종료) 측정; pino 한 줄: `service`·`count`·`path`(`redis`/`db-fallback`)·`enqueued`·`latencyMs` → 로그에 `path`·`latencyMs`, 목 서버에 멱등성 헤더 도착 | at-least-once 소비자 멱등성 필수, 메트릭 스택 없이 로그 필드로 경로별 지연 비교 |

### Phase 5 — Redis 장애 fallback

| # | 태스크 | 핵심 할 일 → 검증 | 개념 |
|---|---|---|---|
| 14 | 헬스 플래그 + `DbCountCounter` + 경로 선택 | `RedisHealthService`: 5초 PING + 커맨드 에러 훅 → `healthy`; `DbCountCounter`: `error_logs` `created_at > now()-interval` COUNT; `CounterSelector`: `healthy` 면 Redis 아니면 DB; `healthy=false`+임계값 초과 시 enqueue skip + `alert suppressed: redis down` 로그(스펙 4.5); 유닛: 플래그별 라우팅 → `test -- selector` 통과; redis stop 후 시뮬레이터 지속 → `path:"db-fallback"` 로그, POST 여전히 201 | graceful degradation, fail-open vs fail-close(알림 시스템은 fail-open), 이 규모엔 플래그로 충분·풀 서킷브레이커 과함 |
| 15 | `/health` degraded 배선 | DB 실패 503; DB+Redis 정상 200 `ok`; DB 정상+Redis 다운 200 `{status:'degraded', redis:'down'}` → redis stop 시 `degraded`+200, DB stop 시 503 | 헬스체크가 "살아있음" vs "완전 정상" 구분, LB/오케스트레이터가 쓰는 신호 |

### Phase 6 — 대시보드 엔드포인트

| # | 태스크 | 핵심 할 일 → 검증 | 개념 |
|---|---|---|---|
| 16 | `GET /stats`·`/status`·`/alerts` | `/stats` 고정 인터벌(기본 1분) 버킷 카운트(`StatsResponse` 형태); `/status` 최근 24h distinct service 별 윈도우 카운트 + cooldown TTL; `/alerts` `alerts`+`alert_failures` 시간 역순 + `limit`; e2e 세트(스펙 6절): 버스트→알림 1회·`alert_failures` 빔·`GET /errors` N행·`/status` cooldown 활성 → 세 응답 shared 스키마 parse 통과, `test:e2e` 초록 | 대시보드용 읽기 모델을 원장 조회와 분리, SQL 시간 버킷팅 |

### Phase 7 — 기본기

| # | 태스크 | 핵심 할 일 → 검증 | 개념 |
|---|---|---|---|
| 17 | GitHub Actions CI | `push`·`pull_request` 트리거; pnpm 캐시 + `install --frozen-lockfile`; `turbo lint`; pg·redis 서비스 컨테이너 + 마이그레이션 후 `turbo test` → 푸시 시 Actions 초록, lint 에러 넣으면 빨강 | CI 서비스 컨테이너로 로컬 compose 환경 재현, `frozen-lockfile` |
| 18 | Swagger | `@nestjs/swagger` 셋업, `/docs` UI + `/docs-json`; 엔드포인트 요약·응답 스키마 주석 → `curl /docs-json` 모든 경로, `/docs` 렌더 | 코드에서 OpenAPI 파생, 문서 드리프트 감소 |
| 19 | pino 전면 적용 | `nestjs-pino` 도입, 기본 로거 교체; dev pretty/prod JSON; 앞서 심은 커스텀 로그 포맷 정리 → dev pino 포맷, `NODE_ENV=production` JSON 한 줄 | 구조화 로그의 grep·집계 이점, 요청 스코프 로거·correlation id |
| 20 | 보안 마무리 | `helmet`; CORS `CORS_ORIGIN` env 명시; `@nestjs/throttler` `POST /errors` IP 분당 100회; `.env.example` 에 쓰는 모든 변수 + 주석 → 연타 시 429, 미허용 Origin 차단, `.env.example`↔코드 env 키 1:1 | 레이트리밋을 수집 엔드포인트에(남용 표면), CORS 와일드카드 금지 |
| 21 | README | mermaid 다이어그램(수집→카운터→임계값→cooldown→큐→워커→webhook, Redis 다운 fallback 분기); "설계 근거" 절(슬라이딩 vs 고정 / BullMQ 재시도 vs 인프로세스 / fail-open vs fail-close / cooldown `SET NX EX`); `docker compose up` + curl 예시; 시뮬레이터 사용법 → mermaid 렌더, curl 예시 그대로 동작 | 설계 "왜"를 코드보다 오래 남김, 다이어그램으로 장애 분기 |

### Phase 8 — 프론트 개요 대시보드

| # | 태스크 | 핵심 할 일 → 검증 | 개념 |
|---|---|---|---|
| 22 | API 클라이언트 + 쿼리/상태 | fetch 래퍼: 응답을 shared 스키마 parse, 실패 시 타입 붙은 에러 throw; TanStack Query Provider(`staleTime`·`refetchInterval` 5초); Zustand: 선택 서비스·기간만; `/stats`·`/status`·`/alerts` 쿼리 훅 → 5초 폴링·parse 통과, 백엔드 끄면 에러 상태 | 서버 상태(Query) vs UI 상태(Zustand) 분리, 공유 타입 있어도 경계 parse, `staleTime` vs `refetchInterval` |
| 23 | 레이아웃 셸 + 스탯 타일 | 상단바(제목·기간·폴링 인디케이터); 타일 4개(최근 60분 에러 / 24h 알림·실패 구분 / cooldown 중 서비스 수 / p95 수집→알림); 시맨틱 마크업(`main`, 제목 있는 `section`) → 실데이터로 숫자 채움, 없을 때 0 | 요약 먼저·상세 나중, 상태를 색·칩 형태로도 인코딩 |
| 24 | 에러 추이 라인차트 | recharts 멀티시리즈, `/stats` 바인딩; 임계값 기준선·흐린 그리드·끝점 강조; 서비스 선택 Zustand 연동 → `--spike` 시 해당 라인이 임계선 돌파 | 차트도 디자인 대상(면 채움·그리드·끝점), 시계열 바인딩·리렌더 비용 |
| 25 | Cooldown 패널 | `/status` 에서 cooldown 활성 서비스 + 남은 TTL; 시간 바/카운트다운 → `--spike` 직후 cooldown 표시·TTL 감소 | 폴링 주기와 TTL 표시 불일치 처리(보간 vs 폴링값) |
| 26 | 최근 알림 테이블 | `/alerts` 바인딩 최신순; dispatched/failed 칩 + 실패행 좌측 스트라이프; 컬럼 시각·서비스·상태·rate·attempts·상세; `aria-live` 로 새 행 안내 → 실패행 구분, 새 알림 시 스크린리더 안내 | 상태를 색+형태 이중 인코딩, `aria-live` politeness |
| 27 | 로딩/에러/빈 상태 + 접근성 | 각 패널 독립 로딩(스켈레톤)/에러/빈 렌더; parse 실패 → 해당 패널 에러; 포커스 링·탭 순서·대비; `prefers-reduced-motion` 존중 → 백엔드 끄면 패널별 에러(전체 크래시 X), 0건이면 빈 상태, 키보드만으로 탐색 | 패널 단위 에러 격리, 로딩/빈/에러는 기능이지 곁다리 아님 |

### Phase 9 — 통합 실행

| # | 태스크 | 핵심 할 일 → 검증 | 개념 |
|---|---|---|---|
| 28 | `docker-compose.yml` 풀스택 | `postgres`·`redis`(볼륨·헬스체크); `backend` Dockerfile + 엔트리포인트(둘 healthy 후 `migration:run`→앱); `frontend` Dockerfile(프로덕션 빌드·서버, API URL 주입); `.env` 한 벌로 기동 → 클린 상태 `docker compose up` 후 대시보드 접속, 호스트에서 `simulator --spike checkout` 시 추이·cooldown·알림 5초 폴링 반영 | 마이그레이션을 엔트리포인트에(컨테이너=스키마 최신), 헬스체크 + `depends_on: service_healthy` 로 기동 순서 |

## 스트레치 (코어 완료 후, 이 순서 — 착수 시 플랜 별도)

1. 고정 윈도우 카운터(`CounterStrategy` 뒤 INCR+EXPIRE, env 전략 선택, README 비교)
2. 성능 리포트: `GET /metrics/latency`(redis vs fallback p50/p95) + `/report` 비교 차트
3. Auth.js 관리자 로그인으로 대시보드 라우트 보호
4. `/radar` 3D 레이더(react-three-fiber + drei), 별도 라우트 격리
5. k6 스크립트(100 rps, p95) + cooldown 전/후 알림 횟수 비교

## 리뷰 결과 (2회)

- **1차 스펙 커버리지:** 스펙 2·3절 코어 + 4.1~4.7 + 5~8절 전 항목이 T1~T28 에
  매핑됨. 누락 없음. 스펙 4.5 "alert suppressed" 로그를 T14 에 명시 항목으로 추가.
- **2차 순서·일관성:** 순서 버그 1건 수정 — e2e 있는 수집 엔드포인트(T7)가 테스트
  하네스(T6)보다 앞이었음 → 하네스를 먼저로 재배치. 네이밍(`CounterStrategy`·
  `record`·`alerts`/`alert_failures`·`healthy`) 및 기본값(10/60000ms) 단일 정의
  확인. "적절한 처리" 류 모호 표현 없음, 모든 태스크에 실행 가능한 검증 있음.
  잔여 구현 선택(T2 빌드 도구, T16 시간 버킷팅 방식)은 실행자 재량으로 남김.
