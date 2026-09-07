import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { ErrorLogInput } from "@incident-radar/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DetectorService } from "../detector/detector.service";
import { ErrorsQuery } from "./errors.schema";
import { ErrorsService } from "./errors.service";

@Controller("errors")
export class ErrorsController {
  constructor(
    private readonly errors: ErrorsService,
    private readonly detector: DetectorService,
  ) {}

  /** POST /errors — 에러 로그 1건 저장 (Nest 는 POST 에 기본 201). 레이트리밋 대상. */
  @Post()
  @UseGuards(ThrottlerGuard)
  async create(@Body(new ZodValidationPipe(ErrorLogInput)) body: ErrorLogInput) {
    const startedAt = Date.now(); // 수신~감지 종료 지연 측정 (detector 가 로그로 남김)
    const saved = await this.errors.create(body);
    // 저장 직후 임계값 경로. Redis 다운은 CounterSelector 가 DB 집계로 폴백하므로
    // 여기서 throw 되지 않는다 (Redis·DB 둘 다 실패해야 500).
    await this.detector.check(body.service, startedAt);
    return saved;
  }

  /** GET /errors?service=&from=&to=&limit= — 이력 조회 (created_at desc) */
  @Get()
  find(@Query(new ZodValidationPipe(ErrorsQuery)) query: ErrorsQuery) {
    return this.errors.find(query);
  }
}
