import { z } from "zod";

export const CreateApiKeyInput = z.object({
  name: z.string().min(1).max(100),
});
export type CreateApiKeyInput = z.infer<typeof CreateApiKeyInput>;
