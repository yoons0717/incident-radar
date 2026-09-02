export type PanelState = "loading" | "error" | "empty" | "ready";

/**
 * 패널이 무엇을 그릴지 판정.
 *   - isError(재시도까지 실패) → error. retry:1 이라 이건 연속 2회 실패 = 실제 문제 신호.
 *     다음 성공 폴링(5초)에 자동 복구되므로 일시 hiccup 은 짧게만 노출.
 *   - 데이터 없음 → loading
 *   - 데이터 있고 비었으면 empty, 아니면 ready
 */
export function panelState(isError: boolean, hasData: boolean, isEmpty: boolean): PanelState {
  if (isError) return "error";
  if (!hasData) return "loading";
  return isEmpty ? "empty" : "ready";
}
