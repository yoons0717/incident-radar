import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Alert, ErrorLog, ErrorLogInput, ServiceStatus, StatsResponse } from "@incident-radar/shared";
import { AlertsQuery, StatsQuery } from "../dashboard/dashboard.schema";
import { ErrorsQuery } from "../errors/errors.schema";

extendZodWithOpenApi(z);

/**
 * `/docs` 문서는 실제 검증에 쓰는 Zod 스키마를 그대로 등록해서 만든다(컨트롤러에
 * @ApiResponse 데코레이터를 따로 안 붙임) — 응답 모양이 바뀌면 스키마 하나만 고치면
 * 문서도 같이 맞다.
 */
const registry = new OpenAPIRegistry();

const ErrorLogSchema = registry.register("ErrorLog", ErrorLog);
const ErrorLogInputSchema = registry.register("ErrorLogInput", ErrorLogInput);
const StatsResponseSchema = registry.register("StatsResponse", StatsResponse);
const ServiceStatusSchema = registry.register("ServiceStatus", ServiceStatus);
const AlertSchema = registry.register("Alert", Alert);

// /health 는 프론트가 안 써서 공유 스키마가 없다 — 문서 전용으로 여기서만 정의.
const HealthResultSchema = registry.register(
  "HealthResult",
  z.union([
    z.object({ status: z.literal("ok") }),
    z.object({ status: z.literal("degraded"), redis: z.literal("down") }),
  ]),
);

registry.registerPath({
  method: "post",
  path: "/errors",
  summary: "에러 로그 1건 저장",
  request: { body: { content: { "application/json": { schema: ErrorLogInputSchema } } } },
  responses: {
    201: { description: "생성됨", content: { "application/json": { schema: ErrorLogSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/errors",
  summary: "에러 로그 이력 조회",
  request: { query: ErrorsQuery },
  responses: {
    200: {
      description: "created_at 역순",
      content: { "application/json": { schema: z.array(ErrorLogSchema) } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/stats",
  summary: "서비스별 에러 추이 (시간 버킷)",
  request: { query: StatsQuery },
  responses: {
    200: {
      description: "서비스별 버킷 시계열",
      content: { "application/json": { schema: StatsResponseSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/status",
  summary: "서비스별 최근 윈도우 카운트 + cooldown 상태",
  responses: {
    200: {
      description: "최근 24h 등장한 서비스 배열",
      content: { "application/json": { schema: z.array(ServiceStatusSchema) } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/alerts",
  summary: "최근 알림 (발송/실패 병합, 시간 역순)",
  request: { query: AlertsQuery },
  responses: {
    200: { description: "알림 배열", content: { "application/json": { schema: z.array(AlertSchema) } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/health",
  summary: "헬스체크 — DB 는 필수, Redis 는 fail-open",
  responses: {
    200: {
      description: "ok 또는 degraded",
      content: { "application/json": { schema: HealthResultSchema } },
    },
    503: { description: "DB 다운 또는 응답 지연(1.5초 초과)" },
  },
});

export function buildOpenApiDocument(): OpenAPIObject {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: { title: "Incident Radar API", version: "0.1.0" },
  }) as OpenAPIObject;
}
