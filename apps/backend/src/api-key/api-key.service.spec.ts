import type { Repository } from "typeorm";
import { testDataSource } from "../../test/db";
import { ApiKey } from "../db/entities/api-key.entity";
import { ApiKeyService } from "./api-key.service";
import { hashToken } from "./api-key.util";

/** Nest DI 없이 직접 조립 (cooldown.spec 과 같은 방식). */
function makeService(): ApiKeyService {
  return new ApiKeyService(testDataSource.getRepository(ApiKey) as Repository<ApiKey>);
}

describe("ApiKeyService", () => {
  // 테스트 간 정리는 test/setup.ts 의 afterEach(truncateAll)

  describe("issue", () => {
    it("평문 토큰을 반환하고 DB 에는 해시를 저장한다 (평문은 저장하지 않음)", async () => {
      const svc = makeService();
      const { token, id } = await svc.issue("ci");

      expect(token.startsWith("ir_")).toBe(true);
      const row = await testDataSource.getRepository(ApiKey).findOneByOrFail({ id });
      expect(row.keyHash).toBe(hashToken(token));
      expect(row.keyHash).not.toContain(token);
    });
  });

  describe("validate", () => {
    it("유효한 토큰이면 키 id 를 반환한다", async () => {
      const svc = makeService();
      const { token, id } = await svc.issue("ci");

      expect(await svc.validate(token)).toEqual({ id });
    });

    it("존재하지 않는 토큰이면 null 을 반환한다", async () => {
      const svc = makeService();
      expect(await svc.validate("ir_nope_nope_nope")).toBeNull();
    });

    it("폐기된(revoked) 키면 null 을 반환한다", async () => {
      const svc = makeService();
      const { token, id } = await svc.issue("ci");
      await testDataSource.getRepository(ApiKey).update(id, { revokedAt: new Date() });

      expect(await svc.validate(token)).toBeNull();
    });

    it("유효한 토큰을 검증하면 last_used_at 이 채워진다", async () => {
      const svc = makeService();
      const { token, id } = await svc.issue("ci");

      expect((await testDataSource.getRepository(ApiKey).findOneByOrFail({ id })).lastUsedAt).toBeNull();
      await svc.validate(token);
      expect((await testDataSource.getRepository(ApiKey).findOneByOrFail({ id })).lastUsedAt).not.toBeNull();
    });
  });
});
