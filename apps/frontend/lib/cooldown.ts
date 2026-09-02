import type { ServiceStatus } from "@incident-radar/shared";
import { cooldownRemaining } from "./api/derive";

export interface CooldownRow {
  service: string;
  active: boolean;
  /** 보간된 잔여 초. cooldown 이력이 없으면 null. */
  remainingSec: number | null;
  /** 진행 바 채움 % (0~100). fullSec 을 분모로. */
  pct: number;
}

/**
 * `/status` 를 cooldown 패널용 행으로. 활성(잔여>0) 먼저 잔여 내림차순, 나머지는 이름순.
 * fetchedAtMs = 응답이 온 시각, nowMs = 로컬 틱 → 폴링 사이 잔여를 보간한다.
 */
export function cooldownRows(
  status: ServiceStatus[] | undefined,
  fetchedAtMs: number,
  nowMs: number,
  fullSec: number,
): CooldownRow[] {
  const rows: CooldownRow[] = (status ?? []).map((s) => {
    const remainingSec = cooldownRemaining(s.cooldownTtlSec, fetchedAtMs, nowMs);
    const active = remainingSec !== null && remainingSec > 0;
    const pct = active ? Math.min(100, Math.max(0, (remainingSec / fullSec) * 100)) : 0;
    return { service: s.service, active, remainingSec: remainingSec ?? null, pct };
  });

  return rows.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.active) return (b.remainingSec ?? 0) - (a.remainingSec ?? 0);
    return a.service.localeCompare(b.service);
  });
}
