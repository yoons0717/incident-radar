import { Module } from "@nestjs/common";
import { Clock } from "../common/clock";
import { COUNTER } from "./counter.strategy";
import { RedisSlidingWindowCounter } from "./redis-sliding-window.counter";

/**
 * 지금은 COUNTER 토큰에 Redis 구현을 바인딩.
 * T14 에서 헬스 플래그를 보고 Redis / DB fallback 을 고르는 selector 로 바뀐다.
 */
@Module({
  providers: [Clock, { provide: COUNTER, useClass: RedisSlidingWindowCounter }],
  exports: [COUNTER, Clock],
})
export class CounterModule {}
