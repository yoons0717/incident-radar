import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema";
import { RedisService } from "../redis/redis.service";
import type { CounterStrategy } from "./counter.strategy";

/**
 * 서비스별 Sorted Set(`count:<service>`)으로 슬라이딩 윈도우를 구현한다.
 *   score = 이벤트 시각(ms), member = 고유 id
 * record() 한 번에 ZADD → ZREMRANGEBYSCORE → ZCARD → PEXPIRE 를 파이프라인으로.
 *
 * 윈도우 규칙: score > (at - windowMs) 이면 "윈도우 안". 정확히 at - windowMs 인
 * 이벤트는 트리밍(inclusive 제거)되어 세지 않는다.
 */
@Injectable()
export class RedisSlidingWindowCounter implements CounterStrategy {
  private readonly windowMs: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<Env, true>,
  ) {
    this.windowMs = config.get("ALERT_WINDOW_MS", { infer: true });
  }

  async record(service: string, at: number): Promise<number> {
    const key = `count:${service}`;
    const member = `${at}-${randomUUID()}`;
    const cutoff = at - this.windowMs;

    const results = await this.redis.client
      .multi()
      .zadd(key, at, member)
      .zremrangebyscore(key, 0, cutoff)
      .zcard(key)
      .pexpire(key, this.windowMs * 2)
      .exec();

    // exec() → [[err, res], ...] 순서대로. ZCARD 는 3번째(index 2).
    // 실패를 조용히 0 으로 삼키면 알림이 억제되므로 명시적으로 throw.
    // (Redis 헬스 훅이 이 에러로 플래그를 내리고 CounterSelector 가 DB 집계로 폴백한다)
    if (!results) {
      throw new Error("Redis MULTI(exec) 결과가 없음");
    }
    const [zcardErr, zcardValue] = results[2] ?? [new Error("ZCARD 결과 없음"), null];
    if (zcardErr) {
      throw zcardErr;
    }
    return typeof zcardValue === "number" ? zcardValue : Number(zcardValue ?? 0);
  }
}
