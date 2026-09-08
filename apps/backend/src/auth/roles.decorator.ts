import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

/** 핸들러/컨트롤러에 허용 역할을 붙인다. RolesGuard 가 읽는다. */
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
