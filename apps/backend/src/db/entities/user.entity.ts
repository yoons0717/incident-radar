import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * users 테이블 — 대시보드 로그인 계정.
 * - password_hash 는 bcrypt (저엔트로피 비밀번호 → 느린 해시가 맞다).
 * - role: "admin" | "viewer". admin 만 API 키 관리 가능. email 유니크 인덱스는 마이그레이션에서.
 */
@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("idx_users_email", { unique: true })
  @Column("text")
  email!: string;

  @Column("text", { name: "password_hash" })
  passwordHash!: string;

  @Column("text", { default: "viewer" })
  role!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
