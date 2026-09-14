import { createServer, type Server, type IncomingHttpHeaders } from "node:http";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { TEST_BEARER } from "./auth";
import { AlertFailure } from "../src/db/entities/alert-failure.entity";
import { Alert } from "../src/db/entities/alert.entity";
import { testDataSource } from "./db";
import { waitFor } from "./helpers";

/**
 * 플랜 12·13번 검증 기준(WEBHOOK_URL 404 시 재시도 5회 후 실패 행, 목 서버에 멱등성 헤더 도착)을
 * 실제로 태우는 통합 테스트. alerts.e2e-spec.ts 는 WEBHOOK_URL 미설정 경로만 태우므로
 * 여기서 별도 앱 인스턴스로 WEBHOOK_URL 을 목 서버에 맞춰 기동한다 — ConfigService 가
 * 모듈 컴파일 시점에 process.env 를 읽어서 테스트마다 값을 못 바꾼다.
 */
describe("alerts webhook 실패 경로 (e2e)", () => {
  let app: INestApplication;
  let mock: Server;
  let mockPort: number;
  const received: IncomingHttpHeaders[] = [];

  beforeAll(async () => {
    mock = createServer((req, res) => {
      received.push(req.headers);
      req.resume();
      req.on("end", () => res.writeHead(404).end());
    });
    await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve));
    mockPort = (mock.address() as { port: number }).port;

    process.env.WEBHOOK_URL = `http://127.0.0.1:${mockPort}`;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => mock.close(() => resolve()));
    // 다음 파일에서 ConfigModule 이 이 값을 물려받지 않도록 원복.
    delete process.env.WEBHOOK_URL;
  });

  const http = () => request(app.getHttpServer());
  const postErr = (body: object) =>
    http().post("/errors").set("authorization", TEST_BEARER).send(body);
  const alertRepo = () => testDataSource.getRepository(Alert);
  const failureRepo = () => testDataSource.getRepository(AlertFailure);

  it("webhook 이 계속 404 면 5회 재시도 후 alert_failures 행, 매 요청에 동일한 멱등성 헤더", async () => {
    for (let i = 0; i < 15; i++) {
      await postErr({ service: "payments", message: "boom" }).expect(201);
    }

    // attempts:5, exponential backoff(delay 1000, jitter 0.2) → 재시도 간격 합 ~15s + 지터/오버헤드.
    await waitFor(async () => (await failureRepo().count()) >= 1, 35_000);

    expect(await alertRepo().count()).toBe(0);

    const row = await failureRepo().findOneByOrFail({ service: "payments" });
    expect(row.attempts).toBe(5);
    expect(row.error).toMatch(/404/);

    expect(received).toHaveLength(5);
    const keys = received.map((h) => h["x-idempotency-key"]);
    expect(keys.every((k) => typeof k === "string" && /^payments:\d+$/.test(k))).toBe(true);
    expect(new Set(keys).size).toBe(1);
  }, 45_000);
});
