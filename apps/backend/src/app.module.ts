import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LoggerModule } from "nestjs-pino";
import { validateEnv, type Env } from "./config/env.schema";
import { CooldownModule } from "./cooldown/cooldown.module";
import { CounterModule } from "./counter/counter.module";
import { DashboardModule } from "./dashboard/dashboard.module";
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
    // dev 는 pino-pretty 로 사람이 읽기 좋게, prod 는 순수 JSON 한 줄(로그 수집기가 파싱).
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          // 테스트는 supertest 가 초당 수십 번 찌르는 실제 트래픽이 아니라 access log 로
          // 남길 가치가 없고, 테스트 실행마다 요청/응답 통째로 찍히면 실패만 눈에 안 띈다.
          autoLogging: config.get("NODE_ENV", { infer: true }) !== "test",
          // 기본 직렬화는 헤더까지 통째로 찍어 한 줄이 너무 길어진다 — 필요한 것만.
          serializers: {
            req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          transport:
            config.get("NODE_ENV", { infer: true }) === "production"
              ? undefined
              : {
                  target: "pino-pretty",
                  options: {
                    singleLine: true,
                    translateTime: "HH:MM:ss",
                    ignore: "pid,hostname,context",
                    messageFormat: "{context}: {msg}",
                  },
                },
        },
      }),
    }),
    // POST /errors 전용 IP 레이트리밋(가드는 ErrorsController 에서만 붙임).
    // X-Load-Test 헤더가 있으면 우회 — 시뮬레이터·부하테스트 트래픽용.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ ttl: 60_000, limit: config.get("RATE_LIMIT_PER_MIN", { infer: true }) }],
        skipIf: (context) =>
          context.switchToHttp().getRequest().headers["x-load-test"] !== undefined,
      }),
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
    CooldownModule,
    DashboardModule,
  ],
})
export class AppModule {}
