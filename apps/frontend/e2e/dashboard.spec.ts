import { expect, test, type Page } from "@playwright/test";

// 브라우저·Next 서버·백엔드·DB 가 실제로 맞물려야만 드러나는 흐름만 본다
// (세션 쿠키, CORS credentials, 서버 쪽 세션 확인, 폴링으로 알림이 화면에 뜨기).
// 계정·키는 e2e/run.mjs 가 시드한다.
const email = process.env.SEED_ADMIN_EMAIL!;
const password = process.env.SEED_ADMIN_PASSWORD!;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL("/");
}

test("로그인 안 했으면 대시보드 대신 로그인 화면, 로그인하면 대시보드", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");

  await login(page);
  await expect(page.getByRole("heading", { name: /Recent alerts/ })).toBeVisible();
});

test("임계값을 넘게 에러를 보내면 알림 표에 그 서비스 행이 뜬다", async ({ page, request }) => {
  const service = `e2e-${Date.now()}`;
  for (let i = 0; i < 11; i++) {
    const res = await request.post("http://localhost:3000/errors", {
      headers: { authorization: `Bearer ${process.env.E2E_API_KEY}` },
      data: { service, message: "e2e spike" },
    });
    expect(res.status()).toBe(201);
  }

  await login(page);
  // 워커 발송 + 5초 폴링을 기다린다.
  const row = page.getByRole("row").filter({ hasText: service });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText("dispatched")).toBeVisible();
});

test("로그아웃하면 로그인 화면으로 가고, 대시보드에 다시 못 들어간다", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL("/login");

  await page.goto("/");
  await expect(page).toHaveURL("/login");
});

test("/health 가 장애를 알리면 상단 배너, 복구되면 사라진다", async ({ page }) => {
  // 백엔드 Redis 를 실제로 죽이는 대신 브라우저의 /health 응답만 바꾼다(대시보드 폴링은 브라우저에서 한다).
  let health: { status: number; body: object } = { status: 200, body: { status: "degraded", redis: "down" } };
  await page.route("**/health", (route) => route.fulfill({ status: health.status, json: health.body }));

  await login(page);
  const banner = page.getByRole("status").filter({ hasText: "연결 끊김" });
  await expect(banner).toContainText("Redis 연결 끊김");

  health = { status: 503, body: { message: "database unavailable" } };
  await expect(banner).toContainText("DB 연결 끊김", { timeout: 15_000 });

  health = { status: 200, body: { status: "ok" } };
  await expect(banner).toHaveCount(0, { timeout: 15_000 });
});
