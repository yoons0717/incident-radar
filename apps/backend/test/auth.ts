import { hashToken, tokenPrefix } from "../src/api-key/api-key.util";
import { testDataSource } from "./db";

/**
 * 모든 e2e 스펙이 공유하는 고정 API 토큰. setup.ts 가 각 테스트 전에 test DB 에 심는다
 * (truncateAll 이 api_keys 도 비우므로 매번 재삽입).
 */
export const TEST_API_TOKEN = "ir_e2e_fixed_token_do_not_use_in_prod";
export const TEST_BEARER = `Bearer ${TEST_API_TOKEN}`;

export async function seedTestApiKey(): Promise<void> {
  await testDataSource.query(
    `INSERT INTO api_keys ("name", "key_hash", "prefix") VALUES ($1, $2, $3)
     ON CONFLICT ("key_hash") DO NOTHING`,
    ["e2e", hashToken(TEST_API_TOKEN), tokenPrefix(TEST_API_TOKEN)],
  );
}
