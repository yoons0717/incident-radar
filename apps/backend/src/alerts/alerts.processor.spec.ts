import type { Job } from "bullmq";
import type { AlertsService } from "./alerts.service";
import { AlertsProcessor } from "./alerts.processor";
import type { AlertJobData } from "./alerts.types";

const DATA: AlertJobData = {
  service: "checkout",
  count: 12,
  threshold: 10,
  windowMs: 60_000,
  windowStart: 1_699_999_980_000,
};

function makeProcessor() {
  const recordFailureCalls: Array<[AlertJobData, string, number]> = [];
  const alerts = {
    recordFailure: async (d: AlertJobData, e: string, a: number) => {
      recordFailureCalls.push([d, e, a]);
    },
  } as unknown as AlertsService;
  return { processor: new AlertsProcessor(alerts), recordFailureCalls };
}

function fakeJob(attemptsMade: number): Job<AlertJobData> {
  return {
    data: DATA,
    opts: { attempts: 5 },
    attemptsMade,
    failedReason: "webhook responded 404",
  } as unknown as Job<AlertJobData>;
}

describe("AlertsProcessor.onFailed", () => {
  it("재시도가 남아 있으면 실패를 기록하지 않는다", async () => {
    const { processor, recordFailureCalls } = makeProcessor();
    await processor.onFailed(fakeJob(3));
    expect(recordFailureCalls).toHaveLength(0);
  });

  it("마지막 시도까지 실패하면 recordFailure 를 호출한다", async () => {
    const { processor, recordFailureCalls } = makeProcessor();
    await processor.onFailed(fakeJob(5));
    expect(recordFailureCalls).toEqual([[DATA, "webhook responded 404", 5]]);
  });
});
