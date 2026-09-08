import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ROLES_KEY } from "./roles.decorator";

/**
 * @Roles(...) 로 지정된 역할만 통과. SessionGuard 뒤에 온다는 전제
 * (세션이 있어야 role 이 있으므로). 역할 지정이 없으면 통과.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const role = context.switchToHttp().getRequest<Request>().session?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException("권한이 없습니다");
    }
    return true;
  }
}
