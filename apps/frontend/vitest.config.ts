import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// lib/ 는 핵심 로직 유닛 테스트(node 환경). components/ 는 패널이 로딩·에러·빈·정상 상태를
// 실제로 그리는지 보는 렌더 테스트(jsdom). 데이터 훅은 테스트에서 가짜로 바꿔 네트워크 없이 돈다.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  // Next 용 tsconfig 는 jsx: preserve 라 테스트 변환에서만 React 17+ 자동 런타임을 쓴다.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    environmentMatchGlobs: [["components/**", "jsdom"]],
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx"],
  },
});
