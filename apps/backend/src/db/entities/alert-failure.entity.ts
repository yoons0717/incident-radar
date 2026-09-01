import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * alert_failures 테이블 — 재시도 5회를 소진하고도 발송 실패한 알림.
 * payload 는 워커가 보내려던 본문 전체를 그대로 담는다 (재현/디버깅용).
 */
@Entity("alert_failures")
@Index("idx_alert_failures_failed_at", ["failedAt"])
export class AlertFailure {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("text")
  service!: string;

  @Column("jsonb")
  payload!: unknown;

  @Column("text")
  error!: string;

  @Column("integer")
  attempts!: number;

  @CreateDateColumn({ name: "failed_at", type: "timestamptz" })
  failedAt!: Date;
}
