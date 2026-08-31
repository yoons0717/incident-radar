import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// apps/backend/scripts → 모노레포 루트
const root = resolve(import.meta.dirname, "../../..");
const composeFile = resolve(root, "docker-compose.test.yml");

// .env.test 을 자식 프로세스 env 로 주입 (data-source 의 dotenv 는 이미 있는 값을 덮지 않음)
const envTest = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, "../.env.test"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const env = { ...process.env, ...envTest };
const run = (cmd) => execSync(cmd, { stdio: "inherit", env });

run(`docker compose -f "${composeFile}" up -d --wait`);
try {
  run("pnpm run migration:run");
  run(`pnpm exec jest ${process.argv.slice(2).join(" ")}`);
} finally {
  run(`docker compose -f "${composeFile}" down`);
}
