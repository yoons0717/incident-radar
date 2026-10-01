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
 * 카운터는 CounterSelector 뒤에서 Redis/DB fallback 이 골라진다. Redis 가 다운이면(fail-open)
 * 감지는 DB 로 계속하고, 발송은 메모리 cooldown + 큐 없이 직접 발송(degraded)으로 바꾼다.
 */
@Injectable()
export class DetectorService {
  private readonly logger = new Logger(DetectorService.name);
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  // ponytail: 프로세스 메모리 cooldown — 인스턴스 N대면 최대 N건 중복, 재시작 시 초기화 (README 한계 참고).
  // 만료 항목을 지우지 않는다: 키는 임계값을 넘은 서비스 이름뿐이라 작다. 서비스 수가 커지면 만료 시 삭제.
  private readonly localCooldownUntil = new Map<string, number>();

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
    this.cooldownMs = config.get("ALERT_COOLDOWN_SEC", { infer: true }) * 1000;
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
      const data = {
        service,
        count,
        threshold: this.threshold,
        windowMs: this.windowMs,
        windowStart: Math.floor(now / this.windowMs) * this.windowMs,
      };
      let redisDown = !healthy;
      let acquired = false;
      if (healthy) {
        try {
          acquired = await this.cooldown.tryAcquire(service);
        } catch (e) {
          // 플래그는 true 인데 요청 도중 Redis 가 죽은 경우 → Redis 다운과 같이 취급.
          // 타임아웃이면 서버엔 락이 잡혔을 수 있다 → Redis 경로는 cooldown 동안 조용하므로 여기서 직접 발송해야 한다.
          this.logger.warn(`cooldown failed (service=${service}) — ${String(e)}`);
          redisDown = true;
        }
      }
      if (redisDown) {
        // Redis 다운 중엔 cooldown·BullMQ 를 못 쓴다 → 메모리 cooldown 을 잡은 요청만 직접 발송.
        // 발송은 기다리지 않는다 (webhook 이 느려도 수집 응답이 막히지 않게).
        if (this.tryAcquireLocal(service, now)) {
          this.logger.warn(`alert degraded: redis down (service=${service} count=${count})`);
          void this.alerts.dispatchDirect(data);
        }
      } else if (acquired) {
        // cooldown 락을 잡은 요청만 알림을 낸다 (나머지는 조용히 skip → 알림 폭풍 억제).
        // 적재를 기다리지 않는다: BullMQ 연결이 재연결 중이면 add 가 실패 대신 수 초 대기한다.
        // 적재가 실패하면 Redis 락은 이미 잡은 상태 → 메모리 cooldown 확인 없이 직접 발송.
        // 메모리 cooldown 은 잡아둔다: 그 사이 Redis 다운 경로로 넘어간 요청이 또 보내지 않게.
        this.alerts.enqueue(data).catch((e: unknown) => {
          this.localCooldownUntil.set(service, this.clock.now() + this.cooldownMs);
          this.logger.warn(
            `alert degraded: enqueue failed (service=${service} count=${count}) — ${String(e)}`,
          );
          void this.alerts.dispatchDirect(data);
        });
        enqueued = true;
      }
    }

    this.logger.log(
      `ingest path=${path} service=${service} count=${count} enqueued=${enqueued} latencyMs=${Date.now() - startedAt}`,
    );
  }

  /** Redis cooldown 의 메모리 버전. 만료 시각 전이면 false, 아니면 잡고 true. */
  private tryAcquireLocal(service: string, now: number): boolean {
    if ((this.localCooldownUntil.get(service) ?? 0) > now) return false;
    this.localCooldownUntil.set(service, now + this.cooldownMs);
    return true;
  }
}
