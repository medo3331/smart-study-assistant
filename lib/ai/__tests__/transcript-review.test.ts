import { describe, it, expect } from "vitest";
import { buildReviewedText, termIdFromSuspected } from "@/lib/ai/transcript-review";

const transcript = {
  text: "hello world foo bar baz",
  segments: [
    { text: "hello world", words: [
      { text: "hello", start: 0.0, end: 0.5 },
      { text: "world", start: 0.5, end: 1.0 },
    ]},
    { text: "foo bar baz", words: [
      { text: "foo", start: 1.0, end: 1.5 },
      { text: "bar", start: 1.5, end: 2.0 },
      { text: "baz", start: 2.0, end: 2.5 },
    ]},
  ],
};

const suspected = [
  { term: "world", suggested_correction: "earth", reason: "x", start: 0.5, end: 1.0, segment_index: 0, word_index: 1 },
  { term: "bar", suggested_correction: "baz2", reason: "x", start: 1.5, end: 2.0, segment_index: 1, word_index: 1 },
];

describe("transcript-review buildReviewedText", () => {
  it("accept applies suggested correction", () => {
    const d = [{ termId: termIdFromSuspected(suspected[0]), action: "accept" as const, decidedAt: new Date().toISOString() }];
    expect(buildReviewedText(transcript, suspected, d)).toBe("hello earth foo bar baz");
  });
  it("reject keeps original", () => {
    const d = [{ termId: termIdFromSuspected(suspected[0]), action: "reject" as const, decidedAt: new Date().toISOString() }];
    expect(buildReviewedText(transcript, suspected, d)).toBe("hello world foo bar baz");
  });
  it("manual_edit uses finalValue", () => {
    const d = [{ termId: termIdFromSuspected(suspected[0]), action: "manual_edit" as const, finalValue: "planet", decidedAt: new Date().toISOString() }];
    expect(buildReviewedText(transcript, suspected, d)).toBe("hello planet foo bar baz");
  });
  it("repeated word targets only the right position", () => {
    const t2 = { text: "cat cat", segments: [{ text: "cat cat", words: [{ text: "cat", start: 0, end: 0.5 }, { text: "cat", start: 0.5, end: 1 }] }] };
    const s2 = [{ term: "cat", suggested_correction: "dog", reason: "x", start: 0.5, end: 1, segment_index: 0, word_index: 1 }];
    const d = [{ termId: termIdFromSuspected(s2[0]), action: "accept" as const, decidedAt: new Date().toISOString() }];
    expect(buildReviewedText(t2, s2, d)).toBe("cat dog");
  });
  it("adjacent corrections", () => {
    const d = suspected.map((t) => ({ termId: termIdFromSuspected(t), action: "accept" as const, decidedAt: new Date().toISOString() }));
    expect(buildReviewedText(transcript, suspected, d)).toBe("hello earth foo baz2 baz");
  });
  it("missing position returns null", () => {
    const d = [{ termId: "9:9:999.000", action: "accept" as const, decidedAt: new Date().toISOString() }];
    expect(buildReviewedText(transcript, suspected, d)).toBeNull();
  });
  it("duplicate termId returns null", () => {
    const tid = termIdFromSuspected(suspected[0]);
    const d = [
      { termId: tid, action: "accept" as const, decidedAt: new Date().toISOString() },
      { termId: tid, action: "accept" as const, decidedAt: new Date().toISOString() },
    ];
    expect(buildReviewedText(transcript, suspected, d)).toBeNull();
  });
  it("conflicting actions returns null", () => {
    const tid = termIdFromSuspected(suspected[0]);
    const d = [
      { termId: tid, action: "accept" as const, decidedAt: new Date().toISOString() },
      { termId: tid, action: "reject" as const, decidedAt: new Date().toISOString() },
    ];
    // duplicate termId already nulls; build a different position conflict via two decisions same pos different termIds impossible; rely on duplicate check
    expect(buildReviewedText(transcript, suspected, d)).toBeNull();
  });
  it("does not mutate transcript_text/transcript_data", () => {
    const before = JSON.stringify(transcript);
    const d = [{ termId: termIdFromSuspected(suspected[0]), action: "accept" as const, decidedAt: new Date().toISOString() }];
    buildReviewedText(transcript, suspected, d);
    expect(JSON.stringify(transcript)).toBe(before);
  });
  it("no segments returns null", () => {
    const d = [{ termId: termIdFromSuspected(suspected[0]), action: "accept" as const, decidedAt: new Date().toISOString() }];
    expect(buildReviewedText({ text: "hi", segments: [] }, suspected, d)).toBeNull();
  });
});