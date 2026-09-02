import type { ReactNode } from "react";
import type { ApiError } from "@/lib/api/client";
import { panelState } from "@/lib/panel-state";

function errorText(error: unknown): string {
  const kind = (error as Partial<ApiError> | null)?.kind;
  if (kind === "network") return "백엔드에 연결하지 못했습니다.";
  if (kind === "http") return "서버가 오류를 반환했습니다.";
  if (kind === "parse") return "응답 형식이 예상과 다릅니다.";
  return "이 패널을 불러오지 못했습니다.";
}

/**
 * 패널 하나의 로딩/에러/빈/정상 분기. 에러는 이 패널 안에만 머문다(페이지 전체는 안 죽음).
 * hasData/isEmpty 는 호출부가 도메인에 맞게 계산해 넘긴다.
 */
export function PanelState({
  isError,
  error,
  hasData,
  isEmpty,
  emptyText,
  skeleton,
  children,
}: {
  isError: boolean;
  error?: unknown;
  hasData: boolean;
  isEmpty: boolean;
  emptyText: string;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const state = panelState(isError, hasData, isEmpty);

  if (state === "loading") return <>{skeleton}</>;

  if (state === "error") {
    return (
      <div
        role="alert"
        className="flex h-full min-h-[120px] flex-col items-center justify-center px-4 py-[34px] text-center"
      >
        <div className="text-[13px] font-semibold text-crit">불러오지 못했습니다</div>
        <div className="mt-1 text-[11.5px] text-ink-muted">{errorText(error)}</div>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center px-4 py-[34px] text-center text-[11.5px] text-ink-muted">
        {emptyText}
      </div>
    );
  }

  return <>{children}</>;
}
