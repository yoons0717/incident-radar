import { z } from "zod";

/**
 * 이 파일이 백엔드/프론트의 API 계약 단일 출처다.
 * 스키마만 정의하고, 타입은 z.infer 로 파생한다 (수기 타입 금지).
 */

const uuid = z.string().uuid();
const isoDateTime = z.string().datetime();
const serviceName = z.string().min(1).max(100);

// --- 에러 수집 -------------------------------------------------------------

/** POST /errors 요청 본문 */
export const ErrorLogInput = z.object({
  service: serviceName,
  message: z.string().min(1).max(8192),
});
export type ErrorLogInput = z.infer<typeof ErrorLogInput>;

/** error_logs 한 행 (GET /errors 응답 요소) */
export const ErrorLog = z.object({
  id: uuid,
  service: serviceName,
  message: z.string(),
  createdAt: isoDateTime,
});
export type ErrorLog = z.infer<typeof ErrorLog>;

// --- 알림 ---------------------------------------------------------------

/** 발송 성공한 알림 (alerts 테이블) */
export const AlertDispatched = z.object({
  id: uuid,
  service: serviceName,
  status: z.literal("dispatched"),
  at: isoDateTime,
  count: z.number().int().nonnegative(),
  threshold: z.number().int().positive(),
  windowMs: z.number().int().positive(),
});

/** 재시도 소진 후 실패한 알림 (alert_failures 테이블) */
export const AlertFailed = z.object({
  id: uuid,
  service: serviceName,
  status: z.literal("failed"),
  at: isoDateTime,
  attempts: z.number().int().positive(),
  error: z.string(),
});

/** GET /alerts 응답 요소 — status 로 갈라지는 판별 유니온 */
export const Alert = z.discriminatedUnion("status", [AlertDispatched, AlertFailed]);
export type Alert = z.infer<typeof Alert>;

/** alert_failures 한 행 (실패 이력 상세 조회용) */
export const AlertFailure = z.object({
  id: uuid,
  service: serviceName,
  payload: z.unknown(),
  error: z.string(),
  attempts: z.number().int().positive(),
  failedAt: isoDateTime,
});
export type AlertFailure = z.infer<typeof AlertFailure>;

// --- 대시보드 조회 -----------------------------------------------------

/** GET /status 응답 요소 */
export const ServiceStatus = z.object({
  service: serviceName,
  windowCount: z.number().int().nonnegative(),
  cooldownActive: z.boolean(),
  cooldownTtlSec: z.number().int().nonnegative().nullable(),
});
export type ServiceStatus = z.infer<typeof ServiceStatus>;

/** GET /stats 응답: 서비스별 시간 버킷 카운트 */
export const StatsBucket = z.object({
  t: isoDateTime,
  count: z.number().int().nonnegative(),
});
export const StatsSeries = z.object({
  service: serviceName,
  buckets: z.array(StatsBucket),
});
export const StatsResponse = z.array(StatsSeries);
export type StatsResponse = z.infer<typeof StatsResponse>;
