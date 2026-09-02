import type { ServiceStatus } from "@incident-radar/shared";
import { describe, expect, it } from "vitest";
import { cooldownRows } from "./cooldown";

const FETCHED = 1_700_000_000_000;
const FULL = 300;

function mk(over: Partial<ServiceStatus> & { service: string }): ServiceStatus {
  return { windowCount: 0, cooldownActive: false, cooldownTtlSec: null, ...over };
}

describe("cooldownRows", () => {
  it("데이터 없으면 빈 배열", () => {
    expect(cooldownRows(undefined, FETCHED, FETCHED, FULL)).toEqual([]);
  });

  it("활성 행이 먼저(잔여 내림차순), clear 행은 이름순으로 뒤에", () => {
    const status = [
      mk({ service: "search", cooldownActive: true, cooldownTtlSec: 60 }),
      mk({ service: "checkout", cooldownActive: true, cooldownTtlSec: 200 }),
      mk({ service: "auth" }),
      mk({ service: "payments" }),
    ];
    const rows = cooldownRows(status, FETCHED, FETCHED, FULL);
    expect(rows.map((r) => r.service)).toEqual(["checkout", "search", "auth", "payments"]);
    expect(rows.map((r) => r.active)).toEqual([true, true, false, false]);
  });

  it("폴링 이후 경과 시간만큼 잔여를 보간하고 pct 를 계산", () => {
    const status = [mk({ service: "checkout", cooldownActive: true, cooldownTtlSec: 150 })];
    const row = cooldownRows(status, FETCHED, FETCHED + 30_000, FULL)[0]!;
    expect(row.remainingSec).toBe(120); // 150 - 30s
    expect(row.pct).toBeCloseTo((120 / 300) * 100, 5);
  });

  it("보간 결과가 만료면 active=false, pct=0", () => {
    const status = [mk({ service: "checkout", cooldownActive: true, cooldownTtlSec: 10 })];
    const row = cooldownRows(status, FETCHED, FETCHED + 60_000, FULL)[0]!;
    expect(row.active).toBe(false);
    expect(row.remainingSec).toBe(0);
    expect(row.pct).toBe(0);
  });

  it("잔여가 full 보다 크면 pct 는 100 으로 클램프", () => {
    const status = [mk({ service: "checkout", cooldownActive: true, cooldownTtlSec: 999 })];
    const row = cooldownRows(status, FETCHED, FETCHED, FULL)[0]!;
    expect(row.pct).toBe(100);
  });
});
