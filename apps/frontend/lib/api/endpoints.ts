import { Alert, ServiceStatus, StatsResponse } from "@incident-radar/shared";
import { z } from "zod";
import { apiGet } from "./client";

export interface StatsParams {
  service?: string | null; // null/undefined = 전체
  fromMs?: number;
  toMs?: number;
  bucketSec?: number;
}

/** 값이 있는 것만 쿼리스트링에 넣는다. 앞에 ? 포함, 없으면 빈 문자열. */
function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function getStats(p: StatsParams = {}): Promise<StatsResponse> {
  return apiGet(
    `/stats${qs({
      service: p.service ?? undefined,
      from: p.fromMs === undefined ? undefined : new Date(p.fromMs).toISOString(),
      to: p.toMs === undefined ? undefined : new Date(p.toMs).toISOString(),
      bucket: p.bucketSec,
    })}`,
    StatsResponse,
  );
}

const ServiceStatusList = z.array(ServiceStatus);
export function getStatus(): Promise<ServiceStatus[]> {
  return apiGet("/status", ServiceStatusList);
}

const AlertList = z.array(Alert);
export function getAlerts(limit?: number): Promise<Alert[]> {
  return apiGet(`/alerts${qs({ limit })}`, AlertList);
}
