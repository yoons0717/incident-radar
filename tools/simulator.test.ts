import { describe, expect, it } from "vitest";
import { expInterval, parseDuration, parseSimArgs, pickService } from "./simulator";

describe("expInterval", () => {
  it("U=0 이면 대기시간 0", () => {
    expect(expInterval(2, () => 0)).toBeCloseTo(0, 10);
  });

  it("공식대로: -ln(1-U)/rate", () => {
    // U=0.5, rate=2 → -ln(0.5)/2 ≈ 0.34657
    expect(expInterval(2, () => 0.5)).toBeCloseTo(Math.LN2 / 2, 10);
  });
});

describe("parseDuration", () => {
  it("초/분 접미사", () => {
    expect(parseDuration("10s")).toBe(10_000);
    expect(parseDuration("2m")).toBe(120_000);
  });

  it("접미사 없으면 초로 해석", () => {
    expect(parseDuration("5")).toBe(5_000);
  });

  it("잘못된 값이면 throw", () => {
    expect(() => parseDuration("abc")).toThrow();
  });
});

describe("parseSimArgs", () => {
  it("빈 인자 → 기본값", () => {
    expect(parseSimArgs([])).toEqual({
      url: "http://localhost:3000",
      rate: 2,
      durationMs: 10_000,
      spike: null,
    });
  });

  it("플래그를 읽는다", () => {
    expect(parseSimArgs(["--spike", "checkout", "--rate", "5", "--duration", "1m", "--url", "http://x"])).toEqual({
      url: "http://x",
      rate: 5,
      durationMs: 60_000,
      spike: "checkout",
    });
  });

  it("선행 `--` (pnpm 전달분) 를 무시한다", () => {
    expect(parseSimArgs(["--", "--rate", "9"]).rate).toBe(9);
  });

  it("rate 가 0 이하거나 숫자가 아니면 throw (무한 대기 방지)", () => {
    expect(() => parseSimArgs(["--rate", "0"])).toThrow();
    expect(() => parseSimArgs(["--rate", "abc"])).toThrow();
  });
});

describe("pickService", () => {
  it("rng=0 → 첫 서비스, rng≈1 → 마지막 서비스", () => {
    expect(pickService(() => 0)).toBe("checkout");
    expect(pickService(() => 0.999999)).toBe("payments");
  });

  it("가중치 비율에 대략 비례한다 (checkout 이 제일 많음)", () => {
    let seed = 999;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20_000; i++) {
      const s = pickService(rng);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    expect(counts.checkout ?? 0).toBeGreaterThan(counts.auth ?? 0);
    expect(counts.auth ?? 0).toBeGreaterThan(counts.search ?? 0);
  });
});
