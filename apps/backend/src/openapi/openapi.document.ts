import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Alert, ErrorLog, ErrorLogInput, ServiceStatus, StatsResponse } from "@incident-radar/shared";
import { CreateApiKeyInput } from "../api-key/api-key.schema";
import { LoginInput } from "../auth/auth.schema";
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
const LoginInputSchema = registry.register("LoginInput", LoginInput);
const CreateApiKeyInputSchema = registry.register("CreateApiKeyInput", CreateApiKeyInput);

// POST /errors 는 API 키(Authorization: Bearer <key>), 조회·관리 라우트는 로그인 세션 쿠키.
const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
});
const cookieAuth = registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "connect.sid",
});
const session = [{ [cookieAuth.name]: [] }];

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
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: ErrorLogInputSchema } } } },
  responses: {
    201: { description: "생성됨", content: { "application/json": { schema: ErrorLogSchema } } },
    401: { description: "API 키 없음 또는 무효" },
  },
});

registry.registerPath({
  method: "get",
  path: "/errors",
  summary: "에러 로그 이력 조회",
  security: session,
  request: { query: ErrorsQuery },
  responses: {
    200: {
      description: "created_at 역순",
      content: { "application/json": { schema: z.array(ErrorLogSchema) } },
    },
    401: { description: "로그인 필요" },
  },
});

registry.registerPath({
  method: "get",
  path: "/stats",
  summary: "서비스별 에러 추이 (시간 버킷)",
  security: session,
  request: { query: StatsQuery },
  responses: {
    200: {
      description: "서비스별 버킷 시계열",
      content: { "application/json": { schema: StatsResponseSchema } },
    },
    401: { description: "로그인 필요" },
  },
});

registry.registerPath({
  method: "get",
  path: "/status",
  summary: "서비스별 최근 윈도우 카운트 + cooldown 상태",
  security: session,
  responses: {
    200: {
      description: "최근 24h 등장한 서비스 배열",
      content: { "application/json": { schema: z.array(ServiceStatusSchema) } },
    },
    401: { description: "로그인 필요" },
  },
});

registry.registerPath({
  method: "get",
  path: "/alerts",
  summary: "최근 알림 (발송/실패 병합, 시간 역순)",
  security: session,
  request: { query: AlertsQuery },
  responses: {
    200: {
      description: "알림 배열",
      content: { "application/json": { schema: z.array(AlertSchema) } },
    },
    401: { description: "로그인 필요" },
  },
});

// --- 인증 ---

registry.registerPath({
  method: "post",
  path: "/auth/login",
  summary: "로그인 — 세션 쿠키 발급",
  request: { body: { content: { "application/json": { schema: LoginInputSchema } } } },
  responses: {
    200: { description: "로그인됨 ({ email, role })" },
    401: { description: "이메일/비밀번호 불일치" },
    429: { description: "시도 과다 (분당 10회 제한)" },
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  summary: "로그아웃 — 세션 삭제",
  responses: { 204: { description: "로그아웃됨" } },
});

registry.registerPath({
  method: "get",
  path: "/auth/me",
  summary: "현재 로그인 사용자",
  security: session,
  responses: {
    200: { description: "{ email, role }" },
    401: { description: "로그인 필요" },
  },
});

// --- API 키 관리 (admin 전용) ---

registry.registerPath({
  method: "post",
  path: "/api-keys",
  summary: "API 키 발급 (평문 토큰은 이 응답에서만)",
  security: session,
  request: { body: { content: { "application/json": { schema: CreateApiKeyInputSchema } } } },
  responses: {
    201: { description: "{ id, name, token }" },
    401: { description: "로그인 필요" },
    403: { description: "admin 아님" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api-keys",
  summary: "API 키 목록 (해시·평문 제외)",
  security: session,
  responses: {
    200: { description: "키 메타데이터 배열" },
    403: { description: "admin 아님" },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api-keys/{id}",
  summary: "API 키 폐기",
  security: session,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: "폐기됨" },
    403: { description: "admin 아님" },
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
