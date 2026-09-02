import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 핵심 로직만 유닛 테스트한다(응답 parse 래퍼·쿼리 팩토리·파생 함수). 렌더링 테스트는 범위 밖이라
// DOM 환경도 필요 없다.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
