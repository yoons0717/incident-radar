import type { Repository } from "typeorm";
import { testDataSource } from "../../test/db";
import { User } from "../db/entities/user.entity";
import { UserService } from "./user.service";

function makeService(): UserService {
  return new UserService(testDataSource.getRepository(User) as Repository<User>);
}

describe("UserService", () => {
  // 테스트 간 정리는 test/setup.ts 의 afterEach(truncateAll)

  describe("create", () => {
    it("비밀번호를 bcrypt 해시로 저장한다 (평문 저장 안 함)", async () => {
      const svc = makeService();
      const user = await svc.create({ email: "a@ex.com", password: "s3cret-pw", role: "admin" });

      const row = await testDataSource.getRepository(User).findOneByOrFail({ id: user.id });
      expect(row.passwordHash).not.toBe("s3cret-pw");
      expect(row.passwordHash.startsWith("$2")).toBe(true); // bcrypt 접두어
      expect(row.role).toBe("admin");
    });
  });

  describe("verifyLogin", () => {
    it("이메일+비밀번호가 맞으면 유저를 반환한다", async () => {
      const svc = makeService();
      await svc.create({ email: "a@ex.com", password: "s3cret-pw", role: "viewer" });

      const user = await svc.verifyLogin("a@ex.com", "s3cret-pw");
      expect(user?.email).toBe("a@ex.com");
    });

    it("비밀번호가 틀리면 null 을 반환한다", async () => {
      const svc = makeService();
      await svc.create({ email: "a@ex.com", password: "s3cret-pw", role: "viewer" });

      expect(await svc.verifyLogin("a@ex.com", "wrong")).toBeNull();
    });

    it("없는 이메일이면 null 을 반환한다", async () => {
      const svc = makeService();
      expect(await svc.verifyLogin("nobody@ex.com", "x")).toBeNull();
    });

    it("없는 이메일이어도 비밀번호 해시 비교를 수행한다 (타이밍 평준화 — 유저 열거 방지)", async () => {
      const svc = makeService();
      // bcrypt(12라운드) 는 ~200ms. 이메일 없을 때 곧장 return 하면 ~1ms 라 확연히 갈린다.
      const started = Date.now();
      expect(await svc.verifyLogin("ghost@ex.com", "whatever")).toBeNull();
      expect(Date.now() - started).toBeGreaterThan(50);
    });
  });

  describe("create — upsert", () => {
    it("같은 이메일로 다시 create 하면 비밀번호·역할을 갱신한다 (seed 재실행 대비)", async () => {
      const svc = makeService();
      await svc.create({ email: "a@ex.com", password: "old-pw-123", role: "viewer" });
      await svc.create({ email: "a@ex.com", password: "new-pw-456", role: "admin" });

      expect(await testDataSource.getRepository(User).countBy({ email: "a@ex.com" })).toBe(1);
      const user = await svc.verifyLogin("a@ex.com", "new-pw-456");
      expect(user?.role).toBe("admin");
    });
  });
});
