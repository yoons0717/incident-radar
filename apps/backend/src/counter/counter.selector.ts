import { Injectable, Logger } from "@nestjs/common";
import { RedisHealthService } from "../redis/redis-health.service";
import type { CounterStrategy } from "./counter.strategy";
import { DbCountCounter } from "./db-count.counter";
import { RedisSlidingWindowCounter } from "./redis-sliding-window.counter";

/**
 * COUNTER 토큰이 가리키는 실제 구현. 호출 단위로 RedisHealthService.healthy 를 보고
 * 정상이면 Redis 슬라이딩 윈도우, 아니면 DB COUNT fallback 으로 위임한다.
 * Redis 호출이 실패해도 DB 로 다시 센다.
 * DetectorService 는 이 seam 뒤만 보므로 경로 전환을 몰라도 된다.
 */
@Injectable()
export class CounterSelector implements CounterStrategy {
  private readonly logger = new Logger(CounterSelector.name);

  constructor(
    private readonly redisCounter: RedisSlidingWindowCounter,
    private readonly dbCounter: DbCountCounter,
    private readonly health: RedisHealthService,
  ) {}

  async record(service: string, at: number): Promise<number> {
    if (!this.health.healthy) return this.dbCounter.record(service, at);
    try {
      return await this.redisCounter.record(service, at);
    } catch (e) {
      // 플래그가 아직 true 인데 요청 도중 Redis 가 죽은 경우 → 같은 요청 안에서 DB 로 다시 센다.
      this.logger.warn(`redis count failed, db fallback (service=${service}) — ${String(e)}`);
      return this.dbCounter.record(service, at);
    }
  }
}
