import { afterEach, describe, expect, it, vi } from "vitest";
import { login, logout } from "./auth";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** fetch 목. 인자 타입을 명시해 mock.calls 를 검사할 수 있게 한다. */
function mockFetch(impl: (url: string, init: RequestInit) => unknown) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy as unknown as typeof fetch);
  return spy;
}

describe("login", () => {
  it("이메일/비밀번호를 POST 하고 credentials 를 포함, 응답을 반환한다", async () => {
    const spy = mockFetch(() => ({
      ok: true,
      json: async () => ({ email: "a@b.c", role: "admin" }),
    }));

    await expect(login("a@b.c", "pw")).resolves.toEqual({ email: "a@b.c", role: "admin" });

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toContain("/auth/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.c", password: "pw" });
  });

  it("2xx 아니면 ApiError kind:'http'", async () => {
    mockFetch(() => ({ ok: false, status: 401 }));
    await expect(login("a@b.c", "bad")).rejects.toMatchObject({ name: "ApiError", kind: "http" });
  });

  it("fetch 자체가 실패하면 ApiError kind:'network'", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(login("a@b.c", "pw")).rejects.toMatchObject({ kind: "network" });
  });
});

describe("logout", () => {
  it("POST /auth/logout 를 부르고, 실패해도 throw 하지 않는다", async () => {
    const spy = mockFetch(() => ({ ok: true }));
    await expect(logout()).resolves.toBeUndefined();
    expect(spy.mock.calls[0]![0]).toContain("/auth/logout");

    mockFetch(() => {
      throw new Error("네트워크");
    });
    await expect(logout()).resolves.toBeUndefined();
  });
});
