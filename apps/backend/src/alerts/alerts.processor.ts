import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { AlertsService } from "./alerts.service";
import { ALERTS_QUEUE, type AlertJobData } from "./alerts.types";

/**
 * `alerts` 큐 소비자. 실제 로직은 AlertsService 에 있고 여기선 얇게 연결만 한다.
 * process() 가 throw 하면 BullMQ 가 재시도, 마지막 시도까지 실패하면 failed 이벤트.
 */
@Processor(ALERTS_QUEUE)
export class AlertsProcessor extends WorkerHost {
  constructor(private readonly alerts: AlertsService) {
    super();
  }

  async process(job: Job<AlertJobData>): Promise<void> {
    await this.alerts.dispatch(job.data);
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job<AlertJobData>): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return; // 재시도 남음 — 아직 최종 실패 아님
    await this.alerts.recordFailure(job.data, job.failedReason ?? "unknown", job.attemptsMade);
  }
}
