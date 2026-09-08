import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateApiKeys1735689800000 implements MigrationInterface {
  name = "CreateApiKeys1735689800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" text NOT NULL,
        "key_hash" text NOT NULL,
        "prefix" text NOT NULL,
        "last_used_at" timestamptz,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // 인증 조회는 key_hash 단일 컬럼 exact match — 유니크 인덱스 하나로 충분.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_api_keys_key_hash" ON "api_keys" ("key_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_api_keys_key_hash"`);
    await queryRunner.query(`DROP TABLE "api_keys"`);
  }
}
