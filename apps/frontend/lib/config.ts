/**
 * NEXT_PUBLIC_ 접두사가 붙은 값만 브라우저 번들에 노출된다.
 * 이 값은 빌드 타임에 고정되므로 docker 빌드 시 build arg 로 넘긴다(T28).
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * 차트의 임계값 기준선. 백엔드 ALERT_THRESHOLD 기본값(10)과 맞춘다.
 * 응답에 임계값을 싣는 엔드포인트가 없어 상수로 둔다 — 백엔드에서 바꾸면 여기도.
 */
export const ALERT_THRESHOLD = Number(process.env.NEXT_PUBLIC_ALERT_THRESHOLD ?? 10);
