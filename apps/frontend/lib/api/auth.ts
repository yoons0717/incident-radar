import { API_URL } from "@/lib/config";
import { ApiError } from "./client";

export interface Session {
  email: string;
  role: string;
}

/**
 * POST /auth/login — 성공하면 세션 쿠키가 설정되고 { email, role } 를 반환한다.
 * 실패(잘못된 자격증명·레이트리밋 등)는 ApiError 로 던진다.
 */
export async function login(email: string, password: string): Promise<Session> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
  } catch (e) {
    throw new ApiError("network", "로그인 요청 실패", e);
  }
  if (!res.ok) {
    throw new ApiError("http", `로그인 실패 (${res.status})`);
  }
  return (await res.json()) as Session;
}

/** POST /auth/logout — 세션을 지운다. 실패해도 조용히 넘어간다(어차피 로그인 화면으로 보낸다). */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
  } catch {
    // 무시 — 호출부가 곧바로 /login 으로 보낸다.
  }
}
