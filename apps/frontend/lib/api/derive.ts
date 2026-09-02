import type { StatsResponse } from "@incident-radar/shared";

/**
 * `/status` 는 fetch 시점의 cooldown 잔여 TTL(초)만 준다. 폴링 주기(5초) 사이에는
 * 경과 시간을 빼서 보간한다. 비활성이면 null, 만료면 0(음수 없음).
 */
export function cooldownRemaining(
  ttlSecAtFetch: number | null,
  fetchedAtMs: number,
  nowMs: number,
): number | null {
  if (ttlSecAtFetch === null) return null;
  const elapsedSec = (nowMs - fetchedAtMs) / 1000;
  return Math.max(0, Math.ceil(ttlSecAtFetch - elapsedSec));
}

/** `/stats` 응답의 모든 시리즈·버킷 count 합계 (요약 타일용). */
export function totalErrorsInRange(stats: StatsResponse): number {
  return stats.reduce(
    (sum, series) => sum + series.buckets.reduce((n, b) => n + b.count, 0),
    0,
  );
}
