import type { StatsResponse } from "@incident-radar/shared";
import { describe, expect, it } from "vitest";
import { pivotStats } from "./chart";

describe("pivotStats", () => {
  it("빈 응답이면 rows·services 모두 빈 배열", () => {
    expect(pivotStats([])).toEqual({ rows: [], services: [] });
  });

  it("서비스별 시리즈를 버킷 시각 기준 한 행으로 합치고, 없는 칸은 0", () => {
    const stats: StatsResponse = [
      {
        service: "checkout",
        buckets: [
          { t: "2026-01-01T00:00:00Z", count: 3 },
          { t: "2026-01-01T00:01:00Z", count: 5 },
        ],
      },
      {
        service: "auth",
        buckets: [{ t: "2026-01-01T00:01:00Z", count: 2 }],
      },
    ];

    const { rows, services } = pivotStats(stats);

    expect(services).toEqual(["auth", "checkout"]); // 이름 오름차순
    expect(rows).toEqual([
      { t: "2026-01-01T00:00:00Z", checkout: 3, auth: 0 },
      { t: "2026-01-01T00:01:00Z", checkout: 5, auth: 2 },
    ]);
  });

  it("행은 버킷 시각 오름차순으로 정렬한다", () => {
    const stats: StatsResponse = [
      {
        service: "checkout",
        buckets: [
          { t: "2026-01-01T00:02:00Z", count: 1 },
          { t: "2026-01-01T00:00:00Z", count: 9 },
        ],
      },
    ];

    const { rows } = pivotStats(stats);
    expect(rows.map((r) => r.t)).toEqual([
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:02:00Z",
    ]);
  });
});
