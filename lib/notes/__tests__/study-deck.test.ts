// lib/notes/__tests__/study-deck.test.ts
//
// 🎴 اختبارات تحليل ردود الـ AI — الـ JSON المتسامح والتحقق من الشكل.

import { describe, expect, it } from "vitest";

import { extractJson, parseDeck } from "../study-deck";

describe("study-deck — extractJson", () => {
  it("يقرا JSON نظيف", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("يقرا JSON داخل code fence", () => {
    expect(extractJson("أهو البطاقات:\n```json\n{\"a\":2}\n```")).toEqual({ a: 2 });
  });

  it("يقرا JSON وسط كلام عربي", () => {
    expect(extractJson("تمام، دي النتيجة: {\"ok\": true} بالتوفيق")).toEqual({ ok: true });
  });

  it("يرجّع null لو مفيش JSON", () => {
    expect(extractJson("مفيش حاجة هنا")).toBeNull();
  });

  it("يرجّع null لو الـ JSON بايظ", () => {
    expect(extractJson("{\"cards\": [")).toBeNull();
  });
});

describe("study-deck — parseDeck flashcards", () => {
  it("يحلل بطاقات صحيحة", () => {
    const deck = parseDeck("flashcards", '{"cards":[{"q":"س?","a":"ج"}]}');
    expect(deck).toEqual({ kind: "flashcards", cards: [{ q: "س?", a: "ج" }] });
  });

  it("بيقبل أسماء الحقول البديلة front/back", () => {
    const deck = parseDeck("flashcards", '{"cards":[{"front":"س","back":"ج"}]}');
    expect(deck).toEqual({ kind: "flashcards", cards: [{ q: "س", a: "ج" }] });
  });

  it("بيهمل البطاقات الناقصة", () => {
    const deck = parseDeck(
      "flashcards",
      '{"cards":[{"q":"س","a":"ج"},{"q":"","a":"فاضي"},{"a":"مفيش سؤال"}]}',
    );
    expect(deck).toEqual({ kind: "flashcards", cards: [{ q: "س", a: "ج" }] });
  });

  it("يرجّع null لو مفيش بطاقات", () => {
    expect(parseDeck("flashcards", '{"cards":[]}')).toBeNull();
    expect(parseDeck("flashcards", "ولا حاجة")).toBeNull();
  });
});

describe("study-deck — parseDeck mcq", () => {
  const valid = '{"questions":[{"q":"س","options":["أ","ب","ج","د"],"answer":1}]}';

  it("يحلل سؤال صحيح", () => {
    expect(parseDeck("mcq", valid)).toEqual({
      kind: "mcq",
      questions: [{ q: "س", options: ["أ", "ب", "ج", "د"], answer: 1 }],
    });
  });

  it("يرفض فهرس إجابة خارج النطاق", () => {
    const deck = parseDeck(
      "mcq",
      '{"questions":[{"q":"س","options":["أ","ب"],"answer":5}]}',
    );
    expect(deck).toBeNull();
  });

  it("يرفض سؤال أقل من خيارين", () => {
    const deck = parseDeck(
      "mcq",
      '{"questions":[{"q":"س","options":["أ"],"answer":0}]}',
    );
    expect(deck).toBeNull();
  });
});
