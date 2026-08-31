import { z } from "zod";

/**
 * GET /errors 쿼리 스트링. 값은 전부 문자열로 들어오므로 coerce 로 변환한다.
 * limit 은 상한(1000)을 넘으면 에러가 아니라 조용히 클램프한다.
 */
export const ErrorsQuery = z.object({
  service: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(100)
    .transform((n) => Math.min(n, 1000)),
});

export type ErrorsQuery = z.infer<typeof ErrorsQuery>;
