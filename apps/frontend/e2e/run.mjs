// E2E 실행: 테스트 인프라(Postgres 5433 · Redis 6380) 기동 → 마이그레이션 → 관리자·API 키 시드
// → playwright test(백엔드·프론트는 playwright.config 의 webServer 가 빌드해서 띄움) → 인프라 정리.
// 백엔드 scripts/test.mjs 와 같은 compose 파일·포트를 쓰므로 둘을 동시에 돌리진 않는다.
import { execFileSync, execSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const compose = `docker compose -f "${resolve(root, "docker-compose.test.yml")}"`;

// 백엔드 ConfigModule 은 루트 .env 도 읽는다(이미 있는 값은 안 덮음). 테스트가 기대는 값은 전부
// 여기서 고정해, 로컬 .env 를 바꿔도(부하 측정용 레이트리밋 등) e2e 결과가 달라지지 않게 한다.
const E2E_ENV = {
  NODE_ENV: "test",
  PORT: "3000",
  CORS_ORIGIN: "http://localhost:3001",
  ALERT_THRESHOLD: "10",
  RATE_LIMIT_PER_MIN: "600",
  SESSION_COOKIE_SECURE: "",
  DATABASE_URL: "postgres://ir:ir@localhost:5433/incident_radar",
  REDIS_URL: "redis://localhost:6380",
  SESSION_SECRET: "e2e-session-secret-0123456789",
  WEBHOOK_URL: "",
  SEED_ADMIN_EMAIL: "e2e-admin@example.com",
  SEED_ADMIN_PASSWORD: "e2e-password-123",
};
const env = { ...process.env, ...E2E_ENV };
const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", env, cwd: root, ...opts });
const backend = (script) => `pnpm --filter @incident-radar/backend --silent ${script}`;

// shared 패키지는 dist 를 가리키는데 dist 는 커밋 안 함 → 깨끗한 체크아웃(CI)에선 먼저 빌드해야
// 시드 스크립트와 백엔드·프론트 빌드가 import 할 수 있다.
run("pnpm --filter @incident-radar/shared build");
run(`${compose} up -d --wait`);
try {
  run(backend("migration:run"));
  run(backend("seed:admin"));
  const apiKey = execSync(backend("seed:api-key e2e"), { env, cwd: root }).toString().trim().split("\n").at(-1);
  // 인자는 배열로 넘긴다(-g "띄어쓰기 있는 이름" 이 쪼개지지 않게).
  execFileSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], {
    stdio: "inherit",
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...env, E2E_API_KEY: apiKey },
  });
} finally {
  run(`${compose} down`);
}
