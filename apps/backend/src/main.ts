import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import type { Env } from "./config/env.schema";
import { buildOpenApiDocument } from "./openapi/openapi.document";

async function bootstrap() {
  // bufferLogs: true — useLogger 로 pino 를 붙이기 전(모듈 초기화 중) 로그가
  // 유실되지 않고 버퍼링됐다가 붙는 순간 한꺼번에 플러시된다.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // SIGTERM/SIGINT 시 onModuleDestroy 훅이 돌아 DB·Redis·큐 연결을 정리한다.
  app.enableShutdownHooks();

  // 문서는 실제 Zod 스키마에서 파생(openapi.document.ts) — /docs(UI) + /docs-json.
  SwaggerModule.setup("docs", app, buildOpenApiDocument());

  const config = app.get(ConfigService<Env, true>);

  // 대시보드(다른 포트)에서의 호출 허용. origin 은 env 로 명시 — 와일드카드 금지.
  app.enableCors({ origin: config.get("CORS_ORIGIN", { infer: true }) });

  const port = config.get("PORT", { infer: true });

  await app.listen(port);
  app.get(Logger).log(`backend listening on :${port}`, "Bootstrap");
}

void bootstrap();
