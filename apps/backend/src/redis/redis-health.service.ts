import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { RedisService } from "./redis.service";

/**
 * Redis 가용성 플래그. 5초마다 PING 하고, ioredis 커넥션/커맨드 에러 이벤트에도
 * 즉시 플래그를 내린다. `healthy` 를 보고 카운터 경로(Redis / DB fallback)를 고른다.
 *
 * 알림 시스템은 fail-open: Redis 가 죽어도 감지는 DB 로 계속하고, 알림 발송만 멈춘다.
 * 이 규모에선 불린 플래그로 충분하고 풀 서킷 브레이커는 과하다.
 */
@Injectable()
export class RedisHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisHealthService.name);
  // ponytail: 5s 고정. 튜닝할 일이 거의 없어 env 로 빼지 않는다.
  private static readonly PING_INTERVAL_MS = 5_000;

  private _healthy = true;
  private timer?: NodeJS.Timeout;

  constructor(private readonly redis: RedisService) {
    this.redis.client.on("error", () => {
      this._healthy = false;
    });
  }

  get healthy(): boolean {
    return this._healthy;
  }

  async onModuleInit(): Promise<void> {
    await this.check();
    this.timer = setInterval(() => {
      void this.check();
    }, RedisHealthService.PING_INTERVAL_MS);
    // 이 타이머가 프로세스 종료를 막지 않도록.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async check(): Promise<void> {
    try {
      await this.redis.client.ping();
      if (!this._healthy) this.logger.log("redis 복구 — healthy=true");
      this._healthy = true;
    } catch {
      if (this._healthy) this.logger.warn("redis PING 실패 — healthy=false");
      this._healthy = false;
    }
  }
}
