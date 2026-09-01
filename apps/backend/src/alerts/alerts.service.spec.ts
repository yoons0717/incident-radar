import type { Queue } from "bullmq";
import type { ConfigService } from "@nestjs/config";
import { testDataSource } from "../../test/db";
import type { Env } from "../config/env.schema";
import { AlertFailure } from "../db/entities/alert-failure.entity";
import { Alert } from "../db/entities/alert.entity";
import { AlertsService } from "./alerts.service";
import type { AlertJobData } from "./alerts.types";

const JOB: AlertJobData = { service: "checkout", count: 12, threshold: 10, windowMs: 60_000 };

function makeService(webhookUrl?: string) {
  const queue = { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue<AlertJobData>;
  const config = {
    get: () => webhookUrl,
  } as unknown as ConfigService<Env, true>;
  const service = new AlertsService(
    queue,
    config,
    testDataSource.getRepository(Alert),
    testDataSource.getRepository(AlertFailure),
  );
  return { service, queue };
}

describe("AlertsService", () => {
  // 테스트 간 정리는 test/setup.ts 의 afterEach(truncateAll)

  describe("enqueue", () => {
    it("재시도 5회·지수 백오프+지터로 잡을 넣는다", async () => {
      const { service, queue } = makeService();
      await service.enqueue(JOB);
      expect(queue.add).toHaveBeenCalledWith(
        "dispatch",
        JOB,
        expect.objectContaining({
          attempts: 5,
          backoff: { type: "exponential", delay: 1000, jitter: 0.2 },
        }),
      );
    });
  });

  describe("dispatch", () => {
    it("webhook 이 없으면 로그로 대체하고 alerts 행을 남긴다", async () => {
      const { service } = makeService(undefined);
      await service.dispatch(JOB);

      const rows = await testDataSource.getRepository(Alert).find();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        service: "checkout",
        count: 12,
        threshold: 10,
        windowMs: 60_000,
        status: "dispatched",
      });
    });

    it("webhook 이 있으면 payload 를 POST 하고 alerts 행을 남긴다", async () => {
      const fetchSpy = jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));
      const { service } = makeService("https://hook.example/incident");

      await service.dispatch(JOB);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(url).toBe("https://hook.example/incident");
      expect(JSON.parse(String(init?.body))).toMatchObject({ service: "checkout", count: 12 });
      expect(await testDataSource.getRepository(Alert).count()).toBe(1);

      fetchSpy.mockRestore();
    });

    it("webhook 이 실패(!ok)하면 throw 하고 alerts 행을 남기지 않는다", async () => {
      const fetchSpy = jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 500 }));
      const { service } = makeService("https://hook.example/incident");

      await expect(service.dispatch(JOB)).rejects.toThrow(/500/);
      expect(await testDataSource.getRepository(Alert).count()).toBe(0);

      fetchSpy.mockRestore();
    });
  });

  describe("recordFailure", () => {
    it("payload·error·attempts 를 담은 alert_failures 행을 남긴다", async () => {
      const { service } = makeService();
      await service.recordFailure(JOB, "webhook responded 404", 5);

      const rows = await testDataSource.getRepository(AlertFailure).find();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        service: "checkout",
        payload: JOB,
        error: "webhook responded 404",
        attempts: 5,
      });
    });
  });
});
