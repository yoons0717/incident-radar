"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStats, useStatus } from "@/lib/api/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { pivotStats } from "@/lib/chart";
import { ALERT_THRESHOLD } from "@/lib/config";
import { rangeLabel, useDashboardUi } from "@/lib/store";
import { cn } from "@/lib/utils";
import { PanelState } from "./panel-state";

// 아티팩트 목업과 동일한 서비스별 색.
const SERIES_COLOR: Record<string, string> = {
  checkout: "#c14338",
  payments: "#2f6ea5",
  auth: "#3f8f5f",
  search: "#c0851f",
};
const FALLBACK = ["#7c3aed", "#0891b2", "#65a30d", "#db2777"];
const colorFor = (svc: string, i: number) => SERIES_COLOR[svc] ?? FALLBACK[i % FALLBACK.length];

const AXIS_TICK = {
  fontSize: 10,
  fontFamily: "var(--font-plex-mono), monospace",
  fill: "#8b93a1",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function TrendChart() {
  const service = useDashboardUi((s) => s.service);
  const rangeMinutes = useDashboardUi((s) => s.rangeMinutes);
  const setService = useDashboardUi((s) => s.setService);

  const stats = useStats({ service, rangeMinutes });
  const status = useStatus();

  const { rows, services } = pivotStats(stats.data ?? []);
  const knownServices = (status.data ?? []).map((s) => s.service);
  const lastRow = rows.at(-1);

  return (
    <section className="rounded-[10px] border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[15px] py-[13px]">
        <h2 className="text-[12.5px] font-semibold">
          에러 추이 <span className="ml-1 font-normal text-[11px] text-ink-faint">errors / min</span>
        </h2>
        <div role="group" aria-label="서비스 필터" className="flex flex-wrap justify-end gap-1">
          <FilterButton active={service === null} onClick={() => setService(null)}>
            전체
          </FilterButton>
          {knownServices.map((s, i) => (
            <FilterButton
              key={s}
              active={service === s}
              onClick={() => setService(s)}
              swatch={colorFor(s, i)}
            >
              {s}
            </FilterButton>
          ))}
        </div>
      </div>

      <div className="p-[15px]">
        <div className="h-64 w-full">
          <PanelState
            isError={stats.isError}
            error={stats.error}
            hasData={stats.data !== undefined}
            isEmpty={rows.length === 0}
            emptyText={`최근 ${rangeLabel(rangeMinutes)} 동안 보고된 에러가 없습니다.`}
            skeleton={<Skeleton className="h-full w-full" />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 10, right: 14, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e6eb" vertical={false} />
                <XAxis
                  dataKey="t"
                  tickFormatter={fmtTime}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis
                  allowDecimals={false}
                  width={34}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  labelFormatter={(v) => fmtTime(String(v))}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e3e6eb",
                    fontSize: 12,
                    boxShadow: "0 1px 3px rgba(16,24,40,.1)",
                  }}
                />
                <ReferenceLine
                  y={ALERT_THRESHOLD}
                  stroke="#c14338"
                  strokeDasharray="4 3"
                  strokeOpacity={0.7}
                  label={{
                    value: `임계값 ${ALERT_THRESHOLD}/min`,
                    position: "insideTopRight",
                    fontSize: 9,
                    fontFamily: "var(--font-plex-mono), monospace",
                    fill: "#c14338",
                  }}
                />
                {services.map((s, i) => (
                  <Line
                    key={s}
                    type="linear"
                    dataKey={s}
                    stroke={colorFor(s, i)}
                    strokeWidth={1.75}
                    dot={false}
                    activeDot={{ r: 3.5 }}
                    isAnimationActive={false}
                  />
                ))}
                {lastRow &&
                  services.map((s, i) => (
                    <ReferenceDot
                      key={`end-${s}`}
                      x={lastRow.t}
                      y={Number(lastRow[s] ?? 0)}
                      r={3}
                      fill={colorFor(s, i)}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      isFront
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </PanelState>
        </div>
      </div>
    </section>
  );
}

function FilterButton({
  active,
  onClick,
  swatch,
  children,
}: {
  active: boolean;
  onClick: () => void;
  swatch?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        active ? "bg-ink text-surface" : "text-ink-muted hover:bg-surface-2",
      )}
    >
      {swatch && (
        <span
          aria-hidden
          className="h-[2.5px] w-2.5 rounded-full"
          style={{ background: swatch }}
        />
      )}
      {children}
    </button>
  );
}
