import { cleanup, render, screen, within } from "@testing-library/react";
import type { Alert, ServiceStatus } from "@incident-radar/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAlerts, useStats, useStatus } from "@/lib/api/hooks";
import { AlertsTable } from "./alerts-table";
import { CooldownPanel } from "./cooldown-panel";
import { StatTiles } from "./stat-tiles";

// 데이터 훅을 가짜로 바꾼다 — 패널이 각 상태를 어떻게 그리는지만 본다(네트워크·폴링 없음).
vi.mock("@/lib/api/hooks", () => ({ useAlerts: vi.fn(), useStatus: vi.fn(), useStats: vi.fn() }));

/** useQuery 결과 중 패널이 읽는 필드만. */
function q<T>(over: { data?: T; isError?: boolean; error?: unknown } = {}) {
  return { data: undefined, isError: false, error: null, dataUpdatedAt: Date.now(), ...over };
}
const mock = <F extends (...a: never[]) => unknown>(f: F, v: unknown) =>
  vi.mocked(f).mockReturnValue(v as ReturnType<F>);

const dispatched: Alert = {
  id: "00000000-0000-4000-8000-000000000001",
  service: "checkout",
  status: "dispatched",
  at: "2026-10-01T10:00:00.000Z",
  count: 11,
  threshold: 10,
  windowMs: 60_000,
};
const failed: Alert = {
  id: "00000000-0000-4000-8000-000000000002",
  service: "payments",
  status: "failed",
  at: "2026-10-01T10:01:00.000Z",
  attempts: 5,
  error: "webhook responded 500",
};

afterEach(cleanup);

describe("AlertsTable", () => {
  it("로딩: 표도 에러도 없이 스켈레톤만", () => {
    mock(useAlerts, q());
    render(<AlertsTable />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("에러: 패널 안에 원인별 문구 (백엔드 불통)", () => {
    mock(useAlerts, q({ isError: true, error: { kind: "network" } }));
    render(<AlertsTable />);
    expect(within(screen.getByRole("alert")).getByText("백엔드에 연결하지 못했습니다.")).toBeTruthy();
  });

  it("빈 데이터: 안내 문구", () => {
    mock(useAlerts, q({ data: [] }));
    render(<AlertsTable />);
    expect(screen.getByText("최근 24시간 알림이 없습니다.")).toBeTruthy();
  });

  it("정상: 성공·실패 알림이 각각 한 행", () => {
    mock(useAlerts, q({ data: [failed, dispatched] }));
    render(<AlertsTable />);
    const rows = screen.getAllByRole("row").slice(1); // 첫 행은 헤더
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("payments")).toBeTruthy();
    expect(within(rows[0]!).getByText("failed")).toBeTruthy();
    expect(within(rows[1]!).getByText("checkout")).toBeTruthy();
    expect(within(rows[1]!).getByText("dispatched")).toBeTruthy();
  });
});

describe("CooldownPanel", () => {
  it("빈 데이터: 안내 문구", () => {
    mock(useStatus, q({ data: [] }));
    render(<CooldownPanel />);
    expect(screen.getByText("최근 24시간에 활동한 서비스가 없습니다.")).toBeTruthy();
  });

  it("정상: cooldown 중인 서비스엔 cooling 배지, 아닌 서비스는 clear", () => {
    const status: ServiceStatus[] = [
      { service: "checkout", windowCount: 12, cooldownActive: true, cooldownTtlSec: 120 },
      { service: "search", windowCount: 1, cooldownActive: false, cooldownTtlSec: null },
    ];
    mock(useStatus, q({ data: status }));
    render(<CooldownPanel />);
    expect(screen.getByText("cooling")).toBeTruthy();
    expect(screen.getByText("2:00")).toBeTruthy();
    expect(screen.getByText("clear")).toBeTruthy();
  });
});

describe("StatTiles", () => {
  it("세 쿼리가 모두 실패하면 요약 스트립 하나만 에러로", () => {
    const err = q({ isError: true, error: { kind: "http" } });
    mock(useStats, err);
    mock(useStatus, err);
    mock(useAlerts, err);
    render(<StatTiles />);
    expect(within(screen.getByRole("alert")).getByText("요약 지표를 불러오지 못했습니다.")).toBeTruthy();
  });

  it("일부만 실패하면 받은 값으로 타일을 채운다", () => {
    mock(useStats, q({ isError: true, error: { kind: "network" } }));
    mock(useStatus, q({ data: [] }));
    mock(useAlerts, q({ data: [{ ...dispatched, at: new Date().toISOString() }] }));
    render(<StatTiles />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("최근 24시간 알림")).toBeTruthy();
    expect(screen.getByText("dispatched 1", { exact: false })).toBeTruthy();
  });
});
