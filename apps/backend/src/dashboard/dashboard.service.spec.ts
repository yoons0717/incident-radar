import type { ConfigService } from "@nestjs/config";
import { redis, testDataSource } from "../../test/db";
import type { Env } from "../config/env.schema";
import { CooldownService } from "../cooldown/cooldown.service";
import { AlertFailure } from "../db/entities/alert-failure.entity";
import { Alert } from "../db/entities/alert.entity";
import { ErrorLog } from "../db/entities/error-log.entity";
import { DashboardService } from "./dashboard.service";

const WINDOW = 60_000;

function makeService(): DashboardService {
  const cooldown = new CooldownService(
    { client: redis } as never,
    { get: () => 300 } as unknown as ConfigService<Env, true>,
  );
  const config = { get: () => WINDOW } as unknown as ConfigService<Env, true>;
  return new DashboardService(
    testDataSource.getRepository(ErrorLog),
    testDataSource.getRepository(Alert),
    testDataSource.getRepository(AlertFailure),
    cooldown,
    config,
  );
}

const seedError = (service: string, createdAt: Date) =>
  testDataSource.getRepository(ErrorLog).save({ service, message: "x", createdAt });

const seedAlert = (service: string, at: Date) =>
  testDataSource
    .getRepository(Alert)
    .save({ service, count: 12, threshold: 10, windowMs: WINDOW, at });

const seedFailure = (service: string, failedAt: Date) =>
  testDataSource.getRepository(AlertFailure).save({
    service,
    payload: { service, count: 12 },
    error: "webhook responded 500",
    attempts: 5,
    failedAt,
  });

describe("DashboardService", () => {
  // 테스트 간 정리는 test/setup.ts 의 afterEach(truncateAll + flushRedis)

  describe("stats", () => {
    // 분(60초) 경계에 정렬된 기준 시각
    const T0 = 1_735_699_980_000;

    it("service·bucket 별로 에러 수를 시간 버킷에 집계한다", async () => {
      await seedError("checkout", new Date(T0));
      await seedError("checkout", new Date(T0 + 1_000));
      await seedError("checkout", new Date(T0 + 59_000)); // 같은 버킷
      await seedError("checkout", new Date(T0 + 60_000)); // 다음 버킷
      await seedError("auth", new Date(T0 + 2_000));

      const res = await makeService().stats({
        bucket: 60,
        from: new Date(T0 - 1_000).toISOString(),
        to: new Date(T0 + 120_000).toISOString(),
      });

      // service 이름 오름차순
      expect(res.map((s) => s.service)).toEqual(["auth", "checkout"]);

      const checkout = res.find((s) => s.service === "checkout")!;
      expect(checkout.buckets.map((b) => b.count)).toEqual([3, 1]);
      expect(checkout.buckets[0]!.t).toBe(new Date(T0).toISOString());
      expect(checkout.buckets[1]!.t).toBe(new Date(T0 + 60_000).toISOString());

      const auth = res.find((s) => s.service === "auth")!;
      expect(auth.buckets).toEqual([{ t: new Date(T0).toISOString(), count: 1 }]);
    });

    it("service 를 주면 그 서비스만 반환한다", async () => {
      await seedError("checkout", new Date(T0));
      await seedError("auth", new Date(T0));

      const res = await makeService().stats({
        service: "checkout",
        bucket: 60,
        from: new Date(T0 - 1_000).toISOString(),
        to: new Date(T0 + 60_000).toISOString(),
      });

      expect(res.map((s) => s.service)).toEqual(["checkout"]);
    });

    it("from/to 범위 밖은 세지 않는다", async () => {
      await seedError("checkout", new Date(T0 - 10_000));
      await seedError("checkout", new Date(T0 + 10_000));

      const res = await makeService().stats({
        bucket: 60,
        from: new Date(T0).toISOString(),
        to: new Date(T0 + 60_000).toISOString(),
      });

      expect(res).toHaveLength(1);
      expect(res[0]!.buckets.reduce((n, b) => n + b.count, 0)).toBe(1);
    });
  });

  describe("status", () => {
    it("최근 24h 서비스별 윈도우 개수와 cooldown 상태를 반환한다", async () => {
      const now = Date.now();
      await seedError("checkout", new Date(now - 10_000));
      await seedError("checkout", new Date(now - 20_000));
      await seedError("checkout", new Date(now - 90_000)); // 윈도우 밖
      await seedError("auth", new Date(now - 10_000));
      await seedError("stale", new Date(now - 25 * 60 * 60 * 1000)); // 24h 밖

      const svc = makeService();
      // checkout 만 cooldown 활성
      await svc["cooldown"].tryAcquire("checkout");

      const res = await svc.status();

      expect(res.map((s) => s.service)).toEqual(["auth", "checkout"]); // stale 제외

      const checkout = res.find((s) => s.service === "checkout")!;
      expect(checkout.windowCount).toBe(2);
      expect(checkout.cooldownActive).toBe(true);
      expect(checkout.cooldownTtlSec).toBeGreaterThan(0);

      const auth = res.find((s) => s.service === "auth")!;
      expect(auth.windowCount).toBe(1);
      expect(auth.cooldownActive).toBe(false);
      expect(auth.cooldownTtlSec).toBeNull();
    });
  });

  describe("recentAlerts", () => {
    it("alerts + alert_failures 를 시간 역순으로 병합하고 status 로 필드가 갈린다", async () => {
      const now = Date.now();
      await seedAlert("checkout", new Date(now - 3_000));
      await seedAlert("payments", new Date(now - 1_000));
      await seedFailure("auth", new Date(now - 2_000));

      const res = await makeService().recentAlerts({ limit: 50 });

      expect(res.map((a) => a.service)).toEqual(["payments", "auth", "checkout"]);

      const dispatched = res.find((a) => a.service === "payments")!;
      expect(dispatched).toMatchObject({
        status: "dispatched",
        count: 12,
        threshold: 10,
        windowMs: WINDOW,
      });
      expect(dispatched).not.toHaveProperty("attempts");

      const failed = res.find((a) => a.service === "auth")!;
      expect(failed).toMatchObject({ status: "failed", attempts: 5 });
      expect(failed).not.toHaveProperty("count");
      // 내부 정렬 필드가 새어나가지 않는다
      expect(res.every((a) => !("sort" in a) && !("row" in a))).toBe(true);
    });

    it("limit 은 병합 후 최신 N개로 자른다", async () => {
      const now = Date.now();
      await seedAlert("a", new Date(now - 3_000));
      await seedFailure("b", new Date(now - 2_000));
      await seedAlert("c", new Date(now - 1_000));

      const res = await makeService().recentAlerts({ limit: 2 });
      expect(res.map((a) => a.service)).toEqual(["c", "b"]);
    });
  });
});
