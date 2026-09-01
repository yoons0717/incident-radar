import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import type { Env } from "../config/env.schema";
import { AlertFailure } from "../db/entities/alert-failure.entity";
import { Alert } from "../db/entities/alert.entity";
import { AlertsProcessor } from "./alerts.processor";
import { AlertsService } from "./alerts.service";
import { ALERTS_QUEUE } from "./alerts.types";

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert, AlertFailure]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        // ponytail: host/port 만 추출 — 비밀번호·DB인덱스 있는 URL 이면 파싱 확장 필요.
        // 로컬/테스트/compose 는 모두 무인증이라 지금은 충분.
        const u = new URL(config.get("REDIS_URL", { infer: true }));
        return { connection: { host: u.hostname, port: Number(u.port) || 6379 } };
      },
    }),
    BullModule.registerQueue({ name: ALERTS_QUEUE }),
  ],
  providers: [AlertsService, AlertsProcessor],
  exports: [AlertsService],
})
export class AlertsModule {}
