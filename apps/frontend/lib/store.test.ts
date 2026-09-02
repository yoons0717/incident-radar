import { beforeEach, describe, expect, it } from "vitest";
import { useDashboardUi } from "./store";

const initial = useDashboardUi.getState();

beforeEach(() => {
  useDashboardUi.setState(initial, true);
});

describe("useDashboardUi", () => {
  it("기본값: 전체 서비스(null), 최근 60분", () => {
    const s = useDashboardUi.getState();
    expect(s.service).toBeNull();
    expect(s.rangeMinutes).toBe(60);
  });

  it("setService / setRange 가 상태를 바꾼다", () => {
    useDashboardUi.getState().setService("checkout");
    useDashboardUi.getState().setRange(1440);
    const s = useDashboardUi.getState();
    expect(s.service).toBe("checkout");
    expect(s.rangeMinutes).toBe(1440);
  });
});
