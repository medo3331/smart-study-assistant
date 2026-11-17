"use client";

import React from "react";
import CanvasInkPrototype from "@/components/notes/CanvasInkPrototype";
import {
  IndexedDBNoteStorage,
  type StorageNotebook,
  type StoragePage,
} from "@/lib/notes/storage";
import { pageContentStrokes } from "@/lib/notes/content";

export default function NotesPrototypePage() {
  // Storage is initialized once and shared across page switches.
  // The notebookId is derived from the owner string so data persists across reloads.
  const [storage, setStorage] = React.useState<IndexedDBNoteStorage | null>(null);
  const [notebookId, setNotebookId] = React.useState<string | null>(null);
  const [saveStatus, setSaveStatus] = React.useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  React.useEffect(() => {
    const s = new IndexedDBNoteStorage("anon:test");
    s.open().then(() => {
      setStorage(s);
      setNotebookId("anon:test");
    });
  }, []);

  const saveStatusRef: React.Dispatch<
    React.SetStateAction<"idle" | "saving" | "saved" | "error">
  > = React.useCallback(setSaveStatus, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-4 text-2xl font-bold">
        Smart Notes — Phase 1C-2 Notebook
      </h1>

      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="rounded bg-gray-100 px-2 py-1 text-xs">
            {saveStatus}
          </span>
        </div>
      </div>

      <CanvasInkPrototype
        notebookId={notebookId}
        storage={storage}
        saveStatusRef={saveStatusRef}
      />
    </div>
  );
}