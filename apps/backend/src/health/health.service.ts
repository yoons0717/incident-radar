import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { RedisHealthService } from "../redis/redis-health.service";

export type HealthResult = { status: "ok" } | { status: "degraded"; redis: "down" };

/**
 * DB 는 필수(실패 시 503) — 원장에 못 쓰면 서비스 불가로 본다.
 * Redis 는 fail-open 이라 다운이어도 200("degraded")만 — 감지는 DB fallback으로 계속되고
 * 알림 발송만 멈추는 상태를 "완전 정상"과 구분해 LB/오케스트레이터에 알린다.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  // ponytail: 고정 1.5초. 조정할 일이 거의 없어 env로 안 뺀다.
  private static readonly DB_TIMEOUT_MS = 1_500;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisHealth: RedisHealthService,
  ) {}

  async check(): Promise<HealthResult> {
    await this.checkDb();
    return this.redisHealth.healthy ? { status: "ok" } : { status: "degraded", redis: "down" };
  }

  /** SELECT 1을 짧은 타임아웃으로 감싸 커넥션 풀 고갈·행 잠금 상태에서 무한 대기하지 않는다. */
  private async checkDb(): Promise<void> {
    let timer!: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("db health check timeout")), HealthService.DB_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.dataSource.query("SELECT 1"), timeout]);
    } catch (err) {
      // TypeOrmModule.forRootAsync 에 logging 옵션이 없어, 여기서 안 남기면 원인이 어디에도 안 남는다.
      this.logger.error(`db health check failed: ${describeError(err)}`);
      throw new ServiceUnavailableException("db unavailable");
    } finally {
      // DB 쪽이 먼저 끝나도 타이머를 안 지우면 매 호출마다 1.5초짜리 핸들이 남는다
      // (헬스체크는 LB/오케스트레이터가 짧은 간격으로 계속 두드림).
      clearTimeout(timer);
    }
  }
}

/**
 * Postgres 커넥션 거부는 Node `AggregateError`(IPv4/IPv6 양쪽 시도 실패 묶음)로 오는데
 * `.message` 가 빈 문자열이라 원인이 안 남는다 — `.errors`/`.code` 로 폴백해서 채운다.
 */
function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    const inner = err.errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
    const code = (err as NodeJS.ErrnoException).code;
    return inner || code || err.message || String(err);
  }
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return err.message || code || String(err);
  }
  return String(err);
}
