import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ErrorLogInput } from "@incident-radar/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ErrorsQuery } from "./errors.schema";
import { ErrorsService } from "./errors.service";

@Controller("errors")
export class ErrorsController {
  constructor(private readonly errors: ErrorsService) {}

  /** POST /errors — 에러 로그 1건 저장 (Nest 는 POST 에 기본 201) */
  @Post()
  create(@Body(new ZodValidationPipe(ErrorLogInput)) body: ErrorLogInput) {
    return this.errors.create(body);
  }

  /** GET /errors?service=&from=&to=&limit= — 이력 조회 (created_at desc) */
  @Get()
  find(@Query(new ZodValidationPipe(ErrorsQuery)) query: ErrorsQuery) {
    return this.errors.find(query);
  }
}
