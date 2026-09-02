import type { StatsResponse } from "@incident-radar/shared";
import { describe, expect, it } from "vitest";
import { cooldownRemaining, totalErrorsInRange } from "./derive";

describe("cooldownRemaining", () => {
  const fetchedAt = 1_700_000_000_000;

  it("cooldown 비활성(ttl null)이면 null", () => {
    expect(cooldownRemaining(null, fetchedAt, fetchedAt + 3_000)).toBeNull();
  });

  it("폴링 사이 경과분을 빼서 보간한다", () => {
    expect(cooldownRemaining(300, fetchedAt, fetchedAt + 10_000)).toBe(290);
  });

  it("만료됐으면 음수가 아니라 0", () => {
    expect(cooldownRemaining(5, fetchedAt, fetchedAt + 60_000)).toBe(0);
  });
});

describe("totalErrorsInRange", () => {
  it("빈 응답이면 0", () => {
    expect(totalErrorsInRange([])).toBe(0);
  });

  it("모든 시리즈의 모든 버킷 count 를 더한다", () => {
    const stats: StatsResponse = [
      { service: "checkout", buckets: [{ t: "2026-01-01T00:00:00Z", count: 3 }, { t: "2026-01-01T00:01:00Z", count: 2 }] },
      { service: "auth", buckets: [{ t: "2026-01-01T00:00:00Z", count: 4 }] },
    ];
    expect(totalErrorsInRange(stats)).toBe(9);
  });
});
