import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { DataSource } from "typeorm";
import { entities } from "./entities";

// TypeORM CLI 는 Nest 밖에서 도므로 .env 를 직접 읽는다 (로컬 → 모노레포 루트 순).
loadEnv({ path: [".env", "../../.env"] });

/**
 * 마이그레이션 CLI 전용 DataSource.
 * 앱 런타임은 app.module 의 TypeOrmModule 이 별도로 연결한다.
 */
export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities,
  migrations: [__dirname + "/migrations/*.{ts,js}"],
  synchronize: false,
  // uuid 기본값을 gen_random_uuid() 로 (uuid-ossp 확장 불필요, PG13+ 코어)
  uuidExtension: "pgcrypto",
  logging: ["error", "warn", "migration"],
});
