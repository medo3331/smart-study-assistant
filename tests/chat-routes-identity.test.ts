import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Chat routes use shared Magic identity", () => {
  for (const rel of ["app/api/chat/route.ts", "app/api/unified-ai/route.ts"]) {
    it(`${rel} imports buildMagiclySystemPrompt`, () => {
      const file = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
      expect(file).toContain("buildMagiclySystemPrompt");
    });
  }
});
