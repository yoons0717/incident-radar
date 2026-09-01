import { Body, Controller, Get, Post, Query } from "@nestjs/common";
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

  /** POST /errors — 에러 로그 1건 저장 (Nest 는 POST 에 기본 201) */
  @Post()
  async create(@Body(new ZodValidationPipe(ErrorLogInput)) body: ErrorLogInput) {
    const saved = await this.errors.create(body);
    // 저장 직후 임계값 경로. Redis 장애 시 여기서 throw → T14 에서 fallback/격리.
    await this.detector.check(body.service);
    return saved;
  }

  /** GET /errors?service=&from=&to=&limit= — 이력 조회 (created_at desc) */
  @Get()
  find(@Query(new ZodValidationPipe(ErrorsQuery)) query: ErrorsQuery) {
    return this.errors.find(query);
  }
}
