import type { Alert, ServiceStatus, StatsResponse } from "@incident-radar/shared";
import { totalErrorsInRange } from "./api/derive";

/**
 * 스탯 타일 값 계산. 컴포넌트는 이 순수 함수 결과만 그린다(렌더링 테스트 대신 여기서 검증).
 * 데이터가 아직 없으면(로딩·에러) 전부 0 으로 떨어진다.
 */

export function recentErrorCount(stats: StatsResponse | undefined): number {
  return stats ? totalErrorsInRange(stats) : 0;
}

/** sinceMs 를 주면 그 시각 이후 알림만 센다(예: 최근 24시간). */
export function alertCounts(
  alerts: Alert[] | undefined,
  sinceMs?: number,
): { dispatched: number; failed: number } {
  const acc = { dispatched: 0, failed: 0 };
  for (const a of alerts ?? []) {
    if (sinceMs !== undefined && Date.parse(a.at) < sinceMs) continue;
    if (a.status === "dispatched") acc.dispatched += 1;
    else acc.failed += 1;
  }
  return acc;
}

export function cooldownServiceCount(status: ServiceStatus[] | undefined): number {
  return (status ?? []).filter((s) => s.cooldownActive).length;
}
