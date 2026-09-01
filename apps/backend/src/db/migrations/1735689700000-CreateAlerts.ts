import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAlerts1735689700000 implements MigrationInterface {
  name = "CreateAlerts1735689700000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "alerts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "service" text NOT NULL,
        "count" integer NOT NULL,
        "threshold" integer NOT NULL,
        "window_ms" integer NOT NULL,
        "status" text NOT NULL DEFAULT 'dispatched',
        "at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // GET /alerts 는 최신순 조회 (T16)
    await queryRunner.query(`CREATE INDEX "idx_alerts_at" ON "alerts" ("at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_alerts_at"`);
    await queryRunner.query(`DROP TABLE "alerts"`);
  }
}
