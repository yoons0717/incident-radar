import { seedTestApiKey } from "./auth";
import { redis, testDataSource, truncateAll, flushRedis } from "./db";

// 스위트 시작 시 한 번 연결, 각 테스트 뒤 정리, 스위트 끝에 해제.
beforeAll(async () => {
  if (!testDataSource.isInitialized) {
    await testDataSource.initialize();
  }
});

// 각 테스트는 고정 API 토큰이 심어진 상태로 시작한다 (e2e 의 POST /errors 인증용).
beforeEach(async () => {
  await seedTestApiKey();
});

afterEach(async () => {
  await truncateAll();
  await flushRedis();
});

afterAll(async () => {
  if (testDataSource.isInitialized) {
    await testDataSource.destroy();
  }
  redis.disconnect();
});
