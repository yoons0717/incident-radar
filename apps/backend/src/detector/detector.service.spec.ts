import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Clock } from "../common/clock";
import type { Env } from "../config/env.schema";
import type { CounterStrategy } from "../counter/counter.strategy";
import { DetectorService } from "./detector.service";

const THRESHOLD = 10;
const WINDOW = 60_000;

/** counter.record 가 무조건 fixedCount 를 돌려주는 가짜. 호출 인자는 기록해 둔다. */
function makeDetector(fixedCount: number, now = 1_700_000_000_000) {
  const recordCalls: Array<{ service: string; at: number }> = [];
  const counter: CounterStrategy = {
    record: async (service, at) => {
      recordCalls.push({ service, at });
      return fixedCount;
    },
  };
  const clock = { now: () => now } as Clock;
  const config = {
    get: (key: keyof Env) => (key === "ALERT_THRESHOLD" ? THRESHOLD : WINDOW),
  } as unknown as ConfigService<Env, true>;

  return {
    detector: new DetectorService(counter, clock, config),
    recordCalls,
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
    const { detector, recordCalls, now } = makeDetector(1);
    await detector.check("checkout");
    expect(recordCalls).toEqual([{ service: "checkout", at: now }]);
  });

  it("카운트가 임계값 이하면 로그를 남기지 않는다", async () => {
    const { detector } = makeDetector(THRESHOLD); // 10 > 10 === false
    await detector.check("checkout");
    expect(warn).not.toHaveBeenCalled();
  });

  it("카운트가 임계값을 넘으면 service·count·window 를 담은 로그를 1회 남긴다", async () => {
    const { detector } = makeDetector(THRESHOLD + 1);
    await detector.check("checkout");
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain("checkout");
    expect(line).toContain("11");
    expect(line).toContain("60000");
  });
});
