import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Alert as AlertSchema, ErrorLog as ErrorLogSchema, ServiceStatus, StatsResponse } from "@incident-radar/shared";
import request from "supertest";
import { z } from "zod";
import { AppModule } from "../src/app.module";
import { AlertFailure } from "../src/db/entities/alert-failure.entity";
import { Alert } from "../src/db/entities/alert.entity";
import { testDataSource } from "./db";

describe("dashboard endpoints (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const alertRepo = () => testDataSource.getRepository(Alert);
  const failureRepo = () => testDataSource.getRepository(AlertFailure);

  it("버스트 → /stats·/status·/alerts 가 공유 스키마로 parse 되고 값이 맞다 (스펙 6절)", async () => {
    for (let i = 0; i < 15; i++) {
      await http().post("/errors").send({ service: "checkout", message: "boom" }).expect(201);
    }
    await waitFor(async () => (await alertRepo().count()) >= 1, 8000);

    expect(await alertRepo().count()).toBe(1);
    expect(await failureRepo().count()).toBe(0);

    const errs = await http().get("/errors?service=checkout").expect(200);
    expect(z.array(ErrorLogSchema).parse(errs.body)).toHaveLength(15);

    const stats = await http().get("/stats?service=checkout&bucket=60").expect(200);
    const parsedStats = StatsResponse.parse(stats.body);
    const total = parsedStats
      .flatMap((s) => s.buckets)
      .reduce((n, b) => n + b.count, 0);
    expect(total).toBe(15);

    const status = await http().get("/status").expect(200);
    const parsedStatus = z.array(ServiceStatus).parse(status.body);
    const checkout = parsedStatus.find((s) => s.service === "checkout");
    expect(checkout?.cooldownActive).toBe(true);
    expect(checkout?.cooldownTtlSec).toBeGreaterThan(0);
    expect(checkout?.windowCount).toBeGreaterThanOrEqual(11);

    const alerts = await http().get("/alerts").expect(200);
    const parsedAlerts = z.array(AlertSchema).parse(alerts.body);
    expect(parsedAlerts).toHaveLength(1);
    expect(parsedAlerts[0]?.status).toBe("dispatched");
  }, 30_000);
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(cond: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cond()) return;
    await sleep(100);
  }
  throw new Error(`waitFor timeout after ${timeoutMs}ms`);
}
