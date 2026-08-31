import type { ConfigService } from "@nestjs/config";
import { redis } from "../../test/db";
import type { Env } from "../config/env.schema";
import type { RedisService } from "../redis/redis.service";
import { RedisSlidingWindowCounter } from "./redis-sliding-window.counter";

const WINDOW = 60_000;

/** 실제 test Redis(6380)에 붙되, Nest DI 없이 직접 조립한다. */
function makeCounter(): RedisSlidingWindowCounter {
  const fakeRedis = { client: redis } as unknown as RedisService;
  const fakeConfig = {
    get: () => WINDOW,
  } as unknown as ConfigService<Env, true>;
  return new RedisSlidingWindowCounter(fakeRedis, fakeConfig);
}

describe("RedisSlidingWindowCounter", () => {
  let counter: RedisSlidingWindowCounter;

  beforeAll(() => {
    counter = makeCounter();
  });
  // 테스트 간 정리는 test/setup.ts 의 afterEach(flushRedis)가 담당

  it("윈도우 안의 이벤트를 누적해서 센다", async () => {
    const now = 1_000_000;
    expect(await counter.record("checkout", now)).toBe(1);
    expect(await counter.record("checkout", now + 1_000)).toBe(2);
    expect(await counter.record("checkout", now + 2_000)).toBe(3);
  });

  it("윈도우 밖(오래된) 이벤트는 트리밍되어 안 세진다", async () => {
    const now = 1_000_000;
    await counter.record("checkout", now);
    // 첫 이벤트보다 windowMs + 5s 뒤 → 첫 이벤트는 윈도우 밖
    const count = await counter.record("checkout", now + WINDOW + 5_000);
    expect(count).toBe(1);
  });

  it("경계값: score === at - windowMs 인 이벤트는 트리밍된다", async () => {
    const now = 1_000_000;
    await counter.record("checkout", now); // score = now
    // 다음 record 의 at = now + WINDOW → cutoff = now → score(now) 는 inclusive 제거
    const count = await counter.record("checkout", now + WINDOW);
    expect(count).toBe(1); // 방금 것만
  });

  it("경계값 + 1ms 안쪽 이벤트는 살아남는다", async () => {
    const now = 1_000_000;
    await counter.record("checkout", now + 1); // score = now + 1
    // 다음 at = now + WINDOW → cutoff = now → score(now+1) > cutoff → 유지
    const count = await counter.record("checkout", now + WINDOW);
    expect(count).toBe(2);
  });

  it("서비스별로 카운트가 독립적이다", async () => {
    const now = 1_000_000;
    await counter.record("checkout", now);
    await counter.record("auth", now);
    await counter.record("auth", now + 1);
    expect(await counter.record("checkout", now + 2)).toBe(2);
    expect(await counter.record("auth", now + 3)).toBe(3);
  });

  it("키에 안전용 TTL(≈ windowMs*2)이 걸린다", async () => {
    await counter.record("checkout", 1_000_000);
    const ttl = await redis.pttl("count:checkout");
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(WINDOW * 2);
  });
});
