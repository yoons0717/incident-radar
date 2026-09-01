import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AlertFailure } from "../src/db/entities/alert-failure.entity";
import { Alert } from "../src/db/entities/alert.entity";
import { testDataSource } from "./db";

describe("alerts pipeline (e2e)", () => {
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

  it("임계값 넘게 쏘면 alerts 1행, 폭주해도 cooldown 때문에 추가 없음", async () => {
    // .env.test 에 WEBHOOK_URL 없음 → 워커가 로그로 대체하고 alerts 행만 남긴다
    for (let i = 0; i < 15; i++) {
      await http().post("/errors").send({ service: "payments", message: "boom" }).expect(201);
    }

    await waitFor(async () => (await alertRepo().count()) >= 1, 8000);

    expect(await alertRepo().count()).toBe(1);
    expect(await failureRepo().count()).toBe(0);

    const row = await alertRepo().findOneByOrFail({ service: "payments" });
    expect(row.count).toBeGreaterThanOrEqual(11);
    expect(row.threshold).toBe(10);
    expect(row.windowMs).toBe(60_000);

    // cooldown 이 살아있으므로 더 쏴도 enqueue 안 됨 → 여전히 1행
    for (let i = 0; i < 5; i++) {
      await http().post("/errors").send({ service: "payments", message: "boom" }).expect(201);
    }
    await sleep(500);
    expect(await alertRepo().count()).toBe(1);
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
