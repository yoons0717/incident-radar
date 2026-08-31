import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * 신뢰 경계(컨트롤러 입구)에서 요청을 Zod 스키마로 검증한다.
 * 실패하면 400 + 어떤 필드가 왜 틀렸는지 목록을 돌려준다.
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "요청 검증 실패",
        issues: result.error.issues.map((i) => ({
          path: i.path.join(".") || "(root)",
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
