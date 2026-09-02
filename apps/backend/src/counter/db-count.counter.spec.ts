import type { ConfigService } from "@nestjs/config";
import { testDataSource } from "../../test/db";
import type { Env } from "../config/env.schema";
import { ErrorLog } from "../db/entities/error-log.entity";
import { DbCountCounter } from "./db-count.counter";

const WINDOW = 60_000;

/** 실제 test Postgres(5433)에 붙되, Nest DI 없이 직접 조립한다. */
function makeCounter(): DbCountCounter {
  const repo = testDataSource.getRepository(ErrorLog);
  const config = { get: () => WINDOW } as unknown as ConfigService<Env, true>;
  return new DbCountCounter(repo, config);
}

/** createdAt 을 명시해 로그 한 건을 심는다 (@CreateDateColumn 은 값을 주면 그대로 저장). */
async function seed(service: string, createdAt: Date): Promise<void> {
  await testDataSource.getRepository(ErrorLog).save({ service, message: "x", createdAt });
}

describe("DbCountCounter", () => {
  let counter: DbCountCounter;

  beforeAll(() => {
    counter = makeCounter();
  });
  // 테스트 간 정리는 test/setup.ts 의 afterEach(truncateAll)가 담당

  it("윈도우 안의 해당 서비스 로그 수를 센다", async () => {
    const at = Date.now();
    await seed("checkout", new Date(at - 10_000));
    await seed("checkout", new Date(at - 30_000));
    await seed("checkout", new Date(at - 90_000)); // 윈도우 밖
    await seed("auth", new Date(at - 5_000)); // 다른 서비스

    expect(await counter.record("checkout", at)).toBe(2);
  });

  it("윈도우 경계(정확히 at - windowMs)는 제외한다", async () => {
    const at = Date.now();
    await seed("checkout", new Date(at - WINDOW));

    expect(await counter.record("checkout", at)).toBe(0);
  });

  it("다른 서비스의 로그는 세지 않는다", async () => {
    const at = Date.now();
    await seed("checkout", new Date(at - 1_000));
    await seed("auth", new Date(at - 1_000));

    expect(await counter.record("auth", at)).toBe(1);
  });
});
