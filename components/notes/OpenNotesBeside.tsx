"use client";

import React from "react";

/**
 * Opens the notebook in a side window next to the lesson.
 *
 * The browser can't tile two tabs of the same window, so the notebook opens
 * in its own popup sized to one half of the screen. The student snaps the
 * lesson to the other half and studies and writes side by side.
 */

export const BESIDE_WINDOW_NAME = "smart-notes-beside";

export default function OpenNotesBeside({
  label = "📝 نوت جانبية",
  notebookId,
  className,
  title = "افتح دفتر الملاحظات في نافذة جانبية بجانب الدرس",
}: {
  label?: string;
  notebookId?: string | null;
  className?: string;
  title?: string;
}) {
  const openBeside = () => {
    const url = notebookId ? `/notes/${notebookId}` : "/notes";
    const width = Math.max(420, Math.round(window.screen.availWidth / 2) - 8);
    const height = Math.max(360, window.screen.availHeight - 60);
    window.open(url, BESIDE_WINDOW_NAME, `popup=yes,width=${width},height=${height},left=0,top=0`);
  };

  return (
    <button
      type="button"
      onClick={openBeside}
      className={className}
      title={title}
    >
      {label}
    </button>
  );
}
