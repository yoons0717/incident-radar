import type { StatsResponse } from "@incident-radar/shared";

export interface ChartRow {
  t: string;
  [service: string]: string | number;
}

/**
 * `/stats` 의 서비스별 시리즈를 recharts 용 flat 배열로 피벗한다.
 * 모든 버킷 시각 × 모든 서비스 격자를 채우고, 데이터 없는 칸은 0 (라인이 끊기지 않게).
 * rows 는 시각 오름차순, services 는 이름 오름차순.
 */
export function pivotStats(stats: StatsResponse): { rows: ChartRow[]; services: string[] } {
  const services = stats.map((s) => s.service).sort();

  const byTime = new Map<string, ChartRow>();
  for (const series of stats) {
    for (const b of series.buckets) {
      let row = byTime.get(b.t);
      if (!row) {
        row = { t: b.t };
        for (const svc of services) row[svc] = 0;
        byTime.set(b.t, row);
      }
      row[series.service] = b.count;
    }
  }

  const rows = [...byTime.values()].sort((a, b) => a.t.localeCompare(b.t));
  return { rows, services };
}
