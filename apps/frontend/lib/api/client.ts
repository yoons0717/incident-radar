import type { ZodType } from "zod";
import { API_URL } from "@/lib/config";

export type ApiErrorKind = "network" | "http" | "parse";

/**
 * API 호출 실패를 종류로 구분해 던진다. 패널이 실패 원인에 따라 다르게 보여줄 수 있게.
 *   - network: fetch 자체가 실패 (백엔드 다운, CORS, DNS 등)
 *   - http:    응답은 왔지만 2xx 아님
 *   - parse:   본문이 JSON 이 아니거나 공유 스키마에 안 맞음 (스키마 드리프트·프록시 에러 본문)
 */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** GET 후 공유 스키마로 파싱. 타입이 있어도 구동 중 서버는 컴파일러가 못 본 걸 반환할 수 있어 경계 파싱. */
export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { accept: "application/json" },
      // 대시보드 조회 라우트는 로그인 세션 쿠키를 요구한다. 다른 오리진이라 include 필요.
      credentials: "include",
    });
  } catch (e) {
    throw new ApiError("network", `요청 실패: GET ${path}`, e);
  }

  if (!res.ok) {
    // 세션이 없거나 만료 → 로그인 화면으로. (SSR/테스트엔 window 가 없다.)
    if (
      res.status === 401 &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/login"
    ) {
      window.location.href = "/login";
    }
    throw new ApiError("http", `GET ${path} → ${res.status} ${res.statusText}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    throw new ApiError("parse", `JSON 파싱 실패: GET ${path}`, e);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("parse", `응답 스키마 불일치: GET ${path}`, parsed.error);
  }
  return parsed.data;
}
