import Redis from "ioredis";
import { DataSource } from "typeorm";
import { entities } from "../src/db/entities";

/**
 * 테스트용 DataSource / Redis.
 * 스키마는 test.mjs 가 jest 실행 전에 migration:run 으로 만들어 둔다.
 */
export const testDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities,
  synchronize: false,
  uuidExtension: "pgcrypto",
});

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380", {
  maxRetriesPerRequest: 1,
});

/** 모든 엔티티 테이블 비우기 (테스트 간 격리) */
export async function truncateAll(): Promise<void> {
  const tables = entities.map((e) => testDataSource.getMetadata(e).tableName);
  if (tables.length === 0) return;
  await testDataSource.query(
    `TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export async function flushRedis(): Promise<void> {
  await redis.flushdb();
}
