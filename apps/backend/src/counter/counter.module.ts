import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Clock } from "../common/clock";
import { ErrorLog } from "../db/entities/error-log.entity";
import { COUNTER } from "./counter.strategy";
import { CounterSelector } from "./counter.selector";
import { DbCountCounter } from "./db-count.counter";
import { RedisSlidingWindowCounter } from "./redis-sliding-window.counter";

/**
 * COUNTER 토큰은 CounterSelector 가 받는다. selector 가 RedisHealthService.healthy 를
 * 보고 Redis 슬라이딩(정상) / DB COUNT(fallback) 를 호출 단위로 고른다.
 * DbCountCounter 가 error_logs 리포지토리를 쓰므로 forFeature 로 주입한다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ErrorLog])],
  providers: [
    Clock,
    RedisSlidingWindowCounter,
    DbCountCounter,
    { provide: COUNTER, useClass: CounterSelector },
  ],
  exports: [COUNTER, Clock],
})
export class CounterModule {}
