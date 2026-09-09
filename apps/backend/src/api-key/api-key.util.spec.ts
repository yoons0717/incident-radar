import { generateToken, hashToken, tokenPrefix } from "./api-key.util";

describe("api-key.util", () => {
  describe("generateToken", () => {
    it("ir_ 로 시작하고 충분히 길다", () => {
      const t = generateToken();
      expect(t.startsWith("ir_")).toBe(true);
      expect(t.length).toBeGreaterThanOrEqual(32);
    });

    it("호출마다 다른 값을 낸다", () => {
      expect(generateToken()).not.toBe(generateToken());
    });
  });

  describe("hashToken", () => {
    it("같은 토큰은 같은 해시로, 다른 토큰은 다른 해시로 매핑한다", () => {
      const t = generateToken();
      expect(hashToken(t)).toBe(hashToken(t));
      expect(hashToken(t)).not.toBe(hashToken(generateToken()));
    });

    it("sha256 hex (64자) 를 낸다 — 평문을 담지 않는다", () => {
      const t = generateToken();
      const h = hashToken(t);
      expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect(h).not.toContain(t.slice(3));
    });
  });

  describe("tokenPrefix", () => {
    it("토큰 앞부분만 떼어낸다 (전체보다 짧다)", () => {
      const t = generateToken();
      const p = tokenPrefix(t);
      expect(t.startsWith(p)).toBe(true);
      expect(p.length).toBeLessThan(t.length);
    });
  });
});
