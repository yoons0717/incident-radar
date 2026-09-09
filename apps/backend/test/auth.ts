import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { hashToken, tokenPrefix } from "../src/api-key/api-key.util";
import { testDataSource } from "./db";

/**
 * 모든 e2e 스펙이 공유하는 고정 자격증명. setup.ts 가 각 테스트 전에 test DB 에 심는다
 * (truncateAll 이 api_keys·users 도 비우므로 매번 재삽입).
 */
export const TEST_API_TOKEN = "ir_e2e_fixed_token_do_not_use_in_prod";
export const TEST_BEARER = `Bearer ${TEST_API_TOKEN}`;

export const TEST_ADMIN = { email: "admin@e2e.local", password: "test-admin-pw", role: "admin" };
export const TEST_VIEWER = { email: "viewer@e2e.local", password: "test-admin-pw", role: "viewer" };
// bcrypt(TEST_ADMIN.password, 12) — 매 테스트마다 해싱하지 않도록 미리 계산해 둔 값.
const FIXED_PW_HASH = "$2b$12$NdxvBiroNFqoVfUfxUxwEuORvfQkitp75xWN8.yjZGXeScboBmoXW";

export async function seedTestCredentials(): Promise<void> {
  await testDataSource.query(
    `INSERT INTO api_keys ("name", "key_hash", "prefix") VALUES ($1, $2, $3)
     ON CONFLICT ("key_hash") DO NOTHING`,
    ["e2e", hashToken(TEST_API_TOKEN), tokenPrefix(TEST_API_TOKEN)],
  );
  await testDataSource.query(
    `INSERT INTO users ("email", "password_hash", "role") VALUES ($1, $3, $4), ($2, $3, $5)
     ON CONFLICT ("email") DO NOTHING`,
    [TEST_ADMIN.email, TEST_VIEWER.email, FIXED_PW_HASH, TEST_ADMIN.role, TEST_VIEWER.role],
  );
}

/** 로그인된 supertest agent (세션 쿠키 유지). role: "admin" | "viewer". */
export async function loginAgent(
  app: INestApplication,
  role: "admin" | "viewer" = "admin",
): Promise<ReturnType<typeof request.agent>> {
  const creds = role === "admin" ? TEST_ADMIN : TEST_VIEWER;
  const agent = request.agent(app.getHttpServer());
  await agent
    .post("/auth/login")
    .send({ email: creds.email, password: creds.password })
    .expect(200);
  return agent;
}
