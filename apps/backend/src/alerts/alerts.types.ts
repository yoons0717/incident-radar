/** BullMQ `alerts` 큐 이름 */
export const ALERTS_QUEUE = "alerts";

/** 큐에 실리는 잡 데이터 = 워커가 webhook 으로 보낼 알림 내용 */
export interface AlertJobData {
  service: string;
  count: number;
  threshold: number;
  windowMs: number;
}
