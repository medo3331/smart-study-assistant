"use client";

import { useState } from "react";

export function LectureTranscriptEditor({
  lectureId,
  initialText,
}: {
  lectureId: string;
  initialText: string;
}) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/lectures/${encodeURIComponent(lectureId)}/transcript`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        setStatus(payload?.error?.message ?? "مقدرناش نحفظ النص.");
        return;
      }
      setStatus("تم حفظ النص المصحح ✓");
    } catch {
      setStatus("مقدرناش نحفظ النص.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full min-h-[12rem] rounded-xl border border-[var(--rule)] bg-[var(--app-bg)] p-3 text-sm leading-relaxed text-[var(--text)]"
        dir="rtl"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--rule)] bg-[var(--card-secondary)] px-3 text-sm font-semibold text-[var(--text)] disabled:opacity-50"
        >
          {saving ? "بيحفظ…" : "حفظ النص المصحح"}
        </button>
        {status && <span className="text-xs text-[var(--muted)]">{status}</span>}
      </div>
    </div>
  );
}