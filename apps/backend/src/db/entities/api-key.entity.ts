import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * api_keys 테이블 — POST /errors 수집 엔드포인트 인증용.
 * - 토큰 평문은 발급 시 1회만 노출하고 저장하지 않는다. key_hash 는 sha256(토큰) hex.
 * - key_hash 유니크 인덱스는 마이그레이션에서 만든다 (조회는 이 한 컬럼으로).
 */
@Entity("api_keys")
export class ApiKey {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("text")
  name!: string;

  @Index("idx_api_keys_key_hash", { unique: true })
  @Column("text", { name: "key_hash" })
  keyHash!: string;

  /** 토큰 앞부분 — 목록에서 어떤 키인지 식별용 (평문 아님) */
  @Column("text")
  prefix!: string;

  @Column("timestamptz", { name: "last_used_at", nullable: true })
  lastUsedAt!: Date | null;

  @Column("timestamptz", { name: "revoked_at", nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
