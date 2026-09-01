import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Clock } from "../common/clock";
import type { Env } from "../config/env.schema";
import { COUNTER, type CounterStrategy } from "../counter/counter.strategy";

/**
 * "임계값 경로": 에러 저장 직후 호출돼 최근 윈도우 카운트를 세고,
 * 임계값을 넘으면 (지금은) 구조화 로그 한 줄만 남긴다.
 * T12 에서 cooldown + 큐 enqueue, T14 에서 카운터 selector 가 여기로 들어온다.
 */
@Injectable()
export class DetectorService {
  private readonly logger = new Logger(DetectorService.name);
  private readonly threshold: number;
  private readonly windowMs: number;

  constructor(
    @Inject(COUNTER) private readonly counter: CounterStrategy,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.threshold = config.get("ALERT_THRESHOLD", { infer: true });
    this.windowMs = config.get("ALERT_WINDOW_MS", { infer: true });
  }

  async check(service: string): Promise<void> {
    const count = await this.counter.record(service, this.clock.now());
    if (count > this.threshold) {
      this.logger.warn(
        `threshold exceeded: service=${service} count=${count} window=${this.windowMs}ms`,
      );
    }
  }
}
