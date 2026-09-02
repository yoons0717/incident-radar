/**
 * "최근 윈도우 안에 이 서비스의 이벤트가 몇 건인가" 를 세는 전략.
 * 구현체는 Redis 슬라이딩 윈도우와 DB COUNT fallback 두 가지이고,
 * CounterSelector 가 Redis 헬스 플래그를 보고 호출 단위로 고른다.
 */
export interface CounterStrategy {
  /**
   * 이벤트 하나를 기록하고, at 시점 기준 윈도우 안의 개수를 돌려준다.
   * @param service 서비스 이름
   * @param at 이벤트 발생 시각(ms epoch) — 호출부가 Clock 으로 주입
   */
  record(service: string, at: number): Promise<number>;
}

/** DI 토큰 (인터페이스는 런타임에 없으므로 Symbol 로 주입) */
export const COUNTER = Symbol("COUNTER");
