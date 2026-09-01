import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AlertsService } from "../alerts/alerts.service";
import { Clock } from "../common/clock";
import type { Env } from "../config/env.schema";
import { CooldownService } from "../cooldown/cooldown.service";
import { COUNTER, type CounterStrategy } from "../counter/counter.strategy";

/**
 * "임계값 경로": 에러 저장 직후 호출돼 최근 윈도우 카운트를 세고,
 * 임계값을 넘고 cooldown 락을 잡으면 알림 큐에 잡을 넣는다.
 * T14 에서 카운터 selector(Redis/DB) 가 여기로 들어온다.
 */
@Injectable()
export class DetectorService {
  private readonly logger = new Logger(DetectorService.name);
  private readonly threshold: number;
  private readonly windowMs: number;

  constructor(
    @Inject(COUNTER) private readonly counter: CounterStrategy,
    private readonly clock: Clock,
    private readonly cooldown: CooldownService,
    private readonly alerts: AlertsService,
    config: ConfigService<Env, true>,
  ) {
    this.threshold = config.get("ALERT_THRESHOLD", { infer: true });
    this.windowMs = config.get("ALERT_WINDOW_MS", { infer: true });
  }

  /** @param startedAt 컨트롤러가 요청 수신 시각(Date.now())을 넘긴다 — 지연 측정용 */
  async check(service: string, startedAt: number): Promise<void> {
    const now = this.clock.now();
    const count = await this.counter.record(service, now);

    let enqueued = false;
    if (count > this.threshold) {
      this.logger.warn(
        `threshold exceeded: service=${service} count=${count} window=${this.windowMs}ms`,
      );
      // cooldown 락을 잡은 요청만 알림을 낸다 (나머지는 조용히 skip → 알림 폭풍 억제).
      if (await this.cooldown.tryAcquire(service)) {
        await this.alerts.enqueue({
          service,
          count,
          threshold: this.threshold,
          windowMs: this.windowMs,
          windowStart: Math.floor(now / this.windowMs) * this.windowMs,
        });
        enqueued = true;
      }
    }

    // path 는 T14 에서 redis/db-fallback 로 갈린다. 지금은 Redis 경로뿐.
    this.logger.log(
      `ingest path=redis service=${service} count=${count} enqueued=${enqueued} latencyMs=${Date.now() - startedAt}`,
    );
  }
}
