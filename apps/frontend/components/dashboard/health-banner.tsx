"use client";

import { useHealth } from "@/lib/api/hooks";
import { healthBanner } from "@/lib/health";
import { cn } from "@/lib/utils";

const COPY = {
  degraded: {
    title: "Redis 연결 끊김",
    body: "에러 감지는 DB로 계속하고 있어요. 알림은 큐 없이 1회만 보내고 재시도하지 않아요.",
  },
  "db-down": {
    title: "DB 연결 끊김",
    body: "에러 수집이 실패하고 있어요. 앱이 보낸 에러가 저장되지 않아요.",
  },
} as const;

/** /health 를 폴링해 Redis·DB 장애를 상단에 알린다. 정상·백엔드 불통일 땐 아무것도 안 그린다. */
export function HealthBanner() {
  const health = useHealth();
  const kind = healthBanner(health.data, health.isError, health.error);

  // 라이브 영역은 항상 두고 내용만 바꿔야 스크린리더가 나타남·사라짐을 읽는다.
  return (
    <div role="status">
      {kind && (
        <div
          className={cn(
            "mt-3 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 rounded-[10px] border px-[15px] py-3 shadow-card",
            kind === "degraded" ? "border-warn/35 bg-warn-soft" : "border-crit/35 bg-crit-soft",
          )}
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className={cn("mt-px h-[18px] w-[18px]", kind === "degraded" ? "text-warn" : "text-crit")}
          >
            <path d="M8.6 2.9a1.6 1.6 0 0 1 2.8 0l6.4 11.4A1.6 1.6 0 0 1 16.4 17H3.6a1.6 1.6 0 0 1-1.4-2.7L8.6 2.9ZM10 7a.9.9 0 0 0-.9.9v3.3a.9.9 0 1 0 1.8 0V7.9A.9.9 0 0 0 10 7Zm0 6.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
          </svg>
          <strong
            className={cn(
              "text-[13px] font-semibold",
              kind === "degraded" ? "text-warn-ink" : "text-crit-ink",
            )}
          >
            {COPY[kind].title}
          </strong>
          <p className="col-start-2 text-[12.5px] leading-[1.55] text-ink-muted">{COPY[kind].body}</p>
        </div>
      )}
    </div>
  );
}
