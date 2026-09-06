import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { RedisHealthService } from "../src/redis/redis-health.service";

/**
 * DB 는 실제로 붙어있는 테스트 인프라 그대로(정상 경로만 e2e로 확인).
 * DB 다운 분기는 fallback.e2e-spec.ts 와 같은 이유로 e2e 에서 흉내내지 않고
 * health.service.spec.ts(유닛)로 커버한다.
 */
async function boot(redisHealthy: boolean): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RedisHealthService)
    .useValue({ healthy: redisHealthy, onModuleInit: async () => {}, onModuleDestroy: () => {} })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe("GET /health (e2e)", () => {
  it("DB 정상 + Redis 정상 → 200 ok", async () => {
    const app = await boot(true);
    try {
      const res = await request(app.getHttpServer()).get("/health").expect(200);
      expect(res.body).toEqual({ status: "ok" });
    } finally {
      await app.close();
    }
  });

  it("DB 정상 + Redis 다운 → 200 degraded", async () => {
    const app = await boot(false);
    try {
      const res = await request(app.getHttpServer()).get("/health").expect(200);
      expect(res.body).toEqual({ status: "degraded", redis: "down" });
    } finally {
      await app.close();
    }
  });
});
