import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { validateEnv, type Env } from "./config/env.schema";
import { CounterModule } from "./counter/counter.module";
import { entities } from "./db/entities";
import { ErrorsModule } from "./errors/errors.module";
import { HealthModule } from "./health/health.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 로컬 .env 를 먼저, 없으면 모노레포 루트 .env 를 읽는다.
      envFilePath: [".env", "../../.env"],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        type: "postgres",
        url: config.get("DATABASE_URL", { infer: true }),
        entities,
        synchronize: false, // 스키마 변경은 마이그레이션으로만
        migrationsRun: false, // 마이그레이션은 CLI/엔트리포인트에서 (T28)
        uuidExtension: "pgcrypto", // gen_random_uuid() 사용
      }),
    }),
    RedisModule,
    HealthModule,
    ErrorsModule,
    CounterModule,
  ],
})
export class AppModule {}
