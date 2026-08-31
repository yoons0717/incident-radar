import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.schema";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 로컬 .env 를 먼저, 없으면 모노레포 루트 .env 를 읽는다.
      envFilePath: [".env", "../../.env"],
      validate: validateEnv,
    }),
    HealthModule,
  ],
})
export class AppModule {}
