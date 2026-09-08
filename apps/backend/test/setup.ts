import { seedTestCredentials } from "./auth";
import { redis, testDataSource, truncateAll, flushRedis } from "./db";

// 스위트 시작 시 한 번 연결, 각 테스트 뒤 정리, 스위트 끝에 해제.
beforeAll(async () => {
  if (!testDataSource.isInitialized) {
    await testDataSource.initialize();
  }
});

// 각 테스트는 고정 자격증명(API 토큰 + admin/viewer 유저)이 심어진 상태로 시작한다.
beforeEach(async () => {
  await seedTestCredentials();
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
