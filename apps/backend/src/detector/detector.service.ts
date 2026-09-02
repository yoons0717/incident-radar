import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AlertsService } from "../alerts/alerts.service";
import { Clock } from "../common/clock";
import type { Env } from "../config/env.schema";
import { CooldownService } from "../cooldown/cooldown.service";
import { COUNTER, type CounterStrategy } from "../counter/counter.strategy";
import { RedisHealthService } from "../redis/redis-health.service";

/**
 * "임계값 경로": 에러 저장 직후 호출돼 최근 윈도우 카운트를 세고,
 * 임계값을 넘고 cooldown 락을 잡으면 알림 큐에 잡을 넣는다.
 * 카운터는 CounterSelector 뒤에서 Redis/DB fallback 이 골라진다. Redis 가 다운이면
 * 감지·로깅은 계속하되(fail-open) cooldown·BullMQ 가 필요한 발송은 건너뛴다.
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
    private readonly redisHealth: RedisHealthService,
    config: ConfigService<Env, true>,
  ) {
    this.threshold = config.get("ALERT_THRESHOLD", { infer: true });
    this.windowMs = config.get("ALERT_WINDOW_MS", { infer: true });
  }

  /** @param startedAt 컨트롤러가 요청 수신 시각(Date.now())을 넘긴다 — 지연 측정용 */
  async check(service: string, startedAt: number): Promise<void> {
    const now = this.clock.now();
    // healthy 를 요청 시작에 한 번 읽어 path 라벨과 발송 여부 판단에 함께 쓴다.
    // selector 도 내부에서 다시 읽지만 5초 프로브 주기라 한 요청 안에서 뒤집힐 일은 사실상 없다.
    const healthy = this.redisHealth.healthy;
    const path = healthy ? "redis" : "db-fallback";
    const count = await this.counter.record(service, now);

    let enqueued = false;
    if (count > this.threshold) {
      this.logger.warn(
        `threshold exceeded: service=${service} count=${count} window=${this.windowMs}ms`,
      );
      if (!healthy) {
        // Redis 다운 중엔 cooldown·BullMQ 를 못 쓴다 → 발송 건너뛰고 감지·로깅만 계속.
        this.logger.warn(`alert suppressed: redis down (service=${service} count=${count})`);
      } else if (await this.cooldown.tryAcquire(service)) {
        // cooldown 락을 잡은 요청만 알림을 낸다 (나머지는 조용히 skip → 알림 폭풍 억제).
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

    this.logger.log(
      `ingest path=${path} service=${service} count=${count} enqueued=${enqueued} latencyMs=${Date.now() - startedAt}`,
    );
  }
}
