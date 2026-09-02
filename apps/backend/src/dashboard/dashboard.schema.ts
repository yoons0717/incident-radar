import { z } from "zod";

/**
 * GET /stats 쿼리스트링. 값은 문자열로 들어오므로 coerce.
 * from/to 생략 시 서비스가 기본 창(최근 60분)을 채운다. bucket 은 초 단위(기본 60),
 * 10초~1시간으로 조용히 클램프.
 */
export const StatsQuery = z.object({
  service: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  bucket: z.coerce
    .number()
    .int()
    .positive()
    .default(60)
    .transform((n) => Math.min(Math.max(n, 10), 3600)),
});
export type StatsQuery = z.infer<typeof StatsQuery>;

/** GET /alerts 쿼리스트링. limit 기본 50, 상한 200 은 조용히 클램프. */
export const AlertsQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(50)
    .transform((n) => Math.min(n, 200)),
});
export type AlertsQuery = z.infer<typeof AlertsQuery>;
