import { Logger } from "@nestjs/common";
import type { RedisService } from "./redis.service";
import { RedisHealthService } from "./redis-health.service";

/**
 * 가짜 ioredis 클라이언트로 조립. ping 동작을 테스트별로 지정하고,
 * on("error", ...) 로 등록된 핸들러를 fireError() 로 직접 호출한다.
 */
function make(pingImpl: () => Promise<unknown>) {
  const handlers: Record<string, () => void> = {};
  const client = {
    ping: jest.fn(pingImpl),
    on: (evt: string, cb: () => void) => {
      handlers[evt] = cb;
    },
  };
  const svc = new RedisHealthService({ client } as unknown as RedisService);
  return { svc, client, fireError: () => handlers.error?.() };
}

describe("RedisHealthService", () => {
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
  });

  it("onModuleInit 에서 PING 이 성공하면 healthy=true", async () => {
    const { svc } = make(() => Promise.resolve("PONG"));
    await svc.onModuleInit();
    expect(svc.healthy).toBe(true);
    svc.onModuleDestroy();
  });

  it("onModuleInit 에서 PING 이 실패하면 healthy=false (앱은 계속 뜬다)", async () => {
    const { svc } = make(() => Promise.reject(new Error("connect ECONNREFUSED")));
    await svc.onModuleInit();
    expect(svc.healthy).toBe(false);
    svc.onModuleDestroy();
  });

  it("커맨드 에러 이벤트가 오면 즉시 healthy=false", async () => {
    const { svc, fireError } = make(() => Promise.resolve("PONG"));
    await svc.onModuleInit();
    expect(svc.healthy).toBe(true);

    fireError();
    expect(svc.healthy).toBe(false);
    svc.onModuleDestroy();
  });

  it("다운 상태에서 다음 주기 PING 이 성공하면 healthy=true 로 복구", async () => {
    jest.useFakeTimers();
    try {
      let ok = false;
      const { svc } = make(() =>
        ok ? Promise.resolve("PONG") : Promise.reject(new Error("down")),
      );
      await svc.onModuleInit();
      expect(svc.healthy).toBe(false);

      ok = true;
      await jest.advanceTimersByTimeAsync(5_000);
      expect(svc.healthy).toBe(true);
      svc.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("onModuleDestroy 이후에는 더 이상 PING 하지 않는다", async () => {
    jest.useFakeTimers();
    try {
      const { svc, client } = make(() => Promise.resolve("PONG"));
      await svc.onModuleInit();
      const callsAfterInit = client.ping.mock.calls.length;

      svc.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(15_000);
      expect(client.ping.mock.calls.length).toBe(callsAfterInit);
    } finally {
      jest.useRealTimers();
    }
  });
});
