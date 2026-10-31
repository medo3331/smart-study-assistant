import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("MagicAvatar (static checks)", () => {
  const file = fs.readFileSync(
    path.resolve(process.cwd(), "components/MagicAvatar.tsx"),
    "utf8"
  );

  it("defines all four states", () => {
    for (const s of ["idle", "thinking", "speaking", "error"]) {
      expect(file).toContain(s);
    }
  });

  it("respects prefers-reduced-motion via CSS", () => {
    expect(file).toContain("prefers-reduced-motion: reduce");
    expect(file).toContain("animation: none");
  });

  it("uses SVG + CSS only (no animation libs)", () => {
    expect(file).not.toMatch(/framer-motion|lottie|rive/i);
    expect(file).toContain("<svg");
  });

  it("supports sizes sm/md/lg", () => {
    for (const s of ["sm", "md", "lg"]) expect(file).toContain(s);
  });
});
