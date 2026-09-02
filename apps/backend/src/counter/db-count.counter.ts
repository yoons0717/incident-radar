import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";
import type { Env } from "../config/env.schema";
import { ErrorLog } from "../db/entities/error-log.entity";
import type { CounterStrategy } from "./counter.strategy";

/**
 * Redis 다운 시 쓰는 fallback 카운터. 에러 행은 이미 ErrorsService 가 저장했으므로
 * 여기서는 "쓰기 없이" 최근 윈도우 안의 행을 COUNT 만 한다 (인터페이스 계약상 이름은 record).
 *
 * Redis 슬라이딩 윈도우와 달리 sub-second 정밀도가 없고 DB 부하가 늘지만,
 * 알림 시스템에선 "Redis 죽으면 감지도 멈춤"이 더 나쁘므로 이 절충을 받는다.
 * 경계 규칙(created_at > at - windowMs, 경계값 제외)은 Redis 구현과 동일하게 맞춘다.
 */
@Injectable()
export class DbCountCounter implements CounterStrategy {
  private readonly windowMs: number;

  constructor(
    @InjectRepository(ErrorLog) private readonly repo: Repository<ErrorLog>,
    config: ConfigService<Env, true>,
  ) {
    this.windowMs = config.get("ALERT_WINDOW_MS", { infer: true });
  }

  record(service: string, at: number): Promise<number> {
    return this.repo.count({
      where: { service, createdAt: MoreThan(new Date(at - this.windowMs)) },
    });
  }
}
