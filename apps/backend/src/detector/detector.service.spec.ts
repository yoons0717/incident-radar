import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { AlertsService } from "../alerts/alerts.service";
import type { Clock } from "../common/clock";
import type { Env } from "../config/env.schema";
import type { CooldownService } from "../cooldown/cooldown.service";
import type { CounterStrategy } from "../counter/counter.strategy";
import type { RedisHealthService } from "../redis/redis-health.service";
import { DetectorService } from "./detector.service";

const THRESHOLD = 10;
const WINDOW = 60_000;
const COOLDOWN_SEC = 300;
const NOW = 1_700_000_000_000;
const WINDOW_START = Math.floor(NOW / WINDOW) * WINDOW;

/**
 * counter 는 무조건 fixedCount 반환, cooldown 은 acquire 로 성공/실패 지정.
 * enqueue 호출 여부/인자를 추적한다. Nest DI 없이 직접 조립.
 */
function makeDetector(fixedCount: number, acquire: boolean, now = NOW, healthy = true) {
  const recordCalls: Array<{ service: string; at: number }> = [];
  const counter: CounterStrategy = {
    record: async (service, at) => {
      recordCalls.push({ service, at });
      return fixedCount;
    },
  };
  const clock = { now: () => now };
  const cooldown = { tryAcquire: async () => acquire } as unknown as CooldownService;
  const enqueueCalls: unknown[] = [];
  const directCalls: unknown[] = [];
  const alerts = {
    enqueue: async (data: unknown) => {
      enqueueCalls.push(data);
    },
    dispatchDirect: async (data: unknown) => {
      directCalls.push(data);
    },
  } as unknown as AlertsService;
  const redisHealth = { healthy };
  const config = {
    get: (key: keyof Env) =>
      ({ ALERT_THRESHOLD: THRESHOLD, ALERT_WINDOW_MS: WINDOW, ALERT_COOLDOWN_SEC: COOLDOWN_SEC })[
        key as string
      ],
  } as unknown as ConfigService<Env, true>;

  return {
    detector: new DetectorService(counter, clock as Clock, cooldown, alerts, redisHealth as RedisHealthService, config),
    recordCalls,
    enqueueCalls,
    directCalls,
    clock,
    redisHealth,
    now,
    cooldown,
    alerts,
  };
}

describe("DetectorService", () => {
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
  });

  it("record 를 Clock.now() 시각으로 호출한다", async () => {
    const { detector, recordCalls, now } = makeDetector(1, false);
    await detector.check("checkout", Date.now());
    expect(recordCalls).toEqual([{ service: "checkout", at: now }]);
  });

  it("요청마다 path·count·enqueued·latencyMs 를 담은 ingest 로그를 남긴다", async () => {
    const { detector } = makeDetector(1, false);
    await detector.check("checkout", Date.now() - 5);

    const line = String(log.mock.calls.at(-1)?.[0]);
    expect(line).toContain("ingest path=redis");
    expect(line).toContain("service=checkout");
    expect(line).toContain("count=1");
    expect(line).toContain("enqueued=false");
    expect(line).toMatch(/latencyMs=\d+/);
  });

  it("카운트가 임계값 이하면 경보 로그도 알림도 없다", async () => {
    const { detector, enqueueCalls } = makeDetector(THRESHOLD, true);
    await detector.check("checkout", Date.now());
    expect(warn).not.toHaveBeenCalled();
    expect(enqueueCalls).toHaveLength(0);
  });

  it("임계값 초과 + cooldown 획득이면 windowStart 를 포함해 알림을 큐에 넣는다", async () => {
    const { detector, enqueueCalls } = makeDetector(THRESHOLD + 1, true);
    await detector.check("checkout", Date.now());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(enqueueCalls).toEqual([
      {
        service: "checkout",
        count: 11,
        threshold: THRESHOLD,
        windowMs: WINDOW,
        windowStart: WINDOW_START,
      },
    ]);
    expect(String(log.mock.calls.at(-1)?.[0])).toContain("enqueued=true");
  });

  it("임계값 초과여도 cooldown 을 못 잡으면 경보 로그만 남기고 알림은 skip", async () => {
    const { detector, enqueueCalls } = makeDetector(THRESHOLD + 5, false);
    await detector.check("checkout", Date.now());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(enqueueCalls).toHaveLength(0);
    expect(String(log.mock.calls.at(-1)?.[0])).toContain("enqueued=false");
  });

  it("Redis 다운(healthy=false)이면 큐 대신 직접 발송한다 (degraded)", async () => {
    const { detector, enqueueCalls, directCalls } = makeDetector(THRESHOLD + 1, true, NOW, false);
    await detector.check("checkout", Date.now());

    expect(enqueueCalls).toHaveLength(0);
    expect(directCalls).toEqual([expect.objectContaining({ service: "checkout", count: 11 })]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("alert degraded: redis down"));

    const line = String(log.mock.calls.at(-1)?.[0]);
    expect(line).toContain("path=db-fallback");
    expect(line).toContain("enqueued=false");
  });

  it("Redis 다운 중 메모리 cooldown: TTL 안엔 1건만, TTL 지나면 다시 발송", async () => {
    const { detector, directCalls, clock } = makeDetector(THRESHOLD + 1, true, NOW, false);
    await detector.check("checkout", Date.now());
    await detector.check("checkout", Date.now());
    expect(directCalls).toHaveLength(1);

    await detector.check("payments", Date.now()); // 서비스별 독립
    expect(directCalls).toHaveLength(2);

    clock.now = () => NOW + COOLDOWN_SEC * 1000 - 1;
    await detector.check("checkout", Date.now());
    expect(directCalls).toHaveLength(2);

    clock.now = () => NOW + COOLDOWN_SEC * 1000;
    await detector.check("checkout", Date.now());
    expect(directCalls).toHaveLength(3);
  });

  it("Redis 다운이어도 임계값 이하면 발송도 경고도 없다 (경로만 db-fallback)", async () => {
    const { detector } = makeDetector(THRESHOLD, true, NOW, false);
    await detector.check("checkout", Date.now());

    expect(warn).not.toHaveBeenCalled();
    expect(String(log.mock.calls.at(-1)?.[0])).toContain("path=db-fallback");
  });

  it("cooldown 단계에서 Redis 가 실패하면 throw 없이 직접 발송 (Redis 다운과 동일)", async () => {
    const { detector, cooldown, enqueueCalls, directCalls } = makeDetector(THRESHOLD + 1, true);
    cooldown.tryAcquire = () => Promise.reject(new Error("Command timed out"));

    await detector.check("checkout", Date.now());

    expect(enqueueCalls).toHaveLength(0);
    expect(directCalls).toHaveLength(1);
  });

  it("enqueue 를 기다리지 않고, 그 사이 degraded 로 이미 보냈으면 적재 실패 후 다시 보내지 않는다", async () => {
    const { detector, alerts, directCalls, redisHealth } = makeDetector(THRESHOLD + 1, true);

    // A: Redis 락을 잡고 적재 시작 → 적재가 멈춰 있어도 바로 resolve.
    let rejectEnqueue!: (e: Error) => void;
    alerts.enqueue = () => new Promise((_, reject) => (rejectEnqueue = reject));
    await detector.check("checkout", Date.now());
    expect(String(log.mock.calls.at(-1)?.[0])).toContain("enqueued=true");

    // B: 그 사이 Redis 가 죽어 degraded 로 1건 발송 (메모리 cooldown 획득).
    redisHealth.healthy = false;
    await detector.check("checkout", Date.now());
    expect(directCalls).toHaveLength(1);

    // A 의 적재가 나중에 실패해도 메모리 cooldown 이 잡혀 있으니 중복 발송하지 않는다.
    rejectEnqueue(new Error("queue down"));
    await new Promise(setImmediate);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("enqueue failed"));
    expect(directCalls).toHaveLength(1);
  });

  it("enqueue 실패로 직접 발송하면 메모리 cooldown 도 잡혀 Redis 다운 경로가 중복 발송하지 않는다", async () => {
    const { detector, alerts, directCalls, redisHealth } = makeDetector(THRESHOLD + 1, true);
    alerts.enqueue = () => Promise.reject(new Error("queue down"));

    await detector.check("checkout", Date.now());
    await new Promise(setImmediate);
    expect(directCalls).toHaveLength(1);

    redisHealth.healthy = false;
    await detector.check("checkout", Date.now());
    expect(directCalls).toHaveLength(1);
  });
});
