import type { HealthResponse } from "@incident-radar/shared";
import { ApiError } from "./api/client";

export type HealthBannerKind = "degraded" | "db-down";

/**
 * /health 결과 → 대시보드 상단 배너 종류. null 이면 배너 없음.
 *   - degraded(Redis 다운) → 경고: 감지는 DB 로, 알림은 재시도 없이 1회.
 *   - 503(DB 다운) → 위험: 에러 수집 자체가 실패. 이전 값이 남아 있어도 에러가 우선.
 *   - 네트워크 실패(백엔드 불통)는 배너 없음 — 각 패널이 이미 같은 에러를 보여준다.
 */
export function healthBanner(
  data: HealthResponse | undefined,
  isError: boolean,
  error: unknown,
): HealthBannerKind | null {
  if (isError) {
    return error instanceof ApiError && error.kind === "http" && error.status === 503
      ? "db-down"
      : null;
  }
  return data?.status === "degraded" ? "degraded" : null;
}
