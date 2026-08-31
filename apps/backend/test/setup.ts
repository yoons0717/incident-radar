import { redis, testDataSource, truncateAll, flushRedis } from "./db";

// 스위트 시작 시 한 번 연결, 각 테스트 뒤 정리, 스위트 끝에 해제.
beforeAll(async () => {
  if (!testDataSource.isInitialized) {
    await testDataSource.initialize();
  }
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
