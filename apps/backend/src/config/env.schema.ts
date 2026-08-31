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
