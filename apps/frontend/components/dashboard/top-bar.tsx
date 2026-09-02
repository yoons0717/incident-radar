"use client";

import { useIsFetching } from "@tanstack/react-query";
import { useDashboardUi, type RangeMinutes } from "@/lib/store";
import { cn } from "@/lib/utils";

const RANGES: { label: string; value: RangeMinutes }[] = [
  { label: "1시간", value: 60 },
  { label: "6시간", value: 360 },
  { label: "24시간", value: 1440 },
];

export function TopBar() {
  const rangeMinutes = useDashboardUi((s) => s.rangeMinutes);
  const setRange = useDashboardUi((s) => s.setRange);
  const fetching = useIsFetching() > 0;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">Incident Radar</h1>
        <span
          role="status"
          aria-label={fetching ? "새로고침 중" : "대기 중"}
          className={cn(
            "inline-block h-2 w-2 rounded-full transition-colors",
            fetching ? "animate-pulse bg-emerald-500" : "bg-neutral-300",
          )}
        />
      </div>

      <div role="group" aria-label="시간 범위" className="flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRange(r.value)}
            aria-pressed={rangeMinutes === r.value}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
              rangeMinutes === r.value
                ? "bg-neutral-900 text-neutral-50"
                : "text-neutral-600 hover:bg-neutral-100",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
    </header>
  );
}
