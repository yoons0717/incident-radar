import { getAlerts, getStats, getStatus } from "./endpoints";

/** 대시보드 폴링 주기. staleTime 과 refetchInterval 에 함께 쓴다. */
export const POLL_MS = 5_000;

export interface StatsQueryParams {
  service?: string | null; // null/undefined = 전체
  rangeMinutes: number; // "최근 N분" — 절대 시각이 아니라 기간
  bucketSec?: number;
}

/**
 * useQuery 에 그대로 넘길 수 있는 { queryKey, queryFn } 객체를 만든다.
 * 훅(useStats 등)은 이 팩토리 + useQuery 한 줄이라, 테스트는 여기(순수 함수)만 본다.
 *
 * from/to 는 queryFn 안에서 매 실행마다 Date.now() 기준으로 계산한다 — 슬라이딩 창.
 * queryKey 에는 rangeMinutes 만 넣어 안정적으로 유지(절대 시각을 키에 넣으면 매 렌더 refetch).
 */
export function statsQuery({ service = null, rangeMinutes, bucketSec }: StatsQueryParams) {
  return {
    queryKey: ["stats", service, rangeMinutes, bucketSec ?? null] as const,
    queryFn: () =>
      getStats({ service, fromMs: Date.now() - rangeMinutes * 60_000, bucketSec }),
  };
}

export function statusQuery() {
  return { queryKey: ["status"] as const, queryFn: () => getStatus() };
}

export function alertsQuery(limit?: number) {
  return {
    queryKey: ["alerts", limit ?? null] as const,
    queryFn: () => getAlerts(limit),
  };
}
