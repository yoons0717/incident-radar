import type { RedisHealthService } from "../redis/redis-health.service";
import { CounterSelector } from "./counter.selector";
import type { DbCountCounter } from "./db-count.counter";
import type { RedisSlidingWindowCounter } from "./redis-sliding-window.counter";

function make(healthy: boolean) {
  const redisCounter = { record: jest.fn().mockResolvedValue(11) };
  const dbCounter = { record: jest.fn().mockResolvedValue(7) };
  const health = { healthy };
  const selector = new CounterSelector(
    redisCounter as unknown as RedisSlidingWindowCounter,
    dbCounter as unknown as DbCountCounter,
    health as unknown as RedisHealthService,
  );
  return { selector, redisCounter, dbCounter, health };
}

describe("CounterSelector", () => {
  it("healthy=true 면 Redis 카운터로 위임한다", async () => {
    const { selector, redisCounter, dbCounter } = make(true);

    const n = await selector.record("checkout", 1_700_000_000_000);

    expect(n).toBe(11);
    expect(redisCounter.record).toHaveBeenCalledWith("checkout", 1_700_000_000_000);
    expect(dbCounter.record).not.toHaveBeenCalled();
  });

  it("healthy=false 면 DB 카운터로 위임한다", async () => {
    const { selector, redisCounter, dbCounter } = make(false);

    const n = await selector.record("checkout", 1_700_000_000_000);

    expect(n).toBe(7);
    expect(dbCounter.record).toHaveBeenCalledWith("checkout", 1_700_000_000_000);
    expect(redisCounter.record).not.toHaveBeenCalled();
  });

  it("경로는 호출 시점의 healthy 값으로 매번 다시 고른다", async () => {
    const { selector, redisCounter, dbCounter, health } = make(true);

    await selector.record("checkout", 1);
    health.healthy = false;
    await selector.record("checkout", 2);

    expect(redisCounter.record).toHaveBeenCalledTimes(1);
    expect(dbCounter.record).toHaveBeenCalledTimes(1);
  });
});
