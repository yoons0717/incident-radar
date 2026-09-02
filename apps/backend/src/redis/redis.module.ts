import { Global, Module } from "@nestjs/common";
import { RedisHealthService } from "./redis-health.service";
import { RedisService } from "./redis.service";

// @Global — Redis 는 여러 모듈이 쓰는 공통 인프라라 한 번만 등록하고 어디서나 주입.
@Global()
@Module({
  providers: [RedisService, RedisHealthService],
  exports: [RedisService, RedisHealthService],
})
export class RedisModule {}
