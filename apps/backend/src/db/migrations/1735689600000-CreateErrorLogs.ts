import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateErrorLogs1735689600000 implements MigrationInterface {
  name = "CreateErrorLogs1735689600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "error_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "service" text NOT NULL,
        "message" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // 서비스별 시간범위 조회를 받치는 복합 인덱스 (leftmost-prefix: service → created_at)
    await queryRunner.query(`
      CREATE INDEX "idx_error_logs_service_created_at"
      ON "error_logs" ("service", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_error_logs_service_created_at"`);
    await queryRunner.query(`DROP TABLE "error_logs"`);
  }
}
