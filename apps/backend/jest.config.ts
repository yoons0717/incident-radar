import type { Config } from "jest";

/**
 * 두 프로젝트로 분리:
 *  - unit: src 안의 *.spec.ts (실제 인프라에 붙는 통합 수준 유닛 포함)
 *  - e2e:  test 안의 *.e2e-spec.ts (HTTP → DB 전 구간)
 * 둘 다 실제 Postgres·Redis 를 쓴다 (docker-compose.test.yml).
 */
const config: Config = {
  passWithNoTests: true,
  // watchman 은 일회성 실행/CI 에 불필요하고 macOS 샌드박스에서 경고를 냄
  watchman: false,
  projects: [
    {
      displayName: "unit",
      preset: "ts-jest",
      testEnvironment: "node",
      rootDir: "src",
      testMatch: ["**/*.spec.ts"],
      setupFilesAfterEnv: ["<rootDir>/../test/setup.ts"],
    },
    {
      displayName: "e2e",
      preset: "ts-jest",
      testEnvironment: "node",
      rootDir: ".",
      testMatch: ["<rootDir>/test/**/*.e2e-spec.ts"],
      setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
    },
  ],
};

export default config;
