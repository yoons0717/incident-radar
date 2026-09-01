import { Module } from "@nestjs/common";
import { CooldownService } from "./cooldown.service";

/**
 * RedisModule 은 @Global, ConfigModule 은 isGlobal 이라 imports 불필요.
 * T12(알림 큐), T16(/status) 이 이 서비스를 소비한다.
 */
@Module({
  providers: [CooldownService],
  exports: [CooldownService],
})
export class CooldownModule {}
