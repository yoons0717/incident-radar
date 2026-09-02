"use client";

import { useEffect, useRef, useState } from "react";
import { useAlerts } from "@/lib/api/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { alertRow, latestAlertLabel } from "@/lib/alerts-table";
import { cn } from "@/lib/utils";
import { PanelState } from "./panel-state";

const COLS = ["시각", "서비스", "상태", "창 카운트", "시도", "상세"];

export function AlertsTable() {
  const alerts = useAlerts(100);
  const rows = (alerts.data ?? []).map(alertRow);

  // 맨 앞 알림 id 가 바뀌면(첫 로드 제외) 스크린리더에 한 줄 안내.
  const topId = alerts.data?.[0]?.id;
  const prevTopId = useRef<string | undefined>(undefined);
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    if (topId && prevTopId.current !== undefined && topId !== prevTopId.current) {
      setAnnounce(latestAlertLabel(alerts.data));
    }
    prevTopId.current = topId;
  }, [topId, alerts.data]);

  return (
    <section className="mt-3 rounded-[10px] border border-border bg-surface shadow-card">
      <div className="border-b border-border px-[15px] py-[13px]">
        <h2 className="text-[12.5px] font-semibold">
          Recent alerts{" "}
          <span className="ml-1 text-[11px] font-normal text-ink-faint">
            alerts &amp; alert_failures
          </span>
        </h2>
      </div>

      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      <div className="px-[3px] py-[6px]">
        <PanelState
          isError={alerts.isError}
          error={alerts.error}
          hasData={alerts.data !== undefined}
          isEmpty={rows.length === 0}
          emptyText="최근 24시간 알림이 없습니다."
          skeleton={
            <div className="space-y-2 px-3 py-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {COLS.map((c, i) => (
                    <th
                      key={c}
                      className={cn(
                        "px-3 pb-[9px] text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-faint",
                        i >= 3 && i <= 4 ? "text-right" : "text-left",
                      )}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td
                      className={cn(
                        "relative whitespace-nowrap px-3 py-[10px] font-mono tabular-nums text-ink-muted [border-top:1px_solid_var(--color-border)]",
                        r.failed &&
                          "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-crit before:content-['']",
                      )}
                    >
                      {r.time}
                    </td>
                    <td className="px-3 py-[10px] [border-top:1px_solid_var(--color-border)]">
                      <span className="rounded-md border border-border bg-surface-2 px-[7px] py-[2px] font-mono text-[11.5px] font-medium">
                        {r.service}
                      </span>
                    </td>
                    <td className="px-3 py-[10px] [border-top:1px_solid_var(--color-border)]">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-[2.5px] text-[10px] font-semibold uppercase tracking-[0.03em]",
                          r.failed
                            ? "bg-crit-soft text-crit"
                            : "bg-ok-soft text-ok",
                        )}
                      >
                        <span className="h-[5px] w-[5px] rounded-full bg-current" />
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-[10px] text-right font-mono tabular-nums [border-top:1px_solid_var(--color-border)]">
                      {r.windowCount}
                    </td>
                    <td className="px-3 py-[10px] text-right font-mono tabular-nums [border-top:1px_solid_var(--color-border)]">
                      {r.attempts}
                    </td>
                    <td className="px-3 py-[10px] text-[11px] text-ink-faint [border-top:1px_solid_var(--color-border)]">
                      {r.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelState>
      </div>
    </section>
  );
}
