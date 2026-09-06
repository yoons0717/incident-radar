import { Logger, ServiceUnavailableException } from "@nestjs/common";
import type { DataSource } from "typeorm";
import type { RedisHealthService } from "../redis/redis-health.service";
import { HealthService } from "./health.service";

function make(query: () => Promise<unknown>, redisHealthy: boolean) {
  const dataSource = { query } as unknown as DataSource;
  const redisHealth = { healthy: redisHealthy } as unknown as RedisHealthService;
  return new HealthService(dataSource, redisHealth);
}

describe("HealthService", () => {
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    error.mockRestore();
  });

  it("DB 정상 + Redis 정상 → ok", async () => {
    const svc = make(() => Promise.resolve([{ "?column?": 1 }]), true);
    await expect(svc.check()).resolves.toEqual({ status: "ok" });
  });

  it("DB 정상 + Redis 다운 → degraded (200 대상)", async () => {
    const svc = make(() => Promise.resolve([{ "?column?": 1 }]), false);
    await expect(svc.check()).resolves.toEqual({ status: "degraded", redis: "down" });
  });

  it("DB 쿼리 실패 → ServiceUnavailableException, 원인 로깅", async () => {
    const svc = make(() => Promise.reject(new Error("connect ECONNREFUSED")), true);
    await expect(svc.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("ECONNREFUSED"));
  });

  it("커넥션 거부(AggregateError, message 빈 문자열)여도 원인이 로그에 남는다", async () => {
    // 실제로 dev postgres 를 내려서 재현한 모양: 최상위 message 는 "", 원인은 .errors/.code 에.
    const inner = Object.assign(new Error("connect ECONNREFUSED ::1:5432"), { code: "ECONNREFUSED" });
    const agg = Object.assign(new AggregateError([inner], ""), { code: "ECONNREFUSED" });
    const svc = make(() => Promise.reject(agg), true);
    await expect(svc.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("ECONNREFUSED ::1:5432"));
  });

  it("DB 쿼리가 타임아웃보다 오래 걸리면 → ServiceUnavailableException", async () => {
    jest.useFakeTimers();
    try {
      const svc = make(() => new Promise(() => {}), true); // 응답 없는 커넥션
      // 핸들러를 먼저 붙여야 함 — advanceTimersByTimeAsync 도중 reject 되면
      // 그때까지 아무도 안 붙어있는 promise 는 unhandled rejection 으로 잡힌다.
      const expectation = expect(svc.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
      await jest.advanceTimersByTimeAsync(2_000);
      await expectation;
    } finally {
      jest.useRealTimers();
    }
  });
});
