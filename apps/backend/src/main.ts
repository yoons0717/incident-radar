import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import type { Env } from "./config/env.schema";
import { buildOpenApiDocument } from "./openapi/openapi.document";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // SIGTERM/SIGINT 시 onModuleDestroy 훅이 돌아 DB·Redis·큐 연결을 정리한다.
  app.enableShutdownHooks();

  // 문서는 실제 Zod 스키마에서 파생(openapi.document.ts) — /docs(UI) + /docs-json.
  SwaggerModule.setup("docs", app, buildOpenApiDocument());

  const config = app.get(ConfigService<Env, true>);

  // 대시보드(다른 포트)에서의 호출 허용. origin 은 env 로 명시 — 와일드카드 금지.
  app.enableCors({ origin: config.get("CORS_ORIGIN", { infer: true }) });

  const port = config.get("PORT", { infer: true });

  await app.listen(port);
  console.log(`backend listening on :${port}`);
}

void bootstrap();
