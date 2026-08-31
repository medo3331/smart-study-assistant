import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".redesign-backup/**",
    "next-env.d.ts",
  ]),
  {
    // CommonJS scripts use require() intentionally — e.g. *.cjs and run-migration.js
    // Disabling no-require-imports here is behavior-preserving; converting to ESM would break Node execution.
    files: ["**/*.cjs", "**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
