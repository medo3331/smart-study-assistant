import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("OnboardingTour (static checks)", () => {
  const tour = fs.readFileSync(
    path.resolve(process.cwd(), "components/magic/OnboardingTour.tsx"),
    "utf8"
  );
  const route = fs.readFileSync(
    path.resolve(process.cwd(), "app/api/onboarding/progress/route.ts"),
    "utf8"
  );

  it("بيستخدم API الجولة وMagicAvatar بدون أي AI", () => {
    expect(tour).toContain("/api/onboarding/progress");
    expect(tour).toContain("MagicAvatar");
    expect(tour).not.toMatch(/unified-ai|\/api\/chat|groq/i);
    expect(route).not.toMatch(/reserve_ai_credit|groq|openrouter/i);
  });

  it("فيه تخطي الجولة ونقاط تقدم ودعم prefers-reduced-motion مش مطلوب هنا", () => {
    expect(tour).toContain("تخطي الجولة");
    expect(tour).toContain("aria-label");
  });

  it("الـ API بيفلتر بالمستخدم وبيستخدم upsert على user_id", () => {
    expect(route).toContain('eq("user_id", user.id)');
    expect(route).toContain('onConflict: "user_id"');
  });
});
