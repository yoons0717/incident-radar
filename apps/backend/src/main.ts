import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import type { Env } from "./config/env.schema";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // SIGTERM/SIGINT 시 onModuleDestroy 훅이 돌아 DB·Redis·큐 연결을 정리한다.
  app.enableShutdownHooks();

  const config = app.get(ConfigService<Env, true>);
  const port = config.get("PORT", { infer: true });

  await app.listen(port);
  console.log(`backend listening on :${port}`);
}

void bootstrap();
