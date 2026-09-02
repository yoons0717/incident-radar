import type { Alert, ServiceStatus, StatsResponse } from "@incident-radar/shared";
import { describe, expect, it } from "vitest";
import { alertCounts, cooldownServiceCount, recentErrorCount } from "./tiles";

describe("recentErrorCount", () => {
  it("데이터 없으면(undefined) 0", () => {
    expect(recentErrorCount(undefined)).toBe(0);
  });

  it("모든 시리즈·버킷 count 합", () => {
    const stats: StatsResponse = [
      { service: "a", buckets: [{ t: "2026-01-01T00:00:00Z", count: 2 }, { t: "2026-01-01T00:01:00Z", count: 3 }] },
      { service: "b", buckets: [{ t: "2026-01-01T00:00:00Z", count: 1 }] },
    ];
    expect(recentErrorCount(stats)).toBe(6);
  });
});

describe("alertCounts", () => {
  it("데이터 없으면 {0, 0}", () => {
    expect(alertCounts(undefined)).toEqual({ dispatched: 0, failed: 0 });
  });

  it("status 로 dispatched/failed 를 센다", () => {
    const alerts = [
      { id: "1", service: "a", status: "dispatched", at: "2026-01-01T00:00:00Z", count: 12, threshold: 10, windowMs: 60000 },
      { id: "2", service: "b", status: "failed", at: "2026-01-01T00:01:00Z", attempts: 5, error: "x" },
      { id: "3", service: "c", status: "dispatched", at: "2026-01-01T00:02:00Z", count: 11, threshold: 10, windowMs: 60000 },
    ] as Alert[];
    expect(alertCounts(alerts)).toEqual({ dispatched: 2, failed: 1 });
  });

  it("sinceMs 이전 알림은 제외한다", () => {
    const alerts = [
      { id: "1", service: "a", status: "dispatched", at: "2026-01-01T00:00:00Z", count: 12, threshold: 10, windowMs: 60000 },
      { id: "2", service: "b", status: "failed", at: "2026-01-02T00:00:00Z", attempts: 5, error: "x" },
    ] as Alert[];
    expect(alertCounts(alerts, Date.parse("2026-01-01T12:00:00Z"))).toEqual({
      dispatched: 0,
      failed: 1,
    });
  });
});

describe("cooldownServiceCount", () => {
  it("데이터 없으면 0", () => {
    expect(cooldownServiceCount(undefined)).toBe(0);
  });

  it("cooldownActive 인 서비스만 센다", () => {
    const status: ServiceStatus[] = [
      { service: "a", windowCount: 3, cooldownActive: true, cooldownTtlSec: 120 },
      { service: "b", windowCount: 1, cooldownActive: false, cooldownTtlSec: null },
      { service: "c", windowCount: 8, cooldownActive: true, cooldownTtlSec: 40 },
    ];
    expect(cooldownServiceCount(status)).toBe(2);
  });
});
