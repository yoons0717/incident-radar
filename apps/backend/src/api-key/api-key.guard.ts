import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiKeyService } from "./api-key.service";

/**
 * `Authorization: Bearer <API 키>` 를 검증한다. POST /errors 수집 엔드포인트에만 붙는다.
 * 실패는 모두 401 — 키가 유효한지 아닌지(폐기 포함)를 구분해서 알려주지 않는다.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      apiKeyId?: string;
    }>();

    const header = req.headers["authorization"] ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token) {
      throw new UnauthorizedException("API 키가 필요합니다 (Authorization: Bearer <key>)");
    }

    const result = await this.apiKeys.validate(token);
    if (!result) {
      throw new UnauthorizedException("유효하지 않은 API 키");
    }

    req.apiKeyId = result.id;
    return true;
  }
}
