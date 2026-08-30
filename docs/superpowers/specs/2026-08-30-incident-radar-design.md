# Incident Radar — 설계 스펙

작성일: 2026-08-30 · 상태: 플랜 작성 승인됨

## 1. 목적

실시간 에러 모니터링·알림 서비스. 서비스들이 에러를 보고하면 슬라이딩 시간 윈도우 안에서 서비스별 에러 수가 임계값을 넘을 때 알림을 비동기로 발송한다. 중복 알림은 cooldown으로 억제하고 발송 실패는 지수 백오프로 재시도한다. Redis 불가용 시 에러 카운팅은 DB 쿼리로 fallback 하여 임계값 감지는 계속되지만, 알림 발송은 Redis 복구 전까지 일시 정지한다(4.5). pnpm + Turborepo 모노레포이며 NestJS 백엔드, Next.js 프론트 대시보드, 두 앱이 함께 쓰는 공유 패키지(API 계약의 단일 출처)로 구성한다.

## 2. 범위

### 코어

- 에러 수집·이력 조회. 수집구는 `POST /errors` 하나이며, 데모·개발용 데이터는
  트래픽 시뮬레이터(3절)가 생성한다
- Redis Sorted Set 기반 서비스별 슬라이딩 윈도우 카운팅
- 임계값 감지 → BullMQ 비동기 알림, 지수 백오프 재시도, 소진 시 실패 이력 저장
- cooldown 기반 중복 알림 억제
- Redis 헬스 프로브 + 다운 시 DB COUNT 쿼리로 fallback
- 수집→알림 enqueue 구간 지연시간 로깅(경로 `redis`/`db-fallback` 태깅)
- 기본기: 유닛 테스트, e2e 1세트, GitHub Actions CI(lint+test), TypeORM
  마이그레이션(synchronize 금지), @nestjs/swagger 문서, nestjs-pino 로깅, `/health`,
  helmet, 명시적 CORS, `.env.example`, `POST /errors` IP 레이트리밋, mermaid
  다이어그램·설계 근거를 담은 README
- 프론트 개요 대시보드: 에러 추이 라인차트, cooldown 상태, 최근 알림 테이블. 각 패널
  로딩/에러/빈 상태, 모든 응답 Zod 런타임 검증
- Postgres·Redis·backend·frontend를 한 번에 띄우는 docker-compose

### 스트레치 (코어 완료 후, 이 우선순위 순)

1. 고정 윈도우 카운터 구현체를 같은 인터페이스 뒤에 추가 + README 비교 노트
2. 성능 리포트 페이지 + Redis vs DB fallback 지연시간 비교 엔드포인트
3. Auth.js 관리자 로그인으로 대시보드 보호
4. `/radar` 3D 서비스 레이더(react-three-fiber + drei)
5. k6 부하 스크립트(100 rps, p95) + cooldown 전/후 알림 횟수 비교 스크립트

카운터 인터페이스는 코어에 슬라이딩 구현만 넣는다. 투기적 추상화가 아니라 fallback 경로(4.5)가 이미 런타임에 두 번째 구현을 골라야 하므로 seam이 바로 값을 한다.

## 3. 트래픽 시뮬레이터

`tools/simulator.ts` — 리포에 포함된 단일 스크립트. 로컬 개발, 대시보드 데모,
스트레치의 k6 스크립트 토대로 재사용한다.

- 고정된 가짜 서비스 목록(`checkout`, `auth`, `payments`, `search` 등)
- 서비스별 기본 에러율을 두고, 지수 분포 간격으로 `POST /errors` 호출
- `--spike <service>` — 한 서비스에 임계값 초과 버스트를 쏴 알림·cooldown 경로를 즉시 시연
- `--rate`, `--duration` 등으로 부하 조절
- 대상 URL은 env로 주입, 인증 없음(레이트리밋만 통과하면 됨)

## 4. 백엔드 설계

### 4.1 수집과 이력

`POST /errors`는 본문 `{ service, message }`를 공유 스키마로 검증 후 `error_logs`에 저장한다. `GET /errors`는 `service`(필수)·`from`/`to`(선택 ISO)·`limit`(기본 100, 상한 1000)로 조회한다. `error_logs`에 `(service, created_at)` 복합 인덱스를 둔다.

### 4.2 슬라이딩 윈도우 카운터 (Redis)

서비스별 Sorted Set 키에 이벤트 추가 → 윈도우보다 오래된 항목 제거 → 현재 개수 조회 → 안전용 TTL 갱신을 파이프라인으로 묶어 일관된 상태로 읽는다. 카운터는 공통 인터페이스 뒤에 두어 fallback 구현과 교체 가능하게 한다. 고정 윈도우(INCR+EXPIRE) 방식은 경계에 걸친 버스트를 임계값의 최대 2배까지 놓칠 수 있어 Sorted Set을 쓴다.

### 4.3 임계값 감지와 cooldown

현재 개수가 전역 임계값(기본 10건 / 60초 윈도우)을 넘으면 알림 후보다. 서비스별 임계값은 후속 확장. enqueue 전에 `SET cooldown:<service> ... NX EX`로 락을 시도해 성공하면 enqueue, 이미 있으면 조용히 skip 한다(단일 원자 연산이라 GET 후 SET의 레이스를 피함).

### 4.4 알림 발송 (BullMQ)

Redis 위 `alerts` 큐에 임계값 경로가 잡을 넣는다. 워커는 설정된 webhook URL을 호출하고 URL이 없으면 구조화 로그로 대체한다. 재시도 5회, 지수 백오프(1·2·4·8·16초) + 동기화 재시도를 피하는 소량 지터. 성공은 `alerts` 테이블, 최종 실패는 `alert_failures` 테이블(페이로드·마지막 에러·시도 횟수)에 기록한다 — 실패 이력을 별도 테이블로 둔 건 원본 요구이며 `alerts`를 넓히지 않고 전체 실패 레코드를 조회하기 위함. webhook 호출에 멱등성 키를 헤더로 실어 재시도 중복 전달을 수신 측이 식별한다.

### 4.5 Redis 장애와 DB fallback

헬스 컴포넌트가 5초마다 Redis를 확인하고 커맨드 연결 오류 시에도 플래그를 내린다. 플래그에 따라 카운터를 호출 단위로 선택한다: 정상이면 Redis 슬라이딩, 아니면 DB COUNT 쿼리(고정 인터벌 기준, sub-second 정밀도 없음, DB 부하 증가). 알림 시스템에서 "Redis 죽으면 닫아버리기"가 더 나쁘므로 이 절충을 수용한다. cooldown과 발송은 Redis(BullMQ)가 필요하므로 다운 중에는 감지·로깅만 계속되고 enqueue는 skip하며 "alert suppressed" 로그를 남긴다. 카운팅은 graceful degrade, 알림 경로는 사실상 일시 정지 — 이 스코프의 알려진 한계이며 더 완전한 설계는 Redis 복구 시 비우는 DB 아웃박스를 쓴다. 이 규모엔 플래그로 충분하고 풀 서킷 브레이커는 과하다.

### 4.6 지연시간 로깅

`POST /errors` 수신 시각과 알림 enqueue 시각(또는 enqueue 없이 임계값 경로 종료 시각)을 재서 pino 구조화 로그 한 줄로 남긴다: 서비스·개수·경로·enqueue 여부·지연 ms. 메트릭 스택 없이 두 카운팅 경로 지연 비교의 근거가 된다.

### 4.7 대시보드 지원 엔드포인트

- `GET /stats?service=&from=&to=&bucket=` — 인터벌(`bucket` 기본 1분)로 버킷팅한
  에러 수(트렌드 차트용)
- `GET /status` — 알려진 서비스(최근 24시간 `error_logs`의 distinct service)마다
  현재 윈도우 개수와 cooldown 활성 여부·TTL
- `GET /alerts` — `alerts`(dispatched)와 `alert_failures`(failed)를 시간 역순으로
  합친 최근 이력

## 5. 공유 패키지 (`packages/shared`)

`ErrorLogInput`, `ErrorLog`, `Alert`, `ServiceStatus`, `StatsResponse`, `AlertFailure` 스키마와 파생 타입을 한 모듈에서 정의·재수출한다. `Alert`은 `alerts` 또는 `alert_failures` 한 행을 표현하며 `status`에 따라 채워지는 필드가 다르다. 백엔드는 입력 스키마를 검증에 쓰고, 프론트는 모든 응답을 응답 스키마로 파싱한다. 타입을 공유해도 구동 중 서버는 컴파일러가 못 본 걸 반환할 수 있어(스키마 드리프트·직렬화 버그·프록시 에러 본문) 경계 파싱이 필요하다.

## 6. 기본기

- **테스트** — 유닛(Jest): 슬라이딩 카운트(윈도우 내 포함·오래된 것 트리밍·경계값),
  cooldown(1차 통과 / 윈도우 내 2차 skip / TTL 만료 후 재획득), fallback 선택(플래그
  라우팅). `now()` 프로바이더 주입으로 sleep 없는 결정론적 테스트. 카운터 통합
  테스트는 목이 아닌 실제 Redis·Postgres — CI는 서비스 컨테이너, 로컬은
  `docker-compose.test.yml`. e2e(supertest, 1세트): 임계값 초과 버스트 → 알림 정확히
  1회(나머지 cooldown), `alert_failures` 비어 있음, `GET /errors` N행, `GET /status`
  cooldown 활성 표시.
- **CI** — GitHub Actions, push·PR: 의존성 설치 → `turbo lint` → `postgres`·`redis`
  서비스 컨테이너를 띄운 채 `turbo test`.
- **마이그레이션** — synchronize 끔, 마이그레이션 파일 커밋. 백엔드 컨테이너
  엔트리포인트가 앱 기동 전에·CI가 테스트 전에 실행.
- **API 문서** — `@nestjs/swagger`로 `/docs` 서빙, JSON은 `/docs-json`.
- **관측성** — `nestjs-pino`(dev pretty, prod JSON). `GET /health`는 DB 다운이면
  503, DB 정상이면 200에 `ok`/`degraded`(Redis 다운이면 degraded — 카운팅은
  fallback, 알림은 정지). Redis 다운만으로는 실패로 치지 않음.
- **보안** — `helmet`. CORS는 `CORS_ORIGIN` env로 명시(`origin: true` 금지).
  `.env.example`에 모든 변수를 플레이스홀더로, 실제 `.env`는 gitignore.
  `@nestjs/throttler`를 `POST /errors`에 IP 기준 적용 — 한도는 `RATE_LIMIT_PER_MIN`
  (기본 600), `X-Load-Test` 헤더가 붙은 요청은 스킵(시뮬레이터·k6 부하 트래픽용).
- **프론트 테스트** — 핵심 로직만 Vitest 유닛(응답 parse 래퍼, 쿼리 훅, 파생 로직).
  렌더링/E2E 테스트는 범위 밖.
- **README** — mermaid 아키텍처 다이어그램(수집 → 카운터 → 임계값 → cooldown → 큐 →
  워커 → webhook, Redis 다운 fallback 분기). "설계 근거" 절: 슬라이딩 vs 고정 윈도우,
  BullMQ+백오프+실패 테이블 vs 인프로세스 재시도, fallback fail-open vs fail-close,
  cooldown의 `SET NX EX`. 로컬 실행법과 엔드포인트별 curl 예시.

## 7. 프론트엔드 설계

스택: Next.js(App Router) + TS, Tailwind, shadcn/ui, TanStack Query(5초 폴링), Zustand(UI 상태만 — 선택 서비스·기간), recharts. 단일 라우트 `/`에 3개 패널: 에러 추이 라인차트(`/stats`), cooldown 상태(`/status`, 남은 TTL), 최근 알림 테이블(`/alerts`, 최신순, 실패 구분). 각 패널이 독립적으로 로딩·에러·빈 상태를 렌더하고, 모든 응답은 컴포넌트 상태로 들어가기 전에 공유 스키마로 파싱한다(실패 시 해당 패널 에러 상태). 접근성: 시맨틱 랜드마크, 키보드 포커스 스타일 유지, 알림 테이블을 `aria-live` 영역으로 감싸 새 행을 읽어줌. 서버 상태(TanStack Query)와 임시 UI 상태(Zustand)를 분리한다.

## 8. docker-compose

`postgres`(명명 볼륨·헬스체크), `redis`(헬스체크), `backend`(둘이 healthy 해야 시작, 엔트리포인트가 마이그레이션 후 앱 기동), `frontend`(`backend` 의존, Next.js 프로덕션 서버). 모든 설정은 `.env.example`에 문서화된 환경변수. 시뮬레이터는 compose에 포함하지 않고 호스트에서 실행한다.

## 9. 실행 순서

각 단계는 시연 가능한 결과로 끝난다.

1. 스캐폴딩: pnpm 워크스페이스 + Turborepo + 세 패키지, `git init`. `pnpm dev`로 양쪽
   앱 부팅 확인
2. `packages/shared`: Zod 스키마 작성, 백엔드에서 타입 import·타입체크 통과 확인
3. 백엔드 수집: 첫 마이그레이션, `error_logs`, `POST`/`GET /errors`, curl 확인
4. `tools/simulator.ts` 작성. 실행해서 `error_logs`에 데이터가 쌓이는지 확인
5. Redis 슬라이딩 카운터 + 임계값 감지(로그만). 시뮬레이터로 카운트 로그 확인
6. cooldown + BullMQ 알림 + 재시도 + `alert_failures`. `--spike`로 알림 1회, webhook
   강제 실패로 백오프 재시도 후 실패 행 확인
7. Redis 다운 fallback: redis 정지 후 시뮬레이터 유지, `db-fallback` 로그와 수집 정상
   동작 확인
8. 기본기(순서대로): 테스트 → CI → Swagger → pino+`/health` → 보안 → README
9. 프론트 개요 대시보드 → docker-compose 전체 스택 기동 → 스트레치를 2절 우선순위 순

구현 플랜에서 각 단계를 5~15분 세부 태스크로 쪼개고 태스크마다 짚을 개념을 태깅한다.
