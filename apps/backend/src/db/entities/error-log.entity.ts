import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * error_logs 테이블.
 * - id 는 DB 기본값 gen_random_uuid() (PG13+ 코어)로 생성. DataSource 의
 *   uuidExtension: "pgcrypto" 설정이 TypeORM 이 이 함수를 쓰게 한다.
 * - (service, created_at) 복합 인덱스는 마이그레이션에서 만든다.
 */
@Entity("error_logs")
@Index("idx_error_logs_service_created_at", ["service", "createdAt"])
export class ErrorLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("text")
  service!: string;

  @Column("text")
  message!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
