import { beforeEach, describe, expect, it, vi } from "vitest";
import * as endpoints from "./endpoints";
import { alertsQuery, statsQuery, statusQuery } from "./queries";

vi.mock("./endpoints", () => ({
  getStats: vi.fn().mockResolvedValue([]),
  getStatus: vi.fn().mockResolvedValue([]),
  getAlerts: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("query 팩토리", () => {
  it("statsQuery: 키에 rangeMinutes 만 (절대 시각 아님) → 렌더마다 안 바뀜", () => {
    expect(statsQuery({ rangeMinutes: 60 }).queryKey).toEqual(["stats", null, 60, null]);
    // 같은 파라미터면 몇 번을 만들어도 키가 동일
    expect(statsQuery({ rangeMinutes: 60 }).queryKey).toEqual(
      statsQuery({ rangeMinutes: 60 }).queryKey,
    );
  });

  it("statsQuery: service·rangeMinutes 가 바뀌면 키도 바뀐다", () => {
    expect(statsQuery({ service: "a", rangeMinutes: 60 }).queryKey).not.toEqual(
      statsQuery({ service: "b", rangeMinutes: 60 }).queryKey,
    );
    expect(statsQuery({ rangeMinutes: 60 }).queryKey).not.toEqual(
      statsQuery({ rangeMinutes: 360 }).queryKey,
    );
  });

  it("statsQuery: queryFn 이 rangeMinutes → fromMs 로 계산해 getStats 호출", async () => {
    const before = Date.now();
    await statsQuery({ service: "checkout", rangeMinutes: 60, bucketSec: 60 }).queryFn();
    const arg = vi.mocked(endpoints.getStats).mock.calls[0]![0]!;
    expect(arg.service).toBe("checkout");
    expect(arg.bucketSec).toBe(60);
    expect(arg.fromMs).toBeGreaterThanOrEqual(before - 60 * 60_000);
    expect(arg.fromMs).toBeLessThanOrEqual(Date.now() - 60 * 60_000);
  });

  it("statusQuery: 고정 키 + getStatus 위임", async () => {
    expect(statusQuery().queryKey).toEqual(["status"]);
    await statusQuery().queryFn();
    expect(endpoints.getStatus).toHaveBeenCalled();
  });

  it("alertsQuery: limit 이 키에 반영되고 getAlerts 로 위임", async () => {
    expect(alertsQuery(10).queryKey).toEqual(["alerts", 10]);
    expect(alertsQuery().queryKey).toEqual(["alerts", null]);
    await alertsQuery(10).queryFn();
    expect(endpoints.getAlerts).toHaveBeenCalledWith(10);
  });
});
