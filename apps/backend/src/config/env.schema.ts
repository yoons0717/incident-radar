import { z } from "zod";

/**
 * 환경변수 스키마. 부팅 시 process.env 를 여기에 통과시켜,
 * 빠졌거나 형식이 틀리면 앱이 아예 안 뜨게 한다.
 * (설정 오류를 런타임 깊은 곳이 아니라 시작 시점에 잡는다)
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ALERT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  ALERT_THRESHOLD: z.coerce.number().int().positive().default(10),
  ALERT_COOLDOWN_SEC: z.coerce.number().int().positive().default(300),
  // 브라우저에서 대시보드가 API 를 부르려면 필요. 콤마 목록·헤더 세부는 이후 보안 마무리에서.
  CORS_ORIGIN: z.string().url().default("http://localhost:3001"),
  // POST /errors 레이트리밋 (IP 기준, 분당). 부하테스트는 이 값을 올려서 한다.
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(600),
  // 대시보드 로그인 세션 쿠키 서명 키. 최소 16자.
  SESSION_SECRET: z.string().min(16),
  // 관리자 계정 seed 용 (seed:admin CLI 에서만 읽음). 앱 부팅엔 불필요.
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
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
