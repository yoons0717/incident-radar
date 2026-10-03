import { describe, expect, it } from "vitest";
import { ApiError } from "./api/client";
import { healthBanner } from "./health";

describe("healthBanner", () => {
  it("정상이면 배너 없음", () => {
    expect(healthBanner({ status: "ok" }, false, null)).toBeNull();
  });

  it("Redis 다운(degraded)이면 경고 배너", () => {
    expect(healthBanner({ status: "degraded", redis: "down" }, false, null)).toBe("degraded");
  });

  it("503(DB 다운)이면 위험 배너 — 이전에 받은 값이 남아 있어도", () => {
    const err = new ApiError("http", "GET /health → 503", undefined, 503);
    expect(healthBanner({ status: "ok" }, true, err)).toBe("db-down");
  });

  it("백엔드 응답 없음이면 배너 없음 — 패널들이 이미 같은 에러를 보여준다", () => {
    const err = new ApiError("network", "요청 실패");
    expect(healthBanner({ status: "degraded", redis: "down" }, true, err)).toBeNull();
  });

  it("503 이 아닌 HTTP 에러는 배너 없음 — /health 가 DB 장애를 알리는 코드는 503 뿐", () => {
    const err = new ApiError("http", "GET /health → 500", undefined, 500);
    expect(healthBanner(undefined, true, err)).toBeNull();
  });

  it("첫 로드(데이터 없음)는 배너 없음", () => {
    expect(healthBanner(undefined, false, null)).toBeNull();
  });
});
