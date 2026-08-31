// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.config.*",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // TS 파일에서는 컴파일러가 미정의 식별자를 잡으므로 core no-undef 는 끈다.
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-undef": "off",
    },
  },
  {
    // Node 스크립트(.mjs/.js): process, __dirname 등 Node 전역 인식
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
