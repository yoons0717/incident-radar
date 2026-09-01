import { setTimeout as sleep } from "node:timers/promises";
import type { ConfigService } from "@nestjs/config";
import { redis } from "../../test/db";
import type { Env } from "../config/env.schema";
import type { RedisService } from "../redis/redis.service";
import { CooldownService } from "./cooldown.service";

/** 실제 test Redis(6380)에 붙되 Nest DI 없이 직접 조립 (counter.spec 과 같은 방식). */
function makeCooldown(cooldownSec: number): CooldownService {
  const fakeRedis = { client: redis } as unknown as RedisService;
  const fakeConfig = {
    get: () => cooldownSec,
  } as unknown as ConfigService<Env, true>;
  return new CooldownService(fakeRedis, fakeConfig);
}

describe("CooldownService", () => {
  // 테스트 간 정리는 test/setup.ts 의 afterEach(flushRedis)

  it("1차 획득은 성공한다", async () => {
    const cooldown = makeCooldown(300);
    expect(await cooldown.tryAcquire("checkout")).toBe(true);
  });

  it("cooldown 이 살아있는 동안 2차 획득은 실패한다", async () => {
    const cooldown = makeCooldown(300);
    await cooldown.tryAcquire("checkout");
    expect(await cooldown.tryAcquire("checkout")).toBe(false);
  });

  it("TTL 만료 후에는 다시 획득할 수 있다", async () => {
    const cooldown = makeCooldown(1); // 1초
    expect(await cooldown.tryAcquire("checkout")).toBe(true);
    expect(await cooldown.tryAcquire("checkout")).toBe(false);
    await sleep(1_100);
    expect(await cooldown.tryAcquire("checkout")).toBe(true);
  });

  it("서비스별로 독립적이다", async () => {
    const cooldown = makeCooldown(300);
    await cooldown.tryAcquire("checkout");
    expect(await cooldown.tryAcquire("auth")).toBe(true);
  });
});
