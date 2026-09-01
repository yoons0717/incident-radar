import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Queue } from "bullmq";
import { Repository } from "typeorm";
import type { Env } from "../config/env.schema";
import { AlertFailure } from "../db/entities/alert-failure.entity";
import { Alert } from "../db/entities/alert.entity";
import { ALERTS_QUEUE, type AlertJobData } from "./alerts.types";

/**
 * 알림 큐의 프로듀서(enqueue) + 잡 처리 로직(dispatch/recordFailure).
 * 큐 소비 자체는 AlertsProcessor 가 얇게 감싸 이 메서드들을 호출한다.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly webhookUrl: string | undefined;

  constructor(
    @InjectQueue(ALERTS_QUEUE) private readonly queue: Queue<AlertJobData>,
    config: ConfigService<Env, true>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(AlertFailure) private readonly failures: Repository<AlertFailure>,
  ) {
    this.webhookUrl = config.get("WEBHOOK_URL", { infer: true });
  }

  /** 임계값+cooldown 통과 시 detector 가 호출. 재시도 5회·지수 백오프(1·2·4·8·16초)+지터. */
  async enqueue(data: AlertJobData): Promise<void> {
    await this.queue.add("dispatch", data, {
      attempts: 5,
      backoff: { type: "exponential", delay: 1000, jitter: 0.2 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  /** 워커가 잡마다 호출. webhook !ok 면 throw → BullMQ 가 재시도. 성공하면 alerts 행. */
  async dispatch(data: AlertJobData): Promise<void> {
    const payload = { ...data, at: new Date().toISOString() };
    if (this.webhookUrl) {
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`webhook responded ${res.status}`);
    } else {
      this.logger.log(`alert dispatched (no webhook): ${JSON.stringify(payload)}`);
    }
    await this.alerts.insert({
      service: data.service,
      count: data.count,
      threshold: data.threshold,
      windowMs: data.windowMs,
    });
  }

  /** 재시도 소진 후 워커가 호출. 실패 이력을 별도 테이블에. */
  async recordFailure(data: AlertJobData, error: string, attempts: number): Promise<void> {
    await this.failures.insert({ service: data.service, payload: data, error, attempts });
    this.logger.warn(`alert failed after ${attempts} attempts: service=${data.service} — ${error}`);
  }
}
