import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { Env } from "../config/env.schema";

/**
 * 앱 전역에서 공유하는 ioredis 커넥션 1개.
 * 종료 시 quit() 으로 정리(graceful shutdown).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get("REDIS_URL", { infer: true }), {
      maxRetriesPerRequest: 3,
      // 응답 없는 명령(재연결 대기로 오프라인 큐에 쌓인 것 포함)을 빨리 실패시킨다.
      // 실패하면 CounterSelector·DetectorService 가 DB 집계/degraded 직접 발송으로 넘긴다.
      commandTimeout: 500,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
