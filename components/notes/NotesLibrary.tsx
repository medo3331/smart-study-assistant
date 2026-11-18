"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pageContentStrokes } from "@/lib/notes/content";
import type { NoteRepository } from "@/lib/notes/repository";
import type { StorageNotebook } from "@/lib/notes/types";
import {
  ERROR_HINTS,
  newNotesId,
  relativeTime,
  useNoteRepository,
} from "@/hooks/useNoteRepository";
import { NotesChip, NotesHeader } from "@/components/notes/NotesHeader";
import NotesGuide from "@/components/notes/NotesGuide";

/**
 * Notebook library — the `/notes` landing screen.
 *
 * Everything goes through `NoteRepository`, so the owner namespace and the
 * single-writer lease are enforced by the storage layer rather than here.
 * Deleting a notebook uses the repository cascade, which removes every page
 * inside one IndexedDB transaction.
 */
export default function NotesLibrary() {
  const router = useRouter();
  const { boot, lease } = useNoteRepository();
  const repo: NoteRepository | null = boot.phase === "ready" ? boot.repo : null;
  const canWrite = lease === "ready";

  const [notebooks, setNotebooks] = useState<StorageNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Latch the guide's initial open state once the first load resolves.
  // Passing a freshly computed `open` on every render would re-open the panel
  // while the student types in the name field, because `open` is a controlled
  // attribute on <details>.
  const initialGuideOpen = React.useRef<boolean | null>(null);

  const load = useCallback(async (target: NoteRepository) => {
    try {
      const all = await target.listNotebooks();
      const sorted = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setNotebooks(sorted);
      setError(null);
      return sorted;
    } catch (e) {
      setError("تعذّر تحميل الدفاتر. جرّب إعادة تحميل الصفحة.");
      console.error("[notes] listNotebooks failed", e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!repo) return;
    void load(repo).then((list) => {
      // Latch once, from the first resolved load — never from a stale render.
      if (initialGuideOpen.current === null && list !== null) {
        initialGuideOpen.current = list.length === 0;
      }
    });
  }, [repo, load]);

  const createNotebook = async () => {
    if (!repo || !canWrite || creating) return;
    const title = newTitle.trim() || "دفتر جديد";
    setCreating(true);
    try {
      const now = new Date().toISOString();
      const notebookId = newNotesId();
      const pageId = newNotesId();

      // The page record must exist before the notebook references it,
      // otherwise the editor opens with a dangling pageId.
      await repo.savePage({
        id: pageId,
        ownerId: repo.ownerId,
        notebookId,
        template: "lined",
        persistedSnapshot: pageContentStrokes("lined", []),
        localJournal: [],
        quarantined: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      });
      await repo.saveNotebook({
        id: notebookId,
        ownerId: repo.ownerId,
        title,
        pageIds: [pageId],
        currentPageId: pageId,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      });

      setNewTitle("");
      router.push(`/notes/${notebookId}`);
    } catch (e) {
      console.error("[notes] create notebook failed", e);
      setError("تعذّر إنشاء الدفتر.");
      setCreating(false);
    }
  };

  const renameNotebook = async (notebook: StorageNotebook) => {
    if (!repo || !canWrite) return;
    const title = renameValue.trim();
    if (!title || title === notebook.title) {
      setRenamingId(null);
      return;
    }
    setBusyId(notebook.id);
    try {
      await repo.saveNotebook({
        ...notebook,
        title,
        revision: notebook.revision + 1,
        updatedAt: new Date().toISOString(),
      });
      setRenamingId(null);
      await load(repo);
    } catch (e) {
      console.error("[notes] rename failed", e);
      setError("تعذّرت إعادة التسمية.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteNotebook = async (notebook: StorageNotebook) => {
    if (!repo || !canWrite) return;
    setBusyId(notebook.id);
    try {
      // Cascade delete: notebook + every page, in one transaction.
      await repo.deleteNotebook(notebook.id);
      await load(repo);
    } catch (e) {
      console.error("[notes] delete failed", e);
      setError("تعذّر حذف الدفتر.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="notes-page">
      <NotesHeader
        title="دفاتري"
        subtitle="دفاتر بخط اليد، متعددة الصفحات، محفوظة على جهازك — بدون رفع لأي سيرفر."
        chips={
          <>
            <NotesChip tone={canWrite ? "ok" : "warn"} title="حالة قفل الكتابة">
              {canWrite ? "قابل للكتابة" : "قراءة فقط"}
            </NotesChip>
            {boot.phase === "ready" ? (
              <NotesChip title="هوية المالك">{boot.repo.ownerId}</NotesChip>
            ) : null}
          </>
        }
      />

      {lease === "read-only" && boot.phase === "ready" ? (
        <p className="notes-alert" data-tone="warn">
          تبويب تاني بيملك الكتابة على نفس الدفاتر. العرض متاح، والإنشاء والتعديل مقفولين مؤقتاً.
        </p>
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

      {error ? (
        <p className="notes-alert" data-tone="error">
          {error}
        </p>
      ) : null}

      <NotesGuide
        variant="library"
        defaultOpen={initialGuideOpen.current ?? false}
      />

      {boot.phase === "ready" ? (
        <div className="notes-toolbar">
          <input
            type="text"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createNotebook();
            }}
            placeholder="اسم الدفتر الجديد"
            aria-label="اسم الدفتر الجديد"
            disabled={!canWrite || creating}
            className="notes-input"
          />
          <button
            type="button"
            onClick={() => void createNotebook()}
            disabled={!canWrite || creating}
            data-tone="primary"
            className="notes-btn"
          >
            {creating ? "بيتعمل…" : "＋ دفتر جديد"}
          </button>
        </div>
      ) : null}

      {loading && boot.phase === "ready" ? (
        <p className="notes-hint">بنحمّل الدفاتر…</p>
      ) : null}

      {!loading && boot.phase === "ready" && notebooks.length === 0 ? (
        <div className="notes-empty">
          <strong>مفيش دفاتر لسه</strong>
          اكتب اسم فوق واضغط «دفتر جديد» عشان تبدأ أول صفحة.
        </div>
      ) : null}

      <div className="notes-grid">
        {notebooks.map((notebook) => (
          <article
            key={notebook.id}
            className="notes-card"
            data-busy={busyId === notebook.id}
          >
            {renamingId === notebook.id ? (
              <div className="notes-group">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void renameNotebook(notebook);
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                  aria-label="اسم الدفتر"
                  autoFocus
                  className="notes-input"
                />
                <button
                  type="button"
                  onClick={() => void renameNotebook(notebook)}
                  data-tone="primary"
                  className="notes-btn notes-btn-sm"
                >
                  تم
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => router.push(`/notes/${notebook.id}`)}
                className="notes-card-title"
              >
                {notebook.title}
              </button>
            )}

            <p className="notes-card-meta">
              {notebook.pageIds.length} صفحة · آخر تعديل {relativeTime(notebook.updatedAt)}
            </p>

            <div className="notes-card-actions">
              <button
                type="button"
                onClick={() => router.push(`/notes/${notebook.id}`)}
                className="notes-btn notes-btn-sm"
              >
                فتح
              </button>
              <a
                href={`/notes/${notebook.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="افتح الدفتر في تبويب جديد (البيانات من نفس الجهاز)"
                className="notes-btn notes-btn-sm"
              >
                ↗ تبويب
              </a>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => {
                  setRenamingId(notebook.id);
                  setRenameValue(notebook.title);
                }}
                className="notes-btn notes-btn-sm"
              >
                إعادة تسمية
              </button>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => {
                  if (window.confirm(`حذف «${notebook.title}» وكل صفحاته؟`)) {
                    void deleteNotebook(notebook);
                  }
                }}
                data-tone="danger"
                className="notes-btn notes-btn-sm"
              >
                حذف
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
