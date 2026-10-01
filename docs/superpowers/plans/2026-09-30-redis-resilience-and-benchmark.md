# Redis 장애 대응 보강 + 성능 측정 계획

작성일: 2026-09-30 · 상태: **확정 (2026-09-30 컨펌)** · 진행: Step 3 완료

## 목적

Redis 장애 시 동작이 README에 적힌 설계(fail-open)와 실제로 일치하게 만들고,
그 결과를 수치로 확인한다.

## 다룰 문제 3개

| # | 문제 | 성격 | 한 줄 요약 |
|---|---|---|---|
| 1 | Redis 다운 시 알림이 안 나감 | 설계-구현 불일치 | README는 fail-open이라 하지만, 실제로는 알림 발송을 건너뛴다 |
| 2 | Redis가 죽는 순간 처리 중이던 요청이 500 | **버그** | 폴백이 "요청 시작 전"에만 결정되고, 처리 도중 실패는 우회하지 못한다. Step 0에서 "느린 실패"와 "큐 적재 대기"도 발견되어 범위에 포함 |
| 3 | 성능·장애 수치가 없음 | 증명 부족 | 처리량, 지연, 장애 시 에러율을 잰 적이 없다 |

## 진행 순서

```
Step 0  측정 (수정 전 기준값)
Step 1  문제 2 수정 (버그)
Step 2  문제 1 수정 (설계 보강)
Step 3  재측정 + README 반영
```

**순서를 이렇게 정한 이유**

- **측정이 맨 앞인 이유:** 수정 전 수치가 있어야 전후를 비교할 수 있다. 특히 "Redis가 죽는 순간의 5xx 건수"는 문제 2를 고치면 더는 측정할 수 없다.
- **문제 2가 먼저인 이유:** 결정할 것이 없는 순수한 버그이고 범위도 작다. 게다가 문제 1(Redis 다운 경로에서의 발송)은 "Redis 다운 경로로 제대로 넘어가는 것"을 전제로 한다. 그 전제가 문제 2다.
- **재측정이 맨 끝인 이유:** 문제 1도 Redis 다운 시의 응답 특성을 바꾼다. 둘 다 반영한 뒤에 한 번만 잰다.
- 문제 1과 2의 순서는 바꿔도 결과에 큰 차이가 없다. **"수정 전에 측정한다"만 반드시 지킨다.**

---

## Step 0. 측정: 수정 전 기준값

### 환경
- `docker compose` 풀스택을 사용한다 (backend는 production 빌드).
- 로컬 Mac(colima)에서 돌린다. **머신 사양과 colima CPU/메모리 할당을 기록한다.**
- 수치는 절대 성능이 아니라 **같은 환경에서의 전후 비교용**이다. README에도 그렇게 명시한다.

### 도구
- `autocannon`을 `npx`로 실행한다. 프로젝트 의존성은 추가하지 않는다.
- 출력에서 RPS, 지연(p50 / p99), non-2xx 건수, 에러(타임아웃·연결 실패) 건수를 기록한다.

### 준비
- `RATE_LIMIT_PER_MIN`을 부하 수준보다 크게 올린다. 기본값 600/분이면 부하가 전부 429로 막힌다. `.env`는 건드리지 않고 측정 전용 compose override 파일로 덮어쓴다 (아래 "재현 조건").
- API 키를 발급한다: compose 컨테이너 안에서 `seed:api-key`를 실행한다.
- 매 실행 전에 Redis(`FLUSHALL`)와 `error_logs`·`alerts`·`alert_failures`를 비운다. 특히 `error_logs`의 누적 행 수는 DB 폴백 COUNT 비용에 영향을 준다.

### 부하 형태 (공통)
- 동시 연결 50, 30초.
- 요청 body는 단일 service로 보낸다. 임계값을 계속 넘는 "장애 상황"을 재현하기 위해서다.
- 각 시나리오를 3회 돌리고 **중앙값**을 기록한다.

### 시나리오

| # | 시나리오 | 방법 | 보는 것 |
|---|---|---|---|
| ① | 정상 | Redis 정상 상태로 부하 | 기본 RPS, p50/p99 |
| ② | Redis 다운 (DB 폴백) | Redis를 죽인 뒤, 헬스 플래그가 내려가도록 7초 기다렸다가 부하 | ①과 비교한 폴백 비용 (요청마다 COUNT 쿼리) |
| ③ | 부하 중 Redis 장애 | 부하 도중 `docker compose kill redis`, 10초 뒤 `start` (실측: 부하 시작 약 8초 지점에 kill) | 5xx 건수, 지연 스파이크, 복구 후 정상화 여부 |

- ③은 `stop`(정상 종료)이 아니라 `kill`(강제 종료)을 쓴다. 실제 장애에 더 가깝다.
- ③에서 backend 로그의 헬스 플래그 전환 시각과 5xx가 발생한 구간을 대조한다. (실측: 플래그가 내려갈 때는 로그가 남지 않아서 대조하지 못했다. 아래 "확인된 것" 5번)

### 예상과 분기
- **예상:** ③에서 kill 직후 짧은 구간에 5xx가 발생한다 (문제 2).
- **5xx가 0건이면:** 실제 영향 구간이 매우 짧다는 뜻이다. 문제 2는 Step 1의 재현 테스트로 증명하고 수정한다. README에는 측정값을 있는 그대로 적는다.
- **확인할 것:** ③에서 5xx 대신 **응답이 멈추는(타임아웃) 현상**이 나오는지 본다. 알림 큐(BullMQ)의 Redis 연결은 앱 Redis 연결과 설정이 달라서, 실패 대신 무한 대기할 가능성이 있다. 이 경우 Step 1의 범위를 다시 판단한다. (실측: 약 7초 대기. "확인된 것" 3번)

### 산출물
시나리오별 수치표. 이 단계에선 README에 넣지 않는다 (Step 3에서 전후 비교로 반영).

### Step 0 결과 (2026-09-30 측정 완료)

**환경:** Apple M1 (8코어, 16GB), colima 2 CPU / 4GB. autocannon은 호스트에서 실행.
compose production 빌드에 측정 전용 override(레이트리밋 해제, `WEBHOOK_URL` 비움)를
적용했다. 동시 연결 50, 30초, 단일 service.
원본 결과와 스크립트는 세션 임시 폴더에만 있었다 (레포 미포함, 세션 종료 시 사라짐). 다시 측정할 때는 아래 "재현 조건"을 따른다.

| 시나리오 | RPS (3회) | 중앙값 RPS | p50 | p99 | max | 실패 건수 (회차별) |
|---|---|---|---|---|---|---|
| ① 정상 | 560 / 663 / 743 | **663** | 67ms | 189ms | 285ms | 0 / 0 / 0 |
| ② Redis 다운 | 366 / 481 / 343 | **366** | 108ms | 508ms | 1.1s | 0 / **50** / 0 |
| ③ 부하 중 kill | 770 / 662 / 446 | **662** | 60ms | 328ms | **7.7s** | **6** / **2 (타임아웃)** / **3 (타임아웃)** |

- 실패 건수는 5xx와 클라이언트 타임아웃(10초)을 합친 값이다.
- 지연 수치는 중앙값 RPS 회차의 값이다. 회차 간 RPS 편차가 ±25%로 크다 (2 CPU VM이라 노이즈가 많다). 다만 ①과 ②의 차이는 모든 회차에서 일관된다 (② 최대 481 < ① 최소 560).

**확인된 것**

1. **문제 2 재현됨.** ③ 3회 모두에서 kill 이후 `Reached the max retries per request limit (which is 3)` 예외로 요청이 실패했다.
   - 1회차: 즉시 500 (6건).
   - 2·3회차: 요청이 **Redis가 다시 뜰 때까지 약 10초 동안 멈췄다가** 500이 됐다. 클라이언트(autocannon, 10초 제한)는 타임아웃으로 기록했다.
2. **② Redis 다운에서도 한 번 재현됨 (50건 = 동시 연결 수).** 실패한 50건의 예외가 Redis 명령 재시도 초과였다. DB 경로는 Redis를 쓰지 않으므로, kill 후 7초가 지났는데도 헬스 플래그가 아직 `true`였다고 추정한다. 그래서 첫 요청 50개가 Redis 경로로 갔다가 실패했다. 플래그가 늦게 내려가는 원인은 확인하지 못했다. PING도 같은 재시도에 묶여 늦게 실패하는 것으로 의심되고, A(`commandTimeout`)가 PING에도 적용되면 함께 개선될 수 있다.
3. **BullMQ enqueue가 실패 대신 멈춤 (계획의 "확인할 것" 적중).** ③ 3회 모두 Redis 복구 후 처음으로 cooldown 락을 잡고 알림을 적재한 요청이 **약 7초 걸렸다** (`path=redis enqueued=true latencyMs=7xxx`). 앱 Redis 연결은 복구돼서 헬스 플래그가 `true`인데, BullMQ의 별도 연결은 아직 재연결 중이라 `queue.add`가 기다렸다. **max 7.7초의 정체가 이것이다.**
4. **DB 폴백 비용:** ② 중앙값 기준 RPS가 약 45% 감소했고 p50은 67ms에서 108ms로 늘었다. 요청마다 COUNT 쿼리를 하기 때문이다.
5. **헬스 플래그가 내려갈 때 로그가 없다.** 로그를 세어보니 `redis 복구` 로그는 6건인데 `redis PING 실패` 로그는 0건이었다. ioredis 에러 이벤트가 플래그를 먼저 조용히 `false`로 바꾸고, PING 실패 경고는 "이전에 `true`였을 때"만 찍히기 때문이다. 장애 시각을 로그로 알 수 없다. → Step 1에서 에러 이벤트 쪽에도 전환 로그를 남긴다.
6. **(미확인) 복구 직후 처리량 저하.** ③ 2·3회차에서 Redis가 다시 뜬 뒤 몇 초간 초당 처리량이 수십~수백 건으로 떨어졌다. 1회차엔 없었다. 원인은 모른다. Step 3 재측정에서 다시 본다.

시각 자료(초 단위 타임라인): https://claude.ai/artifact/TGQnTWpNiuVeHqKL5WP9Jt
사본: `docs/superpowers/plans/2026-09-30-redis-bench-report.html`

**계획에 미치는 영향 → 결정: A, B 둘 다 Step 1에 포함 (2026-09-30)**
- **A. 실패가 "느리게" 온다.** try/catch만 추가하면 500은 사라지지만, 예외가 나기 전까지 수 초~10초를 기다리는 건 그대로다. → ioredis `commandTimeout`으로 빨리 실패하게 한다.
- **B. enqueue는 예외가 아니라 대기다.** try/catch로는 못 잡는다. → enqueue를 기다리지 않게 하고, 실패하면 degraded 경로로 넘긴다.

---

## Step 1. 문제 2: Redis가 죽는 순간 처리 중이던 요청이 500

### 정의
**버그다.**
- **기대 동작:** 에러 행 저장에 성공했다면, Redis 상태와 무관하게 `POST /errors`는 201을 반환한다.
- **실제 동작:** Redis가 죽는 순간 처리 중이던 요청은 500을 반환한다.

### 원인
Redis 경로를 탈지 DB 경로를 탈지는 `RedisHealthService.healthy` 플래그로 **요청 시작 시점에** 정해진다. 이 플래그는 5초 주기 PING과 ioredis 에러 이벤트로 갱신된다.

플래그가 아직 `true`일 때 들어온 요청은 Redis 경로로 가고, 그 도중 Redis가 죽으면 아래 세 곳 중 한 곳에서 예외가 난다. **세 곳 모두 예외를 잡지 않아서** 컨트롤러까지 올라가 500이 된다.

| 위치 | Redis 사용 | 파일 |
|---|---|---|
| a. 카운트 | 슬라이딩 윈도우 MULTI | `counter/counter.selector.ts` → `redis-sliding-window.counter.ts` |
| b. cooldown 락 | `SET NX EX` | `detector/detector.service.ts` → `cooldown/cooldown.service.ts` |
| c. 알림 큐 적재 | BullMQ `add` | `detector/detector.service.ts` → `alerts/alerts.service.ts` |

단, c는 Step 0 실측 결과 예외가 아니라 **대기**(약 7초)였다. 그래서 해결 방안 4번에서 따로 다룬다.

ioredis는 `maxRetriesPerRequest: 3`으로 재시도한 뒤 실패하므로, 실패하는 요청은 **응답도 느려진다** (실측 최대 약 10초).

### 영향
- 그 몇 초 사이에 에러를 보낸 클라이언트가 500을 받는다.
- **에러 행은 이미 저장된 상태다.** 컨트롤러는 저장 → 감지 순서로 동작한다. 그래서 클라이언트가 재전송하면 같은 에러가 중복 저장된다.
- `errors.controller.ts`의 주석("Redis·DB 둘 다 실패해야 500")이 사실과 다르다.

### 지금까지 발견되지 않은 이유
`test/fallback.e2e-spec.ts`는 헬스 플래그를 처음부터 `false`로 고정한다. "Redis가 처음부터 죽어 있는" 경우만 검증하고, "처리 도중 죽는" 경우는 검증한 적이 없다.

### 해결 방안
1. **카운트(a):** `CounterSelector`가 Redis 카운터 호출이 실패하면 **같은 요청 안에서** DB 카운터로 다시 센다.
2. **cooldown(b):** `DetectorService`가 cooldown 단계의 실패를 "Redis 다운"으로 간주하고 Redis 다운 경로로 넘긴다. 큐(c)는 4번에서 다룬다.
   - Step 1 시점에는 기존 동작대로 `alert suppressed` 로그를 남긴다.
   - Step 2 이후에는 degraded 발송(아래 문제 1)으로 넘긴다.
3. **빨리 실패 (A):** 앱 Redis 클라이언트(`redis/redis.service.ts`)에 `commandTimeout`(약 500ms)을 설정한다. 응답 없는 명령은 재연결을 기다리지 않고 바로 실패하고, 1·2번이 이를 받아 DB/degraded로 넘긴다.
   - **먼저 확인할 것:** 연결이 끊겨 오프라인 큐에서 대기 중인 명령에도 타임아웃이 적용되는가. 적용되지 않으면 대안(끊긴 동안 명령을 즉시 거부하는 설정)을 검토한다.
4. **enqueue를 기다리지 않음 (B):** 큐 적재 결과를 기다리지 않고 응답한다. BullMQ가 나중에 재연결에 성공하면 알림은 정상 경로로 나간다.
   - 적재가 실패하면 catch에서 처리한다. Step 1 시점에는 `alert suppressed` 로그를 남기고, Step 2 이후에는 `dispatch()`를 직접 호출한다. 이때는 Redis cooldown 락을 이미 잡은 상태이므로 메모리 cooldown을 다시 확인하지 않는다. (→ 2026-10-01 결정 7로 변경: 확인한다)
   - 기다리지 않는 적재가 쌓일 걱정은 없다. 적재는 cooldown 락을 잡은 요청만 하므로 서비스당 cooldown 기간(기본 300초)에 1건이다.
   - 세션 저장소(node-redis 별도 연결)는 `POST /errors`가 쓰지 않으므로 대상이 아니다.
5. **플래그 전환 로그:** ioredis 에러 이벤트로 플래그가 `true`에서 `false`로 바뀔 때도 경고 로그를 남긴다 (Step 0 발견 5).
6. **주석:** `errors.controller.ts` 주석을 실제 동작에 맞게 고친다.

### 검증 (테스트 먼저)
1. **재현 테스트(e2e)를 먼저 작성한다.** 헬스 플래그는 `true`인데 Redis 카운터가 예외를 던지도록 provider를 교체하고, `POST /errors`가 201을 반환하길 기대한다. **수정 전에 이 테스트가 실패(500)하는 것을 확인한다.**
2. cooldown이 예외를 던지는 경우도 같은 방식으로 재현 테스트를 작성한다.
3. enqueue가 끝나지 않는(영원히 대기하는) 경우에도 `POST /errors`가 바로 201을 반환하는 테스트를 작성한다.
4. 수정한다. `commandTimeout`은 실제 Redis 연결을 끊은 상태에서 명령(헬스 PING 포함)이 약 500ms 안에 실패하는지 확인한다.
   - 플래그 전환 로그는 기존 `redis-health.service.spec.ts`에 "에러 이벤트로 `false`가 될 때 경고 로그 1회" 케이스를 추가해 확인한다.
5. 재현 테스트와 기존 전체 테스트, lint, typecheck가 통과하는지 확인한다.

### 완료 조건
- 재현 테스트가 "수정 전 실패 → 수정 후 통과"로 기록된다.
- 기존 테스트가 전부 통과한다.

### Step 1 결과 (2026-10-01)

재현 테스트: `test/redis-midrequest.e2e-spec.ts`. 헬스 플래그는 실제 Redis 기준 `true`이고, Redis를 쓰는 단계 하나를 spy로 실패시키거나 무한 대기시킨다. 요청마다 1초 제한을 둔다.

| 케이스 | 수정 전 | 수정 후 |
|---|---|---|
| 카운트 단계 Redis 실패 | 500 | 201 (DB로 다시 셈, 에러 행 11건) |
| cooldown 단계 Redis 실패 | 500 | 201 (`alert suppressed` 로그) |
| 알림 큐 적재 무한 대기 | 1초 타임아웃 | 201 (적재를 기다리지 않음) |

- **`commandTimeout` 확인:** ioredis 5.11.1 소스상 `sendCommand`가 오프라인 큐에 넣기 전에 타임아웃을 건다. 그래서 대안 설정은 필요 없다. 테스트용 Redis를 `kill`한 뒤 직접 확인한 결과, MULTI와 `SET NX EX`는 503ms에 `Command timed out`으로 실패했고 PING은 8ms에 실패했다 (재시도 한도 초과).
- 전체 테스트 108개, lint, typecheck가 통과했다. 유닛 테스트로 selector 폴백, cooldown 실패, enqueue 실패 로그, 플래그 전환 로그 케이스를 추가했다.
- **Step 2로 넘기는 요구사항 (코드 리뷰 지적):** `commandTimeout`은 클라이언트 쪽에서만 포기한다. 그래서 Redis가 느린 경우에는 `SET NX EX`가 서버에서 실행됐는데 클라이언트는 실패로 받을 수 있다. 그러면 락 키가 남아서 이후 cooldown(300초) 동안 Redis 경로에서는 알림이 나가지 않는다. Step 2에서 cooldown 실패를 degraded 발송(메모리 cooldown + 직접 발송)으로 넘기면 이 경우에도 알림이 나간다. **Step 2 검증에 이 경우를 포함한다.**
- ingest 로그의 `enqueued=true`는 이제 "적재 성공"이 아니라 "적재 시도"를 뜻한다. 적재 실패는 별도 `alert suppressed: enqueue failed` 로그로 구분한다.
- **남은 것 (Step 3에서 확인):** 카운트가 요청 도중 DB로 폴백해도 `ingest` 로그의 `path` 라벨은 요청 시작 시점 기준이라 `redis`로 남는다.

---

## Step 2. 문제 1: Redis 다운 시 알림이 안 나감

### 정의
**설계-구현 불일치다.**
- README의 주장: "fail-close면 장애가 나도 아무도 모른다. 그래서 fail-open을 택했다."
- 실제 동작: Redis가 다운되면 감지(카운트)는 DB로 계속하지만, 임계값을 넘어도 `alert suppressed` 로그만 남기고 알림은 보내지 않는다.
- 결과적으로 사용자 입장에선 README가 피하려던 fail-close와 같다. `fallback.e2e-spec.ts`는 이 동작("알림 0건")을 정답으로 검증하고 있다.

### 원인
알림 경로 중 Redis에 의존하는 단계는 두 개뿐이다.

```
detector → cooldown 락 (Redis) → 알림 큐 (BullMQ/Redis) → 워커 → dispatch()
```

실제로 webhook을 보내는 `AlertsService.dispatch()`는 fetch와 Postgres만 쓰고 **Redis를 쓰지 않는다.** 당시에는 Redis 없이 webhook을 따로 연결하는 게 번거롭다고 판단했다. 하지만 이미 있는 `dispatch()`를 재사용하면 새로 연결할 것이 없다.

### 해결 방안
Redis 다운 경로(헬스 플래그가 `false`이거나, Step 1에서 cooldown 실패로 넘어온 경우)에서만 아래처럼 동작한다. 큐 적재 실패로 넘어온 경우는 Step 1의 4번대로 cooldown 없이 바로 발송한다 (→ 결정 7로 변경: 메모리 cooldown을 확인한다). **Redis 정상 경로는 바꾸지 않는다.**

```
detector → cooldown 락 (메모리) → dispatch() 직접 호출
```

1. **메모리 cooldown**
   - 서비스별 "cooldown 만료 시각"을 프로세스 메모리에 보관한다.
   - TTL은 기존과 같은 `ALERT_COOLDOWN_SEC`을 쓴다.
   - 시간은 기존 `Clock`으로 주입받아 테스트에서 고정할 수 있게 한다.
2. **직접 발송**
   - 락을 잡으면 큐를 거치지 않고 `dispatch()`를 호출한다.
   - **응답을 기다리지 않는다.** 장애 상황에서 webhook이 느리면 에러 수집 응답까지 느려지기 때문이다.
   - 발송이 실패하면 기존 `recordFailure()`로 `alert_failures`에 기록한다 (시도 횟수 1).
3. **로그:** `alert suppressed` 대신 degraded 발송 로그를 남긴다. 발송 경로를 구분할 수 있게 한다.

### 포기하는 것 (README에 한계로 명시)

| 항목 | 내용 |
|---|---|
| 재시도 | 큐가 없으므로 1회만 시도하고, 실패하면 `alert_failures`에 기록한다 |
| 다중 인스턴스 | 메모리 cooldown은 인스턴스마다 따로 동작한다. 인스턴스가 N대면 최대 N건 중복 알림이 갈 수 있다 |
| 경로 전환 시점 | Redis cooldown과 메모리 cooldown은 서로를 모른다. 그래서 Redis가 죽거나 살아나는 순간, 같은 장애에 대해 알림이 1건 더 갈 수 있다 |
| 프로세스 재시작 | 메모리 cooldown이 사라진다 |
| 발송 중 종료 | 기다리지 않는 발송이라 프로세스가 죽으면 그 알림은 유실된다 |

### 검증
1. **메모리 cooldown 유닛 테스트:** 첫 획득 성공 / TTL 안 재획득 실패 / TTL 후 재획득 성공.
2. **`fallback.e2e-spec.ts` 기대값 변경:** 에러 15건, 임계값 10일 때 기존 "알림 0건"을 "**알림 정확히 1건**"으로 바꾼다. 메모리 cooldown 덕분에 1건만 나가야 한다. webhook이 미설정이면 `dispatch()`는 로그만 남기고 `alerts` 행을 저장한다.
3. **발송 실패 시 유닛 테스트:** `dispatch()`가 예외를 던지도록 주입했을 때 `recordFailure()`가 1회 호출되는지 확인한다. e2e로 하려면 목 webhook 서버와 별도 앱 인스턴스가 필요해서 비용이 크다.
4. 전체 테스트, lint, typecheck가 통과하는지 확인한다.
5. **수동 확인:** 로컬에서 Redis를 끈 상태로 스파이크를 일으키고 Discord relay로 실제 알림이 도착하는지 확인한다. relay는 호스트의 `:8787`에서 뜨므로 backend도 호스트에서 실행하는 pnpm 개발 루프로 확인한다 (compose 컨테이너 안의 `localhost`는 호스트가 아니다).

### 문서 수정
- **README:** 첫 문단의 "알림 발송만 일시 정지", 아키텍처 다이어그램의 `alert suppressed` 노드, 설계 근거의 fail-open 문단을 실제 동작에 맞게 고친다. 위의 "포기하는 것"을 한계로 추가한다.
- **코드 주석:** `detector.service.ts`, `redis-health.service.ts`의 "알림 발송만 멈춘다" 주석을 고친다.

### 완료 조건
- Redis 다운 상태에서 임계값을 넘으면 알림이 정확히 1건 나간다 (e2e + 수동 확인).
- README와 주석이 실제 동작과 일치한다.

### Step 2 결과 (2026-10-01)

- **구현 위치:** 메모리 cooldown은 `DetectorService` 안의 Map이다. `Clock`이 이미 주입돼 있어서 모듈 배선을 바꿀 필요가 없었다. 직접 발송은 `AlertsService.dispatchDirect()`가 맡는다. 1회 발송하고, 실패하면 attempts=1로 기록하며, throw하지 않는다.
- **degraded 경로로 넘어가는 경우 3가지**
  - 헬스 플래그가 `false`: 메모리 cooldown을 확인한다.
  - cooldown 단계의 Redis 실패: 메모리 cooldown을 확인한다. Step 1 리뷰에서 지적한 "타임아웃으로 서버에 락이 남는 경우"가 여기에 해당한다.
  - 큐 적재 실패: 메모리 cooldown을 확인하지 않는다. (→ 결정 7로 변경)
- **테스트를 먼저 작성:** 수정 전에 5건이 실패했다. `dispatchDirect`가 없었고, degraded 경로가 없었고, fallback e2e의 알림이 0건이었다. 수정 후에는 전체 111개 테스트와 lint, typecheck가 통과했다. `--forceExit` 없이도 정상 종료한다.
- **fallback e2e:** 기대값을 "알림 0건"에서 "알림 정확히 1건, degraded 로그 1회"로 바꿨다.
- **수동 확인:** dev compose의 Redis를 `kill`하고 7초 뒤 `/health`가 `degraded`가 된 것을 확인했다. 그 상태에서 같은 서비스로 15건을 보냈다.
  - 15건 모두 201이었고, 응답 시간은 각각 5~30ms였다.
  - `alerts` 1행, `alert_failures` 0행이었다.
  - relay 로그에 `degraded-demo → discord 204`가 남았다.
  - 백엔드 로그에 Step 1에서 추가한 `redis 에러 이벤트 — healthy=false`도 찍혔다.
- **코드 리뷰 후 수정한 것**
  - webhook `fetch`에 5초 타임아웃을 걸었다. 응답 없는 webhook이면 degraded 1회 발송이 기본값(약 300초)만큼 걸려 있었다.
  - **이 타임아웃은 큐 경로에도 적용된다.** 큐 경로에서는 타임아웃이 실패로 바뀌어 BullMQ 재시도를 탄다. "정상 경로는 바꾸지 않는다"는 원칙에서 의도적으로 벗어난 것이다.
  - 큐 적재가 실패해서 직접 발송할 때도 메모리 cooldown을 잡도록 했다. 그 사이 Redis 다운 경로로 넘어간 요청이 같은 알림을 또 보내지 않게 하기 위해서다.
  - 남아 있던 "발송 skip" 주석 두 곳을 고쳤다.
  - "실패 기록까지 실패해도 throw하지 않는다" 테스트를 추가했다. 전체 테스트는 113개다.
- **README:** 첫 문단, 아키텍처 다이어그램(메모리 cooldown과 직접 발송 노드 추가, mermaid-cli로 렌더링 확인), fail-open 설계 근거, "degraded 발송이 포기하는 것" 목록을 고쳤다. `health.service.ts`와 `redis-health.service.ts`의 주석도 고쳤다.

---

## Step 3. 재측정 + README 반영

1. Step 0과 **같은 환경, 같은 시나리오, 같은 횟수**로 다시 측정한다 (아래 "재현 조건"). Step 0 측정 스크립트는 세션 임시 폴더에만 있었으므로, 재현 조건대로 다시 만든다.
   - 시각 자료 페이지에 "수정 후"를 추가해 전후를 나란히 비교한다.
2. ③에서 추가로 확인한다: Redis 장애 구간에도 degraded 알림이 1건 나가는지 (`alerts` 테이블의 생성 시각).
   - 예상 알림 수는 회차당 3건이다. kill 전 Redis 경로 1건, 장애 구간 degraded 1건("경로 전환 시점" 한계), 복구 후 1건(재시작한 Redis엔 cooldown 키가 없음). 이 숫자가 다르면 원인을 확인한다.
   - 수정 전 실측(③ 3회차): **2건**. kill 전(13:10:02 UTC) 1건과 복구 후(13:10:29 UTC, 적재 대기 7초 포함) 1건이고, 장애 구간(13:10:10~13:10:21)에는 0건이었다.
3. README에 "성능·장애 테스트" 섹션을 추가한다.
   - 측정 환경 (머신, colima 할당, 부하 형태). "전후 비교용 로컬 수치"라고 명시한다.
   - 시나리오 ①②③의 수정 전후 비교표.
   - 해석 2~3줄. 예: DB 폴백의 비용, 장애 순간 5xx 변화.
   - 재현 방법 (명령어).

### 완료 조건
- README에 전후 비교표가 있고, 누구나 같은 방법으로 재현할 수 있다.

### Step 3 진행 기록 (2026-10-01)

- **스크립트:** `tools/bench/run.sh`(측정), `summarize.mjs`(표와 타임라인), `bench.override.yml`.
  - 타임라인은 pino-http access log(요청별 상태 코드와 응답 시간)와 `ingest` 로그로 만든다.
- **1차 측정에서 알림 수가 기대(③ 3건)와 다르게 나왔다.** 원인은 두 가지였다.
  1. **스크립트 결함:** 회차 사이에 백엔드를 재시작하지 않아서, 메모리 cooldown이 다음 회차로 넘어갔다. 그래서 ② 2·3회차의 알림이 0건이었다. → `reset()`에서 백엔드를 재시작하도록 고쳤다.
  2. **실제 동작:** 타임아웃된 명령이 Redis 복구 후 다시 실행됐다.
     - 근거: 복구 직후 첫 카운트가 1이 아니라 7이었고, 임계값을 넘어도 cooldown 락을 잡지 못했다.
     - 원인: ioredis는 전송했지만 응답을 못 받은 채 연결이 끊긴 명령을 `prevCommandQueue`에 모아둔다. 그리고 재연결 때 다시 보낸다(`autoResendUnfulfilledCommands` 기본값 true). promise가 `commandTimeout`으로 이미 실패 처리됐어도 다시 보내고, `maxRetriesPerRequest`의 flush 대상도 아니다.
     - 결과: 타임아웃으로 실패 처리한 `SET cooldown NX EX 300`이 복구 직후 실행된다. 그러면 Redis 경로의 알림이 cooldown 동안 막힌다.
     - 처음엔 `enableOfflineQueue: false`를 검토했다. 그런데 재실행은 오프라인 큐가 아니라 "전송 후 응답 대기 중" 큐에서 일어난다는 게 확인됐다. 게다가 `enableOfflineQueue: false`는 첫 연결 전 명령을 즉시 실패시키는 부작용도 있었다. 그래서 `autoResendUnfulfilledCommands: false`로 정했다.
     - 재현(테스트용 Redis): `pause` → SET 전송 → `kill` → `unpause` → `start` 순서로 실행했다.
       - 기본값: 클라이언트는 500ms 타임아웃으로 실패했는데, 복구 후 키가 **존재**했다.
       - `false`: 복구 후 키가 **없었다**.
     - CI에서는 컨테이너 pause/kill이 불안정해서 수동 검증으로 남긴다.
- **2차 측정 무효:** Step 2 수동 확인 때 띄운 호스트 `pnpm dev`(nest watch)가 남아 있었다. 그 watcher가 `redis.service.ts`를 고치자 앱을 다시 띄웠고, `localhost:3000`이 컨테이너가 아니라 이 프로세스로 갔다. dev 설정이라 레이트리밋이 600/분이어서 600건 이후는 전부 429였다. 프로세스를 정리하고 다시 쟀다. README의 재현 방법에 "포트 3000을 쓰는 다른 프로세스를 먼저 끈다"를 적었다.
- **Step 0 수치와 비교할 수 없다:** 회차마다 백엔드를 재시작하자, 같은 코드에서도 ① RPS가 732에서 1037로 바뀌었다. 조건 차이가 코드 차이와 섞이는 것이다. → 수정 전 코드(`61c2207`)를 git worktree에서 같은 스크립트로 다시 쟀다. README의 전후 비교는 이 수치를 쓴다.

### Step 3 결과 (2026-10-01, 같은 스크립트·같은 조건)

| 시나리오 | 중앙값 RPS (전 → 후) | p99 | max | 실패 (회차별) | 알림 (회차별) |
|---|---|---|---|---|---|
| ① 정상 | 936 → 1037 | 104 → 99ms | 425 → 348ms | 0/0/0 → 0/0/0 | 1/1/1 → 1/1/1 |
| ② Redis 다운 | 622 → 643 | 136 → 126ms | 462 → 341ms | 50/0/0 → 0/0/0 | 0/0/0 → 1/1/1 |
| ③ 부하 중 kill | 752 → 672 | 131 → 162ms | 4.6s → 1.1s | 2/5/100 → 0/0/0 | 2/2/2 → 3/3/3 |

- ③의 알림 시각(kill 기준)
  - 수정 전: 약 -8초, +18초. 장애 구간에는 0건이었다.
  - 수정 후: 3회 모두 약 -8초, +0.2초, +18초다. 계획에서 예상한 3건과 일치한다.
  - +18초 알림은 복구(+10초) 후 BullMQ 워커가 재연결되고 나서 저장된 것이다.
- 수정 전 ③ 3회차의 실패 100건은 복구 시점(+10초)에 500이 50건, 클라이언트 타임아웃이 50건이었다. 수정 후에는 모든 초에서 5xx가 0건이다.
- ① 정상의 약 10% 차이와 ③의 RPS 감소(752 → 672)는 원인을 확인하지 않았다. 정상 경로는 거의 바뀌지 않았으므로 README에 개선으로 쓰지 않는다.

### 재현 조건 (Step 0 실측 기준)

> Step 3부터는 `tools/bench/run.sh`가 재현 조건 그 자체다. 아래와 달라진 점이 두 가지 있다. 회차마다 백엔드를 재시작하고(대기는 `/health`가 `ok`가 될 때까지), 타임라인을 ExceptionsHandler 로그 대신 pino-http access log(상태 코드, 응답 시간)로 만든다.

- colima 2 CPU / 4GB. `docker compose` 풀스택(postgres, redis, backend)을 production 빌드로 실행한다.
- 측정 전용 compose override: backend에 `RATE_LIMIT_PER_MIN=1000000000`, `WEBHOOK_URL=` (빈 값) 두 개만 덮어쓴다.
- API 키: `docker compose exec backend pnpm seed:api-key bench`
- 매 실행 전: `redis` start → 7초 대기 → Redis `FLUSHALL` → `TRUNCATE error_logs, alerts, alert_failures`
- 부하: `npx autocannon@8 -c 50 -d 30 -m POST -j` (요청 타임아웃은 autocannon 기본값 10초) + 헤더(`content-type`, `authorization: Bearer <키>`) + body `{"service":"checkout","message":"bench"}` → `http://localhost:3000/errors`
- ②: 부하 전에 `docker compose kill redis` → 7초 대기
- ③: 부하와 동시에 백그라운드에서 10초 대기 → `kill redis` → 10초 대기 → `start redis`
- 시나리오당 3회, 중앙값. 워밍업 1회는 기록하지 않는다.
- 초 단위 타임라인은 backend 로그의 `ingest path=... latencyMs=...`와 `ExceptionsHandler` 로그를 kill 시각 기준으로 1초씩 묶어서 만든다.

---

## 이번 범위 밖

리뷰에서 나왔지만 이번엔 다루지 않는다. 필요하면 별도로 계획한다.

- 수집 경로 비동기화 (`POST /errors`를 202로 응답 + 감지를 워커로 분리)
- `error_logs` 보존 기간(retention) 정책
- `/status` N+1 쿼리, 서비스 필터 없는 `/stats`의 인덱스 미사용
- ~~ioredis 튜닝~~ → Step 0 결과로 Step 1에 편입됨 (`commandTimeout`).
- 배포와 데모 URL
- 커밋 트레일러, `docs/superpowers/`, 코드 내 도구 주석 정리

## 결정 사항

1. ~~degraded 발송을 기다리지 않는 방식(fire-and-forget)으로 해도 되는가?~~ → **결정: 예.** 장애 상황에서 webhook이 느려도 수집 응답이 막히지 않게 하기 위해서다. 정상 모드도 이미 "큐에 넣고 바로 응답"하므로 같은 원칙을 유지하는 것이기도 하다. 대가는 발송 중 프로세스가 죽으면 그 알림이 유실된다는 점이다.
2. ~~측정 원본 출력을 레포에 남길 것인가?~~ → **결정: README 표 + 재현 방법만 남긴다.**
   - **변경 (2026-10-01):** 측정 스크립트(`tools/bench/`)는 레포에 넣는다. 결과 원본(`tools/bench/out/`)은 계속 넣지 않는다 (`.gitignore`). 처음엔 스크립트도 세션 임시 폴더에만 두었는데, 세션이 끝나며 사라져서 Step 3에서 다시 작성해야 했기 때문이다.
3. ~~작업 방식~~ → **결정: 브랜치 + PR.**
4. ~~이 계획 문서를 커밋할 것인가?~~ → 처음엔 미커밋으로 정했다가 **변경: 커밋한다** (2026-09-30). 시각 자료 사본(`2026-09-30-redis-bench-report.html`)도 함께 커밋한다.
5. ~~Step 0에서 발견한 "느린 실패"와 "큐 적재 대기"를 Step 1에 넣을 것인가?~~ → **결정: 둘 다 넣는다** (A: `commandTimeout`, B: enqueue 기다리지 않음).
6. ~~재측정 중 발견한 "타임아웃된 명령이 복구 후 재실행되는 문제"를 고칠 것인가?~~ → **결정: 고친다** (2026-10-01). 옵션은 `autoResendUnfulfilledCommands: false`. 아래 Step 3 진행 기록 참고.
7. ~~큐 적재가 실패했을 때 메모리 cooldown을 확인할 것인가?~~ → **결정: 확인한다** (2026-10-01, 브랜치 전체 코드 리뷰 지적).
   - 재현 순서
     1. 요청 A가 Redis 락을 잡고 적재를 시작한다. BullMQ 연결은 빠른 실패 설정이 없어서 적재가 오래 멈춘다.
     2. 그 사이 Redis가 죽는다. 요청 B가 degraded로 1건을 보낸다.
     3. 나중에 A의 적재가 실패하면 catch가 1건을 더 보낸다. 늦게, 오래된 count로 간다.
   - 메모리 cooldown이 잡혀 있다는 건 최근 cooldown 안에 이미 알림이 나갔다는 뜻이다. 그러니 건너뛰는 게 cooldown의 의미와 맞다.
   - 단위 테스트로 재현했다 (수정 전 2건 → 수정 후 1건).
   - 복구 후 멈춰 있던 잡이 늦게 실행되는 경우는 여전히 "경로 전환 시점" 한계에 남는다.
   - BullMQ 연결에 짧은 타임아웃을 주는 대안은 워커 동작에도 영향을 줘서 범위 밖으로 둔다.
