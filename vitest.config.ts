import { defineConfig } from "vitest/config";
import path from "node:path";

const strict = process.env.GATE_STRICT === "1";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    passWithNoTests: false,
    allowOnly: !strict,
    reporters: process.env.CI ? ["default"] : ["default"],
    onConsoleLog(log) {
      if (strict && /sk-|GROQ_API_KEY\s*=/.test(log)) {
        throw new Error("GATE_STRICT: secret-looking content in console");
      }
      return true;
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
