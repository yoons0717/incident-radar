import { createHash, randomBytes } from "node:crypto";

/**
 * API 키 토큰 유틸 (DI 불필요한 순수 함수).
 * 토큰 평문은 발급 시 1회만 노출하고 저장하지 않는다 — DB 에는 hashToken() 결과만 넣는다.
 * 토큰이 고엔트로피(24바이트 랜덤)라 bcrypt 대신 빠른 sha256 으로 충분하고,
 * key_hash 를 그대로 유니크 인덱스로 조회할 수 있다.
 */

export const API_KEY_PREFIX = "ir_";

/** 새 평문 토큰: ir_ + 24바이트 랜덤(base64url). */
export function generateToken(): string {
  return API_KEY_PREFIX + randomBytes(24).toString("base64url");
}

/** 토큰 → 저장·조회용 해시 (sha256 hex 64자). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 목록에서 키를 식별하기 위한 앞부분 (평문 일부, 비밀 아님). */
export function tokenPrefix(token: string): string {
  return token.slice(0, API_KEY_PREFIX.length + 6);
}
