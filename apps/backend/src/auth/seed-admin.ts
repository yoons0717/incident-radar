import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "../app.module";
import type { Env } from "../config/env.schema";
import { UserService } from "./user.service";

/**
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD 로 admin 계정을 만들거나 갱신한다.
 *   SEED_ADMIN_EMAIL=me@x.com SEED_ADMIN_PASSWORD=... pnpm --filter backend seed:admin
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const config = app.get(ConfigService<Env, true>);
    const email = config.get("SEED_ADMIN_EMAIL", { infer: true });
    const password = config.get("SEED_ADMIN_PASSWORD", { infer: true });
    if (!email || !password) {
      throw new Error("SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD 를 설정하세요.");
    }
    await app.get(UserService).create({ email, password, role: "admin" });
    process.stdout.write(`admin 계정 준비됨: ${email}\n`);
  } finally {
    await app.close();
  }
}

void main();
