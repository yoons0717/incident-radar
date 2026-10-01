import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { TEST_BEARER } from "./auth";
import { AlertsService } from "../src/alerts/alerts.service";
import { CooldownService } from "../src/cooldown/cooldown.service";
import { RedisSlidingWindowCounter } from "../src/counter/redis-sliding-window.counter";
import { ErrorLog } from "../src/db/entities/error-log.entity";
import { testDataSource } from "./db";

/**
 * 헬스 플래그는 healthy=true 인데 요청 처리 도중 Redis 호출이 실패/정체하는 경우.
 * (fallback.e2e-spec 은 처음부터 healthy=false 인 경우만 본다.)
 * 실제 Redis 를 죽이는 대신 Redis 를 쓰는 단계 하나를 spy 로 실패/무한 대기시킨다.
 * 기대: 에러 행이 저장됐다면 Redis 상태와 무관하게 201 을 빨리 돌려준다.
 */
describe("redis failure mid-request (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const redisDown = () => Promise.reject(new Error("Reached the max retries per request limit"));
  // 임계값(10) 초과까지 쏘되 각 요청이 1초 안에 201 이어야 한다.
  const postMany = async (n: number) => {
    for (let i = 0; i < n; i++) {
      await request(app.getHttpServer())
        .post("/errors")
        .set("authorization", TEST_BEARER)
        .send({ service: "payments", message: "boom" })
        .timeout(1000)
        .expect(201);
    }
  };

  it("카운트 단계에서 Redis 가 실패해도 201 (DB 로 다시 센다)", async () => {
    jest.spyOn(app.get(RedisSlidingWindowCounter), "record").mockImplementation(redisDown);
    await postMany(11);
    expect(await testDataSource.getRepository(ErrorLog).count()).toBe(11);
  });

  it("cooldown 단계에서 Redis 가 실패해도 201", async () => {
    jest.spyOn(app.get(CooldownService), "tryAcquire").mockImplementation(redisDown);
    await postMany(11);
    expect(await testDataSource.getRepository(ErrorLog).count()).toBe(11);
  });

  it("알림 큐 적재가 끝나지 않아도 바로 201", async () => {
    jest.spyOn(app.get(AlertsService), "enqueue").mockReturnValue(new Promise(() => {}));
    await postMany(11);
    expect(await testDataSource.getRepository(ErrorLog).count()).toBe(11);
  });
});
