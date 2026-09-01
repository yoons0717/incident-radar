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
}
