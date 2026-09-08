import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { ApiKey } from "../db/entities/api-key.entity";
import { generateToken, hashToken, tokenPrefix } from "./api-key.util";

@Injectable()
export class ApiKeyService {
  constructor(@InjectRepository(ApiKey) private readonly repo: Repository<ApiKey>) {}

  /** 새 키를 발급하고 평문 토큰을 반환한다 — 평문은 여기서만 볼 수 있다. */
  async issue(name: string): Promise<{ token: string; id: string }> {
    const token = generateToken();
    const row = await this.repo.save(
      this.repo.create({ name, keyHash: hashToken(token), prefix: tokenPrefix(token) }),
    );
    return { token, id: row.id };
  }

  /** 관리 목록 — 해시·평문은 빼고 메타데이터만. 최신순. */
  list(): Promise<Omit<ApiKey, "keyHash">[]> {
    return this.repo.find({
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      order: { createdAt: "DESC" },
    });
  }

  /** 키 폐기 (revoked_at 세팅). 없는 id 여도 조용히 통과 — 멱등. */
  async revoke(id: string): Promise<void> {
    await this.repo.update(id, { revokedAt: new Date() });
  }

  /** 평문 토큰 검증. 유효하면 { id }, 아니면 null. */
  async validate(token: string): Promise<{ id: string } | null> {
    const row = await this.repo.findOne({
      where: { keyHash: hashToken(token), revokedAt: IsNull() },
      select: { id: true },
    });
    if (!row) return null;
    // last_used_at 은 최대 분당 1회만 갱신 — 수집 경로(POST /errors)의 쓰기 증폭 방지.
    await this.repo.query(
      `UPDATE api_keys SET last_used_at = now()
       WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '60 seconds')`,
      [row.id],
    );
    return { id: row.id };
  }
}
