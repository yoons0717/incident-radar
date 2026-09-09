"use client";

import type { ReactNode } from "react";
import { useAlerts, useStats, useStatus } from "@/lib/api/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { rangeLabel, useDashboardUi } from "@/lib/store";
import { alertCounts, cooldownServiceCount, recentErrorCount } from "@/lib/tiles";

const DAY_MS = 24 * 60 * 60 * 1000;

function Tile({
  label,
  value,
  sub,
  crit,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  crit?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border bg-surface px-[15px] py-[14px] shadow-card",
        crit ? "border-crit/40" : "border-border",
      )}
    >
      <div className="mb-[9px] text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-[27px] font-medium leading-none tracking-[-0.02em] tabular-nums",
          crit && "text-crit",
        )}
      >
        {value}
      </div>
      {sub != null && <div className="mt-[7px] text-[11.5px] text-ink-muted">{sub}</div>}
    </div>
  );
}

function SkeletonTile() {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-[15px] shadow-card">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-7 w-12" />
    </div>
  );
}

export function StatTiles() {
  const service = useDashboardUi((s) => s.service);
  const rangeMinutes = useDashboardUi((s) => s.rangeMinutes);

  const stats = useStats({ service, rangeMinutes });
  const status = useStatus();
  const alerts = useAlerts(100);

  const errors = recentErrorCount(stats.data);
  const { dispatched, failed } = alertCounts(alerts.data, Date.now() - DAY_MS);
  const cooling = cooldownServiceCount(status.data);
  const coolingNames = (status.data ?? [])
    .filter((s) => s.cooldownActive)
    .map((s) => s.service);

  // 어느 쿼리도 데이터를 못 받은 첫 로드
  const firstLoad =
    stats.data === undefined && status.data === undefined && alerts.data === undefined;
  // 셋 다 실패 → 요약 스트립을 에러로 (일부만 실패면 받은 값으로 채운다)
  const allError = stats.isError && status.isError && alerts.isError;

  return (
    <section aria-labelledby="tiles-heading" className="mt-3">
      <h2 id="tiles-heading" className="sr-only">
        요약
      </h2>

      {allError ? (
        <div
          role="alert"
          className="rounded-[10px] border border-border bg-surface px-[15px] py-3 text-[11.5px] text-crit shadow-card"
        >
          요약 지표를 불러오지 못했습니다.
        </div>
      ) : firstLoad ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonTile key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Tile label={`최근 ${rangeLabel(rangeMinutes)} 에러`} value={errors} />

          <Tile
            label="최근 24시간 알림"
            value={dispatched}
            sub={
              <>
                <span className={failed > 0 ? "font-semibold text-crit" : undefined}>
                  실패 {failed}
                </span>{" "}
                &middot; dispatched {dispatched}
              </>
            }
          />

          <Tile
            label="cooldown 중 서비스"
            value={cooling}
            crit={cooling > 0}
            sub={coolingNames.length > 0 ? coolingNames.slice(0, 3).join(" · ") : undefined}
          />
        </div>
      )}
    </section>
  );
}
