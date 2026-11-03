import { describe, it, expect } from "vitest";
import { classifyChatIntent } from "../chat-intent";

function intent(message: string, ctx?: any) {
  return classifyChatIntent(message, ctx).intent;
}

describe("chat-intent classifier", () => {
  it("greeting is general chat", () => {
    expect(intent("السلام عليكم")).toBe("GENERAL_CHAT");
  });

  it("general explanation is general chat", () => {
    expect(intent("اشرحلي SQL Joins")).toBe("GENERAL_CHAT");
  });

  it("uploaded file explanation is workspace search", () => {
    expect(intent("اشرحلي الملف اللي رفعته")).toBe("WORKSPACE_SEARCH");
  });

  it("explicit network lecture from files is workspace search", () => {
    expect(intent("هات محاضرة الشبكات من ملفاتي")).toBe("WORKSPACE_SEARCH");
  });

  it("recorded lecture search is recorded", () => {
    expect(intent("دور في تسجيل محاضرة الدكتور")).toBe("RECORDED_LECTURES_SEARCH");
  });

  it("recorded lecture question is recorded", () => {
    expect(intent("الدكتور قال إيه عن Normalization في التسجيل؟")).toBe("RECORDED_LECTURES_SEARCH");
  });

  it("bare lecture request is clarification", () => {
    expect(intent("هاتلي المحاضرة")).toBe("CLARIFICATION");
  });

  it("follow-up preserves active source", () => {
    expect(intent("اشرحلي المثال التاني أكتر", { activeSourceId: "lec-1", activeSourceFamily: "lecture" })).toBe("WORKSPACE_SEARCH");
  });

  it("empty workspace with general question is general", () => {
    expect(intent("ما هي قاعدة البيانات؟")).toBe("GENERAL_CHAT");
  });

  it("config or subject mention alone does not trigger search", () => {
    expect(intent("ما هو موضوع اليوم؟")).toBe("GENERAL_CHAT");
  });

  it("mixed language search request is workspace", () => {
    expect(intent("find my lecture about SQL joins")).toBe("WORKSPACE_SEARCH");
  });

  it("recorded transcript request is recorded", () => {
    expect(intent("search the transcript of yesterday's lecture")).toBe("RECORDED_LECTURES_SEARCH");
  });
});
