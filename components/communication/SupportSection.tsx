"use client";

import { Suspense } from "react";
import SupportInbox from "../support/SupportInbox";

/**
 * SupportSection — renders SupportInbox inside the Unified Communication Center
 * container.
 *
 * This component wraps SupportInbox so it can be embedded within /inbox.
 */
export default function SupportSection() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center p-8 text-center text-ink-soft">
        <div className="mb-3 h-10 w-10 animate-spin rounded-full border-2 border-marker border-t-transparent" />
        <p className="text-sm text-ink-soft">جارٍ تحميل مركز الدعم…</p>
      </div>
    }>
      <SupportInbox mode="student" />
    </Suspense>
  );
}
