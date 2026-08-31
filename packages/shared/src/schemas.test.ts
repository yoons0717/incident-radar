import { describe, it, expect } from "vitest";
import { ErrorLogInput, Alert } from "./schemas";

describe("ErrorLogInput", () => {
  it("유효한 입력을 그대로 통과시킨다", () => {
    const input = { service: "checkout", message: "payment timeout" };
    expect(ErrorLogInput.parse(input)).toEqual(input);
  });

  it("service 가 없으면 거부한다", () => {
    expect(ErrorLogInput.safeParse({ message: "x" }).success).toBe(false);
  });

  it("message 가 상한(8192)을 넘으면 거부한다", () => {
    const tooBig = { service: "checkout", message: "a".repeat(8193) };
    expect(ErrorLogInput.safeParse(tooBig).success).toBe(false);
  });
});

describe("Alert 판별 유니온", () => {
  it("dispatched 알림을 파싱한다", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      service: "checkout",
      status: "dispatched" as const,
      at: "2026-08-30T14:32:07.000Z",
      count: 22,
      threshold: 10,
      windowMs: 60000,
    };
    expect(Alert.parse(row)).toEqual(row);
  });

  it("failed 알림을 파싱한다", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000002",
      service: "payments",
      status: "failed" as const,
      at: "2026-08-30T13:47:12.000Z",
      attempts: 5,
      error: "webhook 503",
    };
    expect(Alert.parse(row)).toEqual(row);
  });

  it("dispatched 인데 count 가 빠지면 거부한다", () => {
    const bad = {
      id: "00000000-0000-0000-0000-000000000003",
      service: "checkout",
      status: "dispatched",
      at: "2026-08-30T14:32:07.000Z",
      threshold: 10,
      windowMs: 60000,
    };
    expect(Alert.safeParse(bad).success).toBe(false);
  });
});
