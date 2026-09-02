import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema";
import { RedisService } from "../redis/redis.service";

/**
 * 알림 폭풍 억제용 분산 락. `SET cooldown:<svc> 1 NX EX <sec>` 한 번으로 판정한다.
 *   - 키가 없었으면 "OK" → 이번 알림 허용(락 획득)
 *   - 이미 있으면 null → skip
 * TTL(EX) 이 지나면 키가 사라져 다음 알림이 다시 통과한다.
 */
@Injectable()
export class CooldownService {
  private readonly cooldownSec: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<Env, true>,
  ) {
    this.cooldownSec = config.get("ALERT_COOLDOWN_SEC", { infer: true });
  }

  async tryAcquire(service: string): Promise<boolean> {
    const res = await this.redis.client.set(
      `cooldown:${service}`,
      "1",
      "EX",
      this.cooldownSec,
      "NX",
    );
    return res === "OK";
  }

  /**
   * cooldown 이 활성이면 남은 TTL(초), 아니면 null. 읽기 전용 — 락을 만들지 않는다.
   * TTL: -2(키 없음) / -1(만료 없음, 이 서비스에선 안 나옴) → null 로 취급.
   */
  async getTtl(service: string): Promise<number | null> {
    const ttl = await this.redis.client.ttl(`cooldown:${service}`);
    return ttl > 0 ? ttl : null;
  }
}
