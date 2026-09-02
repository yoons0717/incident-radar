import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "./client";
import { getAlerts, getStats, getStatus } from "./endpoints";

vi.mock("./client", () => ({ apiGet: vi.fn() }));
const mockApiGet = vi.mocked(apiGet);

beforeEach(() => {
  mockApiGet.mockReset().mockResolvedValue([] as never);
});

const calledPath = () => String(mockApiGet.mock.calls[0]?.[0]);

describe("endpoints", () => {
  it("getStats: 파라미터를 쿼리스트링으로 조립하고 ms → ISO 변환", async () => {
    await getStats({
      service: "checkout",
      bucketSec: 60,
      fromMs: Date.UTC(2026, 0, 1, 0, 0, 0),
      toMs: Date.UTC(2026, 0, 1, 1, 0, 0),
    });
    const path = calledPath();
    expect(path.startsWith("/stats?")).toBe(true);
    expect(path).toContain("service=checkout");
    expect(path).toContain("bucket=60");
    expect(path).toContain("from=2026-01-01T00%3A00%3A00.000Z");
    expect(path).toContain("to=2026-01-01T01%3A00%3A00.000Z");
  });

  it("getStats: 파라미터 없으면 맨 /stats", async () => {
    await getStats();
    expect(calledPath()).toBe("/stats");
  });

  it("getStats: service=null 은 쿼리에서 빠진다", async () => {
    await getStats({ service: null, bucketSec: 30 });
    expect(calledPath()).toBe("/stats?bucket=30");
  });

  it("getStatus: /status", async () => {
    await getStatus();
    expect(calledPath()).toBe("/status");
  });

  it("getAlerts: limit 전달", async () => {
    await getAlerts(10);
    expect(calledPath()).toBe("/alerts?limit=10");
  });

  it("getAlerts: limit 없으면 맨 /alerts", async () => {
    await getAlerts();
    expect(calledPath()).toBe("/alerts");
  });
});
