"use client";

import { useIsFetching } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api/auth";
import { useDashboardUi, type RangeMinutes } from "@/lib/store";
import { cn } from "@/lib/utils";

const RANGES: { label: string; value: RangeMinutes }[] = [
  { label: "1시간", value: 60 },
  { label: "6시간", value: 360 },
  { label: "24시간", value: 1440 },
];

export function TopBar() {
  const router = useRouter();
  const rangeMinutes = useDashboardUi((s) => s.rangeMinutes);
  const setRange = useDashboardUi((s) => s.setRange);
  const fetching = useIsFetching() > 0;

  async function onLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-border pb-[18px]">
      <div className="flex items-baseline gap-2.5">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Incident Radar</h1>
        <span className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-faint">
          Overview
        </span>
      </div>

      <div className="flex-1" />

      <div
        role="group"
        aria-label="시간 범위"
        className="flex gap-0.5 rounded-[9px] border border-border bg-surface-2 p-[3px]"
      >
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRange(r.value)}
            aria-pressed={rangeMinutes === r.value}
            className={cn(
              "rounded-md px-3 py-[5px] text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              rangeMinutes === r.value
                ? "bg-surface text-ink shadow-card"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
        <span
          role="status"
          aria-label={fetching ? "새로고침 중" : "대기 중"}
          className="h-1.5 w-1.5 rounded-full bg-ok [animation:poll-pulse_2.4s_ease-out_infinite] motion-reduce:[animation:none]"
        />
        실시간
      </span>

      <button
        type="button"
        onClick={onLogout}
        className="text-[11.5px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        로그아웃
      </button>
    </header>
  );
}
