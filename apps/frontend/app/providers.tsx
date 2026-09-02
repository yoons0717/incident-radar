"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { POLL_MS } from "@/lib/api/queries";

/**
 * 앱 전역 TanStack Query 클라이언트. 대시보드는 5초마다 다시 가져오고(refetchInterval),
 * 그 사이 데이터는 신선하다고 본다(staleTime). QueryClient 는 리렌더마다 새로 만들지 않게 state 로.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: POLL_MS,
            refetchInterval: POLL_MS,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
