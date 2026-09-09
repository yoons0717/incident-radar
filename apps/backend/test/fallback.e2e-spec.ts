import { Logger, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { TEST_BEARER } from "./auth";
import { AlertFailure } from "../src/db/entities/alert-failure.entity";
import { Alert } from "../src/db/entities/alert.entity";
import { ErrorLog } from "../src/db/entities/error-log.entity";
import { RedisHealthService } from "../src/redis/redis-health.service";
import { testDataSource } from "./db";

/**
 * Redis 다운 시나리오. 실제 redis 프로세스를 죽이는 대신 RedisHealthService 를
 * healthy=false 로 오버라이드한다(진짜 stop 은 CI 에서 불안정, 수동 검증으로 커버).
 * 기대: 수집은 계속 201, 감지는 DB COUNT 로 동작, 알림 발송만 정지.
 */
describe("redis-down fallback (e2e)", () => {
  let app: INestApplication;
  let warn: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisHealthService)
      .useValue({ healthy: false, onModuleInit: async () => {}, onModuleDestroy: () => {} })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, "warn");
  });
  afterEach(() => {
    warn.mockRestore();
  });

  const http = () => request(app.getHttpServer());
  const repo = <T extends object>(e: { new (): T }) => testDataSource.getRepository(e);

  it("Redis 다운이어도 POST /errors 는 201, 임계값 넘으면 발송만 정지", async () => {
    for (let i = 0; i < 15; i++) {
      await http()
        .post("/errors")
        .set("authorization", TEST_BEARER)
        .send({ service: "payments", message: "boom" })
        .expect(201);
    }

    // 짧게 대기: 혹시 잘못 enqueue 됐다면 워커가 처리할 시간
    await new Promise((r) => setTimeout(r, 500));

    expect(await repo(ErrorLog).count()).toBe(15);
    expect(await repo(Alert).count()).toBe(0);
    expect(await repo(AlertFailure).count()).toBe(0);

    const suppressed = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes("alert suppressed: redis down"));
    expect(suppressed.length).toBeGreaterThan(0);
  }, 30_000);
});
