import { describe, it, expect } from "vitest";
import { modelSupports, selectModelForTask, taskRequiresImage } from "../../ai/capabilities";

describe("Phase 3D capabilities", () => {
  it("groq text model does not support images", () => {
    expect(modelSupports("openai/gpt-oss-20b", "text")).toBe(true);
    expect(modelSupports("openai/gpt-oss-20b", "image")).toBe(false);
  });
  it("gemini supports images", () => {
    expect(modelSupports("gemini-3.6-flash", "image")).toBe(true);
  });
  it("selects gemini for image only when key exists", () => {
    expect(selectModelForTask("image_understanding", { GEMINI_API_KEY: "k", GROQ_API_KEY: "g" })).toBe("gemini-3.6-flash");
    expect(selectModelForTask("image_understanding", { GROQ_API_KEY: "g" })).toBeNull();
  });
  it("text tasks use groq", () => {
    expect(selectModelForTask("text_chat", { GROQ_API_KEY: "g" })).toBe("openai/gpt-oss-20b");
  });
  it("taskRequiresImage", () => {
    expect(taskRequiresImage("image_understanding")).toBe(true);
    expect(taskRequiresImage("text_chat")).toBe(false);
  });
});