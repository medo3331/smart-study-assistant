// lib/engagement/__tests__/client-events.test.ts
//
// P1-B2 — اختبارات مُبلِّغ الأحداث من العميل.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reportClientEngagementEvent } from "@/lib/engagement/client-events";
import { ENGAGEMENT_EVENT_TYPES } from "@/lib/engagement/event-contract";

const originalFetch = globalThis.fetch;

// المتقرّر هنا بيحاكي المتصفح: المُبلِّغ بيرفض يشتغل في بيئة server (SSR)
// لأن fetch في المتصفح بس هو اللي عايزينه.
function stubBrowser() {
  (globalThis as { window?: unknown }).window = globalThis;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

beforeEach(() => {
  stubBrowser();
});

function mockFetch(ok = true) {
  const spy = vi.fn(async () => ({
    ok,
    json: async () => ({ ok }),
  })) as unknown as typeof fetch;
  globalThis.fetch = spy;
  return spy;
}

describe("reportClientEngagementEvent", () => {
  it("refuses server-only event types", async () => {
    const spy = mockFetch();
    const result = await reportClientEngagementEvent(
      ENGAGEMENT_EVENT_TYPES.EXAM_COMPLETED,
      "session-1",
    );
    expect(result).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("posts client-reported events to the events endpoint", async () => {
    const spy = mockFetch();
    const result = await reportClientEngagementEvent(
      ENGAGEMENT_EVENT_TYPES.NOTES_SAVED,
      "notebook-1",
      { page_count: 1 },
    );
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = (spy as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(url).toBe("/api/engagement/events");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body) as { type: string; sourceId: string };
    expect(body.type).toBe(ENGAGEMENT_EVENT_TYPES.NOTES_SAVED);
    expect(body.sourceId).toBe("notebook-1");
  });

  it("rejects empty or over-long source ids", async () => {
    const spy = mockFetch();
    expect(await reportClientEngagementEvent(ENGAGEMENT_EVENT_TYPES.NOTES_SAVED, "  ")).toBe(false);
    expect(
      await reportClientEngagementEvent(ENGAGEMENT_EVENT_TYPES.NOTES_SAVED, "x".repeat(201)),
    ).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("swallows network failures (best-effort)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const result = await reportClientEngagementEvent(
      ENGAGEMENT_EVENT_TYPES.NOTES_SAVED,
      "notebook-1",
    );
    expect(result).toBe(false);
  });

  it("returns false when the gateway rejects the request", async () => {
    mockFetch(false);
    const result = await reportClientEngagementEvent(
      ENGAGEMENT_EVENT_TYPES.NOTES_SAVED,
      "notebook-1",
    );
    expect(result).toBe(false);
  });
});
