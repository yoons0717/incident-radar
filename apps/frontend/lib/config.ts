/**
 * NEXT_PUBLIC_ 접두사가 붙은 값만 브라우저 번들에 노출된다.
 * 이 값은 빌드 타임에 고정되므로 docker 빌드 시 build arg 로 넘긴다(T28).
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
