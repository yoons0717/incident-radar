import { describe, expect, it } from "vitest";
import { panelState } from "./panel-state";

describe("panelState", () => {
  it("데이터 없고 로딩 중 → loading", () => {
    expect(panelState(false, false, false)).toBe("loading");
  });

  it("에러(재시도까지 실패)면 → error. 이전 데이터가 있어도", () => {
    expect(panelState(true, false, false)).toBe("error");
    expect(panelState(true, true, false)).toBe("error");
    expect(panelState(true, true, true)).toBe("error");
  });

  it("데이터 있고 비었으면 → empty", () => {
    expect(panelState(false, true, true)).toBe("empty");
  });

  it("데이터 있고 내용 있으면 → ready", () => {
    expect(panelState(false, true, false)).toBe("ready");
  });
});
