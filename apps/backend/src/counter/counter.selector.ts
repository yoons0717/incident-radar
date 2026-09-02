import { Injectable } from "@nestjs/common";
import { RedisHealthService } from "../redis/redis-health.service";
import type { CounterStrategy } from "./counter.strategy";
import { DbCountCounter } from "./db-count.counter";
import { RedisSlidingWindowCounter } from "./redis-sliding-window.counter";

/**
 * COUNTER 토큰이 가리키는 실제 구현. 호출 단위로 RedisHealthService.healthy 를 보고
 * 정상이면 Redis 슬라이딩 윈도우, 아니면 DB COUNT fallback 으로 위임한다.
 * DetectorService 는 이 seam 뒤만 보므로 경로 전환을 몰라도 된다.
 */
@Injectable()
export class CounterSelector implements CounterStrategy {
  constructor(
    private readonly redisCounter: RedisSlidingWindowCounter,
    private readonly dbCounter: DbCountCounter,
    private readonly health: RedisHealthService,
  ) {}

  record(service: string, at: number): Promise<number> {
    const impl = this.health.healthy ? this.redisCounter : this.dbCounter;
    return impl.record(service, at);
  }
}
