"use client";

import { useEffect, useState } from "react";
import { useStatus } from "@/lib/api/hooks";
import { COOLDOWN_SEC } from "@/lib/config";
import { cooldownRows } from "@/lib/cooldown";
import { cn } from "@/lib/utils";

function fmtMMSS(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

export function CooldownPanel() {
  const status = useStatus();

  // 폴링 사이(5초)에도 카운트다운이 매끄럽게 줄도록 1초마다 로컬 시각을 갱신.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = cooldownRows(status.data, status.dataUpdatedAt, now, COOLDOWN_SEC);

  return (
    <section className="rounded-[10px] border border-border bg-surface shadow-card">
      <div className="border-b border-border px-[15px] py-[13px]">
        <h2 className="text-[12.5px] font-semibold">
          Cooldown <span className="ml-1 text-[11px] font-normal text-ink-faint">SET NX EX</span>
        </h2>
      </div>

      <div className="px-[15px] py-[6px]">
        {rows.length === 0 ? (
          <div className="py-[34px] text-center text-[11.5px] text-ink-muted">
            최근 24시간에 활동한 서비스가 없습니다.
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.service} className="border-b border-border py-[11px] last:border-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-medium">{r.service}</span>
                {r.active && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-[2.5px] text-[10px] font-semibold uppercase tracking-[0.03em] text-warn">
                    <span className="h-[5px] w-[5px] rounded-full bg-current" />
                    cooling
                  </span>
                )}
                <span
                  className={cn(
                    "ml-auto font-mono text-[11.5px]",
                    r.active ? "text-warn" : "text-ink-faint",
                  )}
                >
                  {r.active && r.remainingSec !== null ? fmtMMSS(r.remainingSec) : "clear"}
                </span>
              </div>
              {r.active && (
                <div className="mt-2 h-1 overflow-hidden rounded bg-border">
                  <div
                    className="h-full rounded bg-warn transition-[width] duration-1000 ease-linear"
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
