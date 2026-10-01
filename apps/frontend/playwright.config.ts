import { defineConfig, devices } from "@playwright/test";

// 실행은 `pnpm test:e2e`(e2e/run.mjs)로 — 인프라·시드를 준비한 뒤 이 설정으로 돈다.
// 백엔드·프론트는 빌드 결과물로 띄운다(dev 서버보다 실제 배포 형태에 가깝다).
// 포트가 이미 쓰이고 있으면 재사용하지 않고 실패한다: 엉뚱한 서버(로컬 pnpm dev 등)를 테스트하지 않게.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @incident-radar/backend build && pnpm --filter @incident-radar/backend start",
      cwd: "../..",
      url: "http://localhost:3000/health",
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: "pnpm build && pnpm start",
      env: { NODE_ENV: "production" }, // run.mjs 의 NODE_ENV=test 가 Next 빌드로 새지 않게
      url: "http://localhost:3001/login",
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
