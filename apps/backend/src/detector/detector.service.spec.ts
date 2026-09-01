import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { AlertsService } from "../alerts/alerts.service";
import type { Clock } from "../common/clock";
import type { Env } from "../config/env.schema";
import type { CooldownService } from "../cooldown/cooldown.service";
import type { CounterStrategy } from "../counter/counter.strategy";
import { DetectorService } from "./detector.service";

const THRESHOLD = 10;
const WINDOW = 60_000;

/**
 * counter 는 무조건 fixedCount 반환, cooldown 은 acquire 로 성공/실패 지정.
 * enqueue 호출 여부/인자를 추적한다. Nest DI 없이 직접 조립.
 */
function makeDetector(fixedCount: number, acquire: boolean, now = 1_700_000_000_000) {
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
  const config = {
    get: (key: keyof Env) => (key === "ALERT_THRESHOLD" ? THRESHOLD : WINDOW),
  } as unknown as ConfigService<Env, true>;

  return {
    detector: new DetectorService(counter, clock, cooldown, alerts, config),
    recordCalls,
    enqueueCalls,
    now,
  };
}

describe("DetectorService", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it("record 를 Clock.now() 시각으로 호출한다", async () => {
    const { detector, recordCalls, now } = makeDetector(1, false);
    await detector.check("checkout");
    expect(recordCalls).toEqual([{ service: "checkout", at: now }]);
  });

  it("카운트가 임계값 이하면 로그도 알림도 없다", async () => {
    const { detector, enqueueCalls } = makeDetector(THRESHOLD, true);
    await detector.check("checkout");
    expect(warn).not.toHaveBeenCalled();
    expect(enqueueCalls).toHaveLength(0);
  });

  it("임계값 초과 + cooldown 획득이면 로그를 남기고 알림을 큐에 넣는다", async () => {
    const { detector, enqueueCalls } = makeDetector(THRESHOLD + 1, true);
    await detector.check("checkout");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(enqueueCalls).toEqual([
      { service: "checkout", count: 11, threshold: THRESHOLD, windowMs: WINDOW },
    ]);
  });

  it("임계값 초과여도 cooldown 을 못 잡으면 로그만 남기고 알림은 skip", async () => {
    const { detector, enqueueCalls } = makeDetector(THRESHOLD + 5, false);
    await detector.check("checkout");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(enqueueCalls).toHaveLength(0);
  });
});
