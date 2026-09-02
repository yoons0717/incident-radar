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
  const clock = { now: () => now } as Clock;
  const cooldown = { tryAcquire: async () => acquire } as unknown as CooldownService;
  const enqueueCalls: unknown[] = [];
  const alerts = {
    enqueue: async (data: unknown) => {
      enqueueCalls.push(data);
    },
  } as unknown as AlertsService;
  const redisHealth = { healthy } as RedisHealthService;
  const config = {
    get: (key: keyof Env) => (key === "ALERT_THRESHOLD" ? THRESHOLD : WINDOW),
  } as unknown as ConfigService<Env, true>;

  return {
    detector: new DetectorService(counter, clock, cooldown, alerts, redisHealth, config),
    recordCalls,
    enqueueCalls,
    now,
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

  it("Redis 다운(healthy=false)이면 임계값 초과여도 알림을 큐에 안 넣고 suppressed 로그만", async () => {
    const { detector, enqueueCalls } = makeDetector(THRESHOLD + 1, true, NOW, false);
    await detector.check("checkout", Date.now());

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("threshold exceeded"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("alert suppressed: redis down"));
    expect(enqueueCalls).toHaveLength(0);

    const line = String(log.mock.calls.at(-1)?.[0]);
    expect(line).toContain("path=db-fallback");
    expect(line).toContain("enqueued=false");
  });

  it("Redis 다운이어도 임계값 이하면 suppressed 로그도 없다 (경로만 db-fallback)", async () => {
    const { detector } = makeDetector(THRESHOLD, true, NOW, false);
    await detector.check("checkout", Date.now());

    expect(warn).not.toHaveBeenCalled();
    expect(String(log.mock.calls.at(-1)?.[0])).toContain("path=db-fallback");
  });
});
