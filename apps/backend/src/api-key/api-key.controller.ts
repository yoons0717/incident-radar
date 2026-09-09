import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SessionGuard } from "../auth/session.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CreateApiKeyInput } from "./api-key.schema";
import { ApiKeyService } from "./api-key.service";

/** API 키 발급/조회/폐기 — admin 로그인 필수. 평문 토큰은 발급 응답에서만 볼 수 있다. */
@Controller("api-keys")
@UseGuards(SessionGuard, RolesGuard)
@Roles("admin")
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Post()
  async issue(
    @Body(new ZodValidationPipe(CreateApiKeyInput)) body: CreateApiKeyInput,
  ): Promise<{ id: string; name: string; token: string }> {
    const { id, token } = await this.apiKeys.issue(body.name);
    return { id, name: body.name, token };
  }

  @Get()
  list() {
    return this.apiKeys.list();
  }

  @Delete(":id")
  @HttpCode(204)
  async revoke(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.apiKeys.revoke(id);
  }
}
