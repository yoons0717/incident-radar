import { z } from "zod";

/**
 * 환경변수 스키마. 부팅 시 process.env 를 여기에 통과시켜,
 * 빠졌거나 형식이 틀리면 앱이 아예 안 뜨게 한다.
 * (설정 오류를 런타임 깊은 곳이 아니라 시작 시점에 잡는다)
 *
 * 항목은 페이즈가 진행되며 늘어난다. 지금은 최소.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ALERT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  ALERT_THRESHOLD: z.coerce.number().int().positive().default(10),
  ALERT_COOLDOWN_SEC: z.coerce.number().int().positive().default(300),
  // 브라우저에서 대시보드가 API 를 부르려면 필요. 콤마 목록·헤더 세부는 T20 에서.
  CORS_ORIGIN: z.string().url().default("http://localhost:3001"),
  // 비우면(또는 미설정) 워커가 webhook 대신 구조화 로그로 대체.
  WEBHOOK_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`환경변수 검증 실패:\n${issues}`);
  }
  return parsed.data;
}
