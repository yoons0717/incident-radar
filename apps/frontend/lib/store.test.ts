import { beforeEach, describe, expect, it } from "vitest";
import { rangeLabel, useDashboardUi } from "./store";

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

describe("rangeLabel", () => {
  it("60분 미만은 분 단위로", () => {
    expect(rangeLabel(30)).toBe("30분");
  });

  it("경계값 60은 시간 단위로 (1시간)", () => {
    expect(rangeLabel(60)).toBe("1시간");
  });

  it("실제 사용값 360·1440 도 시간 단위로", () => {
    expect(rangeLabel(360)).toBe("6시간");
    expect(rangeLabel(1440)).toBe("24시간");
  });
});
