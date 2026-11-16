// "use client";

import React, { useState, useEffect } from "react";
import CanvasInkPrototype from "@/components/notes/CanvasInkPrototype";
import {
  IndexedDBNoteStorage,
  type StorageNotebook,
  type StoragePage,
} from "@/lib/notes/storage";
import {
  pageContent,
  pageContentStrokes,
  notebookContent,
  canonicalJson,
} from "@/lib/notes/content";
import type { NoteStorage } from "@/lib/notes/types";

export default function NotesPrototypePage() {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const [storage, setStorage] = useState<NoteStorage | null>(null);

  useEffect(() => {
    // Initialize IndexedDB storage for this owner namespace once.
    const s = new IndexedDBNoteStorage("anon:test");
    s.open().then(() => {
      setStorage(s);
      setNotebookId("anon:test");
    });
  }, []);

  // -------------------------------------------------------------------------
  // Persistence helpers – delegate to the shared storage instance
  // -------------------------------------------------------------------------

  async function saveNotebook(notebook: StorageNotebook): Promise<void> {
    if (!storage) return;
    try {
      setSaveStatus("saving");
      const result = await storage.putNotebook(notebook);
      if (result.outcome === "applied" || result.outcome === "unchanged") {
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
      }
    } catch (e) {
      setSaveStatus("error");
    }
  }

  async function saveCurrentPage(
    page: StoragePage,
    strokes: Stroke[],
    template: "lined" | "blank"
  ): Promise<void> {
    if (!storage) return;
    try {
      setSaveStatus("saving");
      const pageUpd = {
        ...page,
        persistedSnapshot: pageContentStrokes(template, strokes),
        revision: (page.revision || 0) + 1,
      };
      const result = await storage.putPage(pageUpd as StoragePage);
      if (result.outcome === "applied" || result.outcome === "unchanged") {
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
      }
    } catch (e) {
      setSaveStatus("error");
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-4 text-2xl font-bold">
        Smart Notes — Phase 1C-2 Notebook
      </h1>

      <div className="mb-4">
        {/* Save status */}
        <div className="flex items-baseline gap-2">
          <span className="rounded bg-gray-100 px-2 py-1 text-xs">
            {saveStatus === "saving" && "Saving"}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && "Error"}
            {saveStatus === "idle" && "Idle"}
          </span>
        </div>
      </div>

      <CanvasInkPrototype
        saveStatusRef={setSaveStatus}
        notebookId={notebookId}
        storage={storage}
      />
    </div>
  );
}