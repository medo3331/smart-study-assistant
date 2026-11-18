"use client";

import React from "react";
import { useParams } from "next/navigation";
import NotebookEditor from "@/components/notes/NotebookEditor";
import { ERROR_HINTS, useNoteRepository } from "@/hooks/useNoteRepository";

/**
 * Notebook editor route.
 *
 * `useParams` (a Client Component hook) is used because the notebook lives in
 * IndexedDB — there is nothing to render on the server. The repository comes
 * from the shared hook, which also owns the write lease for the lifetime of
 * this screen.
 */
export default function NotebookEditorPage() {
  const params = useParams<{ notebookId: string }>();
  const notebookId =
    typeof params?.notebookId === "string" && params.notebookId.length > 0
      ? params.notebookId
      : null;

  const { boot, lease } = useNoteRepository();

  return (
    <div className="notes-page">
      {notebookId === null ? (
        <p className="notes-alert" data-tone="error">
          معرّف الدفتر غير صالح.
        </p>
      ) : null}

      {boot.phase === "loading" ? (
        <p className="notes-hint">بنجهّز التخزين المحلي…</p>
      ) : null}

      {boot.phase === "failed" ? (
        <div className="notes-alert" data-tone="error">
          <strong>{boot.code}</strong>
          <br />
          {ERROR_HINTS[boot.code] ?? ERROR_HINTS.unknown}
          <br />
          <code>{boot.detail}</code>
        </div>
      ) : null}

      {boot.phase === "ready" && notebookId !== null ? (
        <NotebookEditor
          repo={boot.repo}
          notebookId={notebookId}
          canWrite={lease === "ready"}
        />
      ) : null}
    </div>
  );
}
