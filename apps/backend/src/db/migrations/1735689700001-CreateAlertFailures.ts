import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAlertFailures1735689700001 implements MigrationInterface {
  name = "CreateAlertFailures1735689700001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "alert_failures" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "service" text NOT NULL,
        "payload" jsonb NOT NULL,
        "error" text NOT NULL,
        "attempts" integer NOT NULL,
        "failed_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_alert_failures_failed_at" ON "alert_failures" ("failed_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_alert_failures_failed_at"`);
    await queryRunner.query(`DROP TABLE "alert_failures"`);
  }
}
