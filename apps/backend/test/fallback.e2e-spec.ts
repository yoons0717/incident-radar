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
import { waitFor } from "./helpers";

/**
 * Redis 다운 시나리오. 실제 redis 프로세스를 죽이는 대신 RedisHealthService 를
 * healthy=false 로 오버라이드한다(진짜 stop 은 CI 에서 불안정, 수동 검증으로 커버).
 * 기대: 수집은 계속 201, 감지는 DB COUNT 로 동작, 알림은 메모리 cooldown + 직접 발송으로 1건.
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

  it("Redis 다운이어도 POST /errors 는 201, 임계값 넘으면 알림 정확히 1건 (degraded)", async () => {
    for (let i = 0; i < 15; i++) {
      await http()
        .post("/errors")
        .set("authorization", TEST_BEARER)
        .send({ service: "payments", message: "boom" })
        .expect(201);
    }

    // 직접 발송은 기다리지 않으므로 alerts 행이 생길 때까지 대기, 이후 추가 발송이 없는지 한 번 더 확인
    await waitFor(async () => (await repo(Alert).count()) >= 1, 3000);
    await new Promise((r) => setTimeout(r, 500));

    expect(await repo(ErrorLog).count()).toBe(15);
    expect(await repo(Alert).count()).toBe(1);
    expect(await repo(AlertFailure).count()).toBe(0);

    const degraded = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes("alert degraded: redis down"));
    expect(degraded).toHaveLength(1);
  }, 30_000);
});
