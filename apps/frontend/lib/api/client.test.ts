import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, apiGet } from "./client";

const Schema = z.object({ a: z.number() });

function mockFetch(impl: () => Promise<unknown> | unknown) {
  vi.stubGlobal("fetch", vi.fn(impl as () => Promise<Response>));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiGet", () => {
  it("정상 응답을 스키마로 파싱해 돌려준다", async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ a: 1 }) }));
    await expect(apiGet("/x", Schema)).resolves.toEqual({ a: 1 });
  });

  it("스키마에 안 맞으면 ApiError kind:'parse'", async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ a: "nope" }) }));
    await expect(apiGet("/x", Schema)).rejects.toMatchObject({
      name: "ApiError",
      kind: "parse",
    });
  });

  it("본문이 JSON 이 아니면 ApiError kind:'parse'", async () => {
    mockFetch(() => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    }));
    await expect(apiGet("/x", Schema)).rejects.toMatchObject({ kind: "parse" });
  });

  it("HTTP 에러 응답이면 ApiError kind:'http' (상태코드 포함)", async () => {
    mockFetch(() => ({ ok: false, status: 500, statusText: "Internal Server Error" }));
    const err = await apiGet("/x", Schema).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("http");
    expect(err.message).toContain("500");
  });

  it("fetch 자체가 실패하면 ApiError kind:'network'", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(apiGet("/x", Schema)).rejects.toMatchObject({ kind: "network" });
  });

  it("credentials:'include' 로 요청한다 (세션 쿠키 전송)", async () => {
    const spy = vi.fn(() => ({ ok: true, json: async () => ({ a: 1 }) }));
    vi.stubGlobal("fetch", spy as unknown as typeof fetch);
    await apiGet("/x", Schema);
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("401 이면 window.location 을 /login 으로 보낸다", async () => {
    const loc = { pathname: "/", href: "" };
    vi.stubGlobal("window", { location: loc } as unknown as Window & typeof globalThis);
    mockFetch(() => ({ ok: false, status: 401, statusText: "Unauthorized" }));
    await expect(apiGet("/x", Schema)).rejects.toMatchObject({ kind: "http" });
    expect(loc.href).toBe("/login");
  });
});
