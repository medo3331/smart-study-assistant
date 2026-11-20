"use client";

import React from "react";
import {
  createNoteRepository,
  classifyNotesError,
  NotesError,
  type NoteRepository,
  type NoteRepositoryStatus,
} from "@/lib/notes";
import { reportClientEngagementEvent } from "@/lib/engagement/client-events";
import { ENGAGEMENT_EVENT_TYPES } from "@/lib/engagement/event-contract";

/**
 * Shared bootstrap for every notes screen.
 *
 * `createNoteRepository()` is the only supported entry point: it derives the
 * owner from the identity source, takes the single-writer lease, and scopes
 * every operation to that owner. This hook owns its lifetime, so the lease is
 * always released (after in-flight writes drain) when the screen unmounts.
 */

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type RepoBoot =
  | { phase: "loading" }
  | { phase: "ready"; repo: NoteRepository }
  | { phase: "failed"; code: string; detail: string };

/** Human hint per error kind. The machine-readable code stays the contract. */
export const ERROR_HINTS: Record<string, string> = {
  "identity-unavailable":
    "التخزين المحلي (IndexedDB) مش متاح — جرّب وضع عادي بدل التصفح الخاص.",
  "lock-unavailable": "المتصفح لا يدعم Web Locks، فمافيش كاتب واحد آمن.",
  "owner-mismatch": "البيانات دي تخص مالك تاني — اتعمل رفض لحماية العزل.",
  quota: "مساحة التخزين اتملّت. امسح دفاتر قديمة.",
  "invalid-state": "قاعدة البيانات في حالة غير متوقعة. أعد تحميل الصفحة.",
  blocked: "قاعدة البيانات مقفولة من تبويب قديم. اقفل التبويبات التانية.",
  "revision-conflict": "حصل تعارض في الإصدار — أعد تحميل الصفحة.",
  unknown: "خطأ غير متوقع في طبقة التخزين.",
};

export function useNoteRepository(): {
  boot: RepoBoot;
  lease: NoteRepositoryStatus;
} {
  const [boot, setBoot] = React.useState<RepoBoot>({ phase: "loading" });
  const [lease, setLease] = React.useState<NoteRepositoryStatus>("read-only");

  React.useEffect(() => {
    let cancelled = false;
    let repo: NoteRepository | null = null;

    (async () => {
      try {
        repo = await createNoteRepository();
        if (cancelled) {
          await repo.dispose().catch(() => undefined);
          return;
        }
        instrumentNoteSaves(repo);
        setLease(repo.status);
        setBoot({ phase: "ready", repo });

        // Another tab may hold the write lease. `whenWriter()` settles when
        // this tab is promoted, so the UI leaves read-only on its own.
        repo
          .whenWriter()
          .then(() => {
            if (!cancelled) setLease("ready");
          })
          .catch(() => undefined);
      } catch (error) {
        if (cancelled) return;
        const code = classifyNotesError(error);
        const detail =
          error instanceof NotesError
            ? error.message
            : String((error as Error)?.message ?? error);
        setBoot({ phase: "failed", code, detail });
      }
    })();

    return () => {
      cancelled = true;
      void repo?.dispose().catch(() => undefined);
    };
  }, []);

  return { boot, lease };
}

/** A UUID that is safe in every browser we support. */
export function newNotesId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 📊 قياس usage لـSmart Notes (P1-B2) — حفظ نوتة حقيقي.
 *
 * ⚠️ التصنيف: `client_reported` ⇒ **مش إثبات مكافأة**، بس بيغذّي
 *    Feature Discovery (هل الطالب جرّب الميزة؟) وقياس الاستخدام.
 *
 * ⚠️ ليش الـdebounce مهم: الحفظ بيعمل autosave كل شوية ⇒ من غير throttle
 *    هنملي البوابة بأحداث مكررة (وهي rate-limited أصلًا).
 *
 * ⚠️ كل حاجة best-effort: فشل الإرسال مابيرميش الحفظ ولا بيأثر على UX.
 */
function instrumentNoteSaves(repo: NoteRepository): void {
  const original = repo.savePage.bind(repo);
  let lastSentAt = 0;
  const THROTTLE_MS = 30_000;

  repo.savePage = async (page: Parameters<NoteRepository["savePage"]>[0]) => {
    await original(page);
    const now = Date.now();
    if (now - lastSentAt < THROTTLE_MS) return;
    lastSentAt = now;
    void reportClientEngagementEvent(
      ENGAGEMENT_EVENT_TYPES.NOTES_SAVED,
      page.notebookId,
      { page_count: 1 },
    );
  };
}

/** Relative age, because a raw ISO string tells a student nothing. */
export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "الآن";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return new Date(then).toLocaleDateString("ar-EG");
}
