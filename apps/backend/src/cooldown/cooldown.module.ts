import { Module } from "@nestjs/common";
import { CooldownService } from "./cooldown.service";

/**
 * RedisModule 은 @Global, ConfigModule 은 isGlobal 이라 imports 불필요.
 * DetectorModule(알림 큐 배선)과 DashboardModule(/status TTL 조회)이 소비한다.
 */
@Module({
  providers: [CooldownService],
  exports: [CooldownService],
})
export class CooldownModule {}
