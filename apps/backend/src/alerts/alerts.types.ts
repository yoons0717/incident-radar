/** BullMQ `alerts` 큐 이름 */
export const ALERTS_QUEUE = "alerts";

/** 큐에 실리는 잡 데이터 = 워커가 webhook 으로 보낼 알림 내용 */
export interface AlertJobData {
  service: string;
  count: number;
  threshold: number;
  windowMs: number;
  /**
   * 고정 윈도우 버킷 시작 epoch(ms). enqueue 시점에 계산해 박아둔다.
   * 멱등성 키(`<service>:<windowStart>`)의 재료 — 재시도돼도 같은 값이라 수신 측이 중복 식별.
   */
  windowStart: number;
}
