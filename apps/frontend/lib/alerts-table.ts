import type { Alert } from "@incident-radar/shared";

export interface AlertRow {
  id: string;
  time: string; // HH:MM:SS (로컬)
  service: string;
  status: "dispatched" | "failed";
  failed: boolean;
  windowCount: string; // dispatched: 알림 시점 창 카운트 / failed: "—" (스키마에 없음)
  attempts: string;
  detail: string;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 공유 Alert(판별 유니온)을 테이블 한 행으로. */
export function alertRow(a: Alert): AlertRow {
  const base = {
    id: a.id,
    time: fmtTime(a.at),
    service: a.service,
    status: a.status,
    failed: a.status === "failed",
  };
  if (a.status === "dispatched") {
    return {
      ...base,
      windowCount: String(a.count),
      attempts: "1",
      detail: `임계값 ${a.threshold} · ${a.windowMs / 1000}s 창`,
    };
  }
  return {
    ...base,
    windowCount: "—",
    attempts: String(a.attempts),
    detail: a.error,
  };
}

/** aria-live 안내용 — 가장 최근(맨 앞) 알림 한 줄. 없으면 빈 문자열. */
export function latestAlertLabel(alerts: Alert[] | undefined): string {
  const a = alerts?.[0];
  if (!a) return "";
  return `새 알림: ${a.service} ${a.status === "failed" ? "발송 실패" : "발송됨"}`;
}
