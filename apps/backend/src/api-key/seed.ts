import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { ApiKeyService } from "./api-key.service";

/**
 * 로컬/데모용 API 키 발급 CLI. 평문 토큰을 stdout 으로 딱 한 번 출력한다 (이후 조회 불가).
 *   pnpm --filter backend seed:api-key "sim"
 */
async function main(): Promise<void> {
  const name = process.argv[2] ?? "local";
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const { token } = await app.get(ApiKeyService).issue(name);
    process.stdout.write(`${token}\n`);
  } finally {
    await app.close();
  }
}

void main();
