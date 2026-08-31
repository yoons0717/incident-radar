import { redis, testDataSource } from "./db";

describe("테스트 인프라 smoke", () => {
  it("Postgres 에 붙는다", async () => {
    const rows: Array<{ ok: number }> = await testDataSource.query("SELECT 1 AS ok");
    expect(rows[0]?.ok).toBe(1);
  });

  it("error_logs 테이블이 마이그레이션돼 있다", async () => {
    const rows: Array<{ t: string | null }> = await testDataSource.query(
      "SELECT to_regclass('public.error_logs') AS t",
    );
    expect(rows[0]?.t).toBe("error_logs");
  });

  it("Redis 에 붙는다", async () => {
    expect(await redis.ping()).toBe("PONG");
  });
});
