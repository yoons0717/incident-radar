import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  Alert as AlertDto,
  ServiceStatus,
  StatsResponse,
} from "@incident-radar/shared";
import { MoreThan, Repository } from "typeorm";
import type { Env } from "../config/env.schema";
import { CooldownService } from "../cooldown/cooldown.service";
import { AlertFailure } from "../db/entities/alert-failure.entity";
import { Alert } from "../db/entities/alert.entity";
import { ErrorLog } from "../db/entities/error-log.entity";
import type { AlertsQuery, StatsQuery } from "./dashboard.schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_MS = 60 * 60 * 1000; // /stats 기본 창: 최근 60분

/**
 * 대시보드 전용 읽기 모델. 원장(error_logs 등) 조회와 분리해 세 패널(추이·상태·알림)을
 * 각자 필요한 모양으로만 만든다. 모든 응답은 공유 스키마(@incident-radar/shared)에 맞춘다.
 */
@Injectable()
export class DashboardService {
  private readonly windowMs: number;

  constructor(
    @InjectRepository(ErrorLog) private readonly errorLogs: Repository<ErrorLog>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(AlertFailure)
    private readonly alertFailures: Repository<AlertFailure>,
    private readonly cooldown: CooldownService,
    config: ConfigService<Env, true>,
  ) {
    this.windowMs = config.get("ALERT_WINDOW_MS", { infer: true });
  }

  /** GET /stats — 에러 수를 bucket 초 간격으로 버킷팅한 서비스별 시계열. */
  async stats(q: StatsQuery): Promise<StatsResponse> {
    // `to` 생략(기본 = 지금까지)이면 상한을 아예 안 건다. `new Date()`(ms 정밀도)를
    // DB timestamptz(마이크로초 정밀도)와 비교하면, 쿼리 직전에 쓰인 행이 근소한
    // 정밀도 차이로 `< to` 에서 빠질 수 있다(레이스) — "지금 존재하는 건 다 포함"이 맞기도 하다.
    const to = q.to ? new Date(q.to) : null;
    const from = q.from ? new Date(q.from) : new Date((to ?? new Date()).getTime() - DEFAULT_RANGE_MS);
    // ponytail: bucket 은 스키마에서 10~3600 정수로 클램프됨 → SQL 에 인라인해도 안전(주입 아님).
    const bucket = q.bucket;

    const qb = this.errorLogs
      .createQueryBuilder("e")
      .select("e.service", "service")
      .addSelect(
        `to_timestamp(floor(extract(epoch from e.created_at) / ${bucket}) * ${bucket})`,
        "t",
      )
      .addSelect("count(*)", "count")
      .where("e.created_at >= :from", { from })
      .groupBy("e.service")
      .addGroupBy("t")
      .orderBy("e.service")
      .addOrderBy("t");

    if (to) qb.andWhere("e.created_at < :to", { to });
    if (q.service) qb.andWhere("e.service = :service", { service: q.service });

    const rows = await qb.getRawMany<{ service: string; t: Date; count: string }>();

    const bySvc = new Map<string, StatsResponse[number]>();
    for (const r of rows) {
      let series = bySvc.get(r.service);
      if (!series) {
        series = { service: r.service, buckets: [] };
        bySvc.set(r.service, series);
      }
      series.buckets.push({ t: new Date(r.t).toISOString(), count: Number(r.count) });
    }
    return [...bySvc.values()];
  }

  /** GET /status — 최근 24h 에 등장한 서비스별 현재 윈도우 개수 + cooldown 상태. */
  async status(): Promise<ServiceStatus[]> {
    const since = new Date(Date.now() - DAY_MS);
    const windowStart = new Date(Date.now() - this.windowMs);

    const svcRows = await this.errorLogs
      .createQueryBuilder("e")
      .select("DISTINCT e.service", "service")
      .where("e.created_at > :since", { since })
      .orderBy("e.service")
      .getRawMany<{ service: string }>();

    return Promise.all(
      svcRows.map(async ({ service }) => {
        const windowCount = await this.errorLogs.count({
          where: { service, createdAt: MoreThan(windowStart) },
        });
        let cooldownTtlSec: number | null = null;
        try {
          cooldownTtlSec = await this.cooldown.getTtl(service);
        } catch {
          // Redis 다운 — cooldown 상태 미상. 패널이 죽지 않게 비활성으로 둔다.
        }
        return {
          service,
          windowCount,
          cooldownActive: cooldownTtlSec !== null,
          cooldownTtlSec,
        };
      }),
    );
  }

  /** GET /alerts — alerts(dispatched) + alert_failures(failed) 를 시간 역순으로 병합. */
  async recentAlerts(q: AlertsQuery): Promise<AlertDto[]> {
    const [dispatched, failed] = await Promise.all([
      this.alerts.find({ order: { at: "DESC" }, take: q.limit }),
      this.alertFailures.find({ order: { failedAt: "DESC" }, take: q.limit }),
    ]);

    const merged = [
      ...dispatched.map((a) => ({
        row: {
          id: a.id,
          service: a.service,
          status: "dispatched" as const,
          at: a.at.toISOString(),
          count: a.count,
          threshold: a.threshold,
          windowMs: a.windowMs,
        },
        sort: a.at.getTime(),
      })),
      ...failed.map((f) => ({
        row: {
          id: f.id,
          service: f.service,
          status: "failed" as const,
          at: f.failedAt.toISOString(),
          attempts: f.attempts,
          error: f.error,
        },
        sort: f.failedAt.getTime(),
      })),
    ];

    return merged
      .sort((a, b) => b.sort - a.sort)
      .slice(0, q.limit)
      .map((m) => m.row);
  }
}
