import type { Alert } from "@incident-radar/shared";
import { describe, expect, it } from "vitest";
import { alertRow, latestAlertLabel } from "./alerts-table";

const dispatched: Alert = {
  id: "a1",
  service: "checkout",
  status: "dispatched",
  at: "2026-09-02T14:06:04.258Z",
  count: 11,
  threshold: 10,
  windowMs: 60_000,
};
const failed: Alert = {
  id: "a2",
  service: "payments",
  status: "failed",
  at: "2026-09-02T14:14:54.404Z",
  attempts: 5,
  error: "webhook responded 503",
};

describe("alertRow", () => {
  it("dispatched → 창 카운트/시도1/임계값 상세, failed=false", () => {
    expect(alertRow(dispatched)).toMatchObject({
      id: "a1",
      service: "checkout",
      status: "dispatched",
      failed: false,
      windowCount: "11",
      attempts: "1",
      detail: "임계값 10 · 60s 창",
    });
  });

  it("failed → 창 카운트 —, 시도 attempts, 상세는 error, failed=true", () => {
    expect(alertRow(failed)).toMatchObject({
      service: "payments",
      status: "failed",
      failed: true,
      windowCount: "—",
      attempts: "5",
      detail: "webhook responded 503",
    });
  });

  it("시각은 at 에서 HH:MM:SS 로", () => {
    // 로컬 타임존 의존 — 형식만 확인
    expect(alertRow(dispatched).time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe("latestAlertLabel", () => {
  it("비었으면 빈 문자열", () => {
    expect(latestAlertLabel(undefined)).toBe("");
    expect(latestAlertLabel([])).toBe("");
  });

  it("맨 앞 알림을 상태에 맞춰 안내 문구로", () => {
    expect(latestAlertLabel([dispatched])).toBe("새 알림: checkout 발송됨");
    expect(latestAlertLabel([failed, dispatched])).toBe("새 알림: payments 발송 실패");
  });
});
