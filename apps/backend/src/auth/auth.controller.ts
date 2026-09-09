import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LoginInput } from "./auth.schema";
import { SessionGuard } from "./session.guard";
import { UserService } from "./user.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly users: UserService) {}

  /** POST /auth/login — 이메일+비밀번호 → 세션 생성. 무차별 대입 방지로 분당 10회로 조인다. */
  @Post("login")
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(LoginInput)) body: LoginInput,
    @Req() req: Request,
  ): Promise<{ email: string; role: string }> {
    const user = await this.users.verifyLogin(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다");
    }
    // 권한 상승 시점에 세션 ID 를 새로 발급한다 (session fixation 방지).
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.role = user.role;
    return { email: user.email, role: user.role };
  }

  /** POST /auth/logout — 세션 삭제 (Redis 키 제거). */
  @Post("logout")
  @HttpCode(204)
  logout(@Req() req: Request): Promise<void> {
    return new Promise((resolve) => req.session.destroy(() => resolve()));
  }

  /** GET /auth/me — 현재 로그인 사용자. */
  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() req: Request): { email: string; role: string } {
    return { email: req.session.email ?? "", role: req.session.role ?? "" };
  }
}
