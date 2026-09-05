import { create } from "zustand";

/** 최근 1시간 / 6시간 / 24시간 (분). 대시보드가 보여줄 시간 범위. */
export type RangeMinutes = 60 | 360 | 1440;

/** RangeMinutes 를 화면 표시용 라벨로 ("60" → "1시간"). */
export function rangeLabel(rangeMinutes: number): string {
  return rangeMinutes >= 60 ? `${rangeMinutes / 60}시간` : `${rangeMinutes}분`;
}

/**
 * UI 임시 상태만 담는다 (선택 서비스·기간). 서버에서 온 데이터는 TanStack Query 가 갖고,
 * 이 스토어는 "무엇을 볼지"만 관리한다.
 */
interface DashboardUiState {
  service: string | null; // null = 전체 서비스
  rangeMinutes: RangeMinutes;
  setService: (service: string | null) => void;
  setRange: (rangeMinutes: RangeMinutes) => void;
}

export const useDashboardUi = create<DashboardUiState>((set) => ({
  service: null,
  rangeMinutes: 60,
  setService: (service) => set({ service }),
  setRange: (rangeMinutes) => set({ rangeMinutes }),
}));
