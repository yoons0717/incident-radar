"use client";

import { useQuery } from "@tanstack/react-query";
import { alertsQuery, statsQuery, statusQuery, type StatsQueryParams } from "./queries";

/** 팩토리 + useQuery 한 줄. 폴링·staleTime 은 Providers 의 QueryClient 기본값. */
export function useStats(params: StatsQueryParams) {
  return useQuery(statsQuery(params));
}

export function useStatus() {
  return useQuery(statusQuery());
}

export function useAlerts(limit?: number) {
  return useQuery(alertsQuery(limit));
}
