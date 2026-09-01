import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * alerts 테이블 — 발송에 성공한 알림 이력.
 * 최종 실패는 alert_failures 로 따로 간다 (원본 요구: alerts 를 넓히지 않고 실패만 조회).
 */
@Entity("alerts")
@Index("idx_alerts_at", ["at"])
export class Alert {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("text")
  service!: string;

  @Column("integer")
  count!: number;

  @Column("integer")
  threshold!: number;

  @Column("integer", { name: "window_ms" })
  windowMs!: number;

  @Column("text", { default: "dispatched" })
  status!: string;

  @CreateDateColumn({ name: "at", type: "timestamptz" })
  at!: Date;
}
