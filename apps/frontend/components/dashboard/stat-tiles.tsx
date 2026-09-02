"use client";

import type { ReactNode } from "react";
import { useAlerts, useStats, useStatus } from "@/lib/api/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardUi } from "@/lib/store";
import { alertCounts, cooldownServiceCount, recentErrorCount } from "@/lib/tiles";

const DAY_MS = 24 * 60 * 60 * 1000;

function rangeLabel(rangeMinutes: number): string {
  return rangeMinutes >= 60 ? `${rangeMinutes / 60}시간` : `${rangeMinutes}분`;
}

function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-1">
        <CardTitle className="text-xs font-medium text-neutral-500">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">{children}</CardContent>
    </Card>
  );
}

export function StatTiles() {
  const service = useDashboardUi((s) => s.service);
  const rangeMinutes = useDashboardUi((s) => s.rangeMinutes);

  const stats = useStats({ service, rangeMinutes });
  const status = useStatus();
  const alerts = useAlerts(200);

  const errors = recentErrorCount(stats.data);
  const { dispatched, failed } = alertCounts(alerts.data, Date.now() - DAY_MS);
  const cooling = cooldownServiceCount(status.data);

  return (
    <section aria-labelledby="tiles-heading" className="mt-6">
      <h2 id="tiles-heading" className="sr-only">
        요약
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile title={`최근 ${rangeLabel(rangeMinutes)} 에러`}>
          <span className="text-2xl font-semibold tabular-nums">{errors}</span>
        </Tile>

        <Tile title="최근 24시간 알림">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{dispatched}</span>
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700">
              실패 {failed}
            </span>
          </div>
        </Tile>

        <Tile title="cooldown 중 서비스">
          <span className="text-2xl font-semibold tabular-nums">{cooling}</span>
        </Tile>

        <Tile title="수집→알림 p95">
          <span className="text-sm text-neutral-400">이후 편에서</span>
        </Tile>
      </div>
    </section>
  );
}
