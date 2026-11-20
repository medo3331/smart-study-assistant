"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pageContentStrokes } from "@/lib/notes/content";
import {
  buildSearchIndex,
  searchIndex,
  type GlobalSearchResult,
} from "@/lib/notes/global-search";
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
import { reportClientEngagementEvent } from "@/lib/engagement/client-events";
import { ENGAGEMENT_EVENT_TYPES } from "@/lib/engagement/event-contract";

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
  // 🔍 بحث شامل عبر كل الدفاتر.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Latch the guide's initial open state once the first load resolves.  // Passing a freshly computed `open` on every render would re-open the panel
  // while the student types in the name field, because `open` is a controlled
  // attribute on <details>.
  const initialGuideOpen = React.useRef<boolean | null>(null);

  // 🔍 مؤشر البحث — بيتبنى مرة، وبيتحدّث مع كل تحميل للدفاتر.
  const searchIndexRef = React.useRef<
    Awaited<ReturnType<typeof buildSearchIndex>> | null
  >(null);

  useEffect(() => {
    if (boot.phase !== "ready") return;
    let cancelled = false;
    void buildSearchIndex(boot.repo)
      .then((index) => {
        if (!cancelled) searchIndexRef.current = index;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [boot, notebooks]);

  const runGlobalSearch = useCallback(async (raw: string) => {
    const query = raw.trim();
    if (query.length < 2 || !searchIndexRef.current) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      // نبني من جديد لو الدفاتر اتغيرت بعد آخر بناء.
      setSearchResults(searchIndex(searchIndexRef.current, query));
    } finally {
      setSearching(false);
    }
  }, []);

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

  // 📥 ?importFile=<id> — زر «للنوته» في «ملفاتي»: بيفتح آخر دفتر
  // (أو بيعمل واحد) مع تمرير البارميتر للمحرر، لأن معالجة الاستيراد
  // عايشة جوة محرر الدفتر مش في المكتبة.
  const handledImportRedirectRef = React.useRef(false);
  useEffect(() => {
    if (handledImportRedirectRef.current) return;
    if (!repo || boot.phase !== "ready") return;
    if (typeof window === "undefined") return;
    const fileId = new URLSearchParams(window.location.search).get("importFile");
    if (!fileId) return;
    handledImportRedirectRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const all = await repo.listNotebooks();
        const sorted = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (cancelled) return;
        const target = sorted[0];
        if (target) {
          router.replace(`/notes/${target.id}?importFile=${encodeURIComponent(fileId)}`);
        } else {
          // مفيش دفاتر — بيعمل دفتر جديد فوراً مع الاستيراد.
          const now = new Date().toISOString();
          const notebookId = newNotesId();
          const pageId = newNotesId();
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
            title: "دفتر جديد",
            pageIds: [pageId],
            currentPageId: pageId,
            revision: 1,
            createdAt: now,
            updatedAt: now,
          });
          if (cancelled) return;
          router.replace(`/notes/${notebookId}?importFile=${encodeURIComponent(fileId)}`);
        }
      } catch (e) {
        console.error("[notes] import redirect failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, boot.phase, router]);

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
      // P1-B2.2 — إنشاء نوتة وتفظيها فعل حقيقي (مش مجرد فتح) ⇒ تجربة
      //   حقيقية للميزة. التصنيف client_reported في الـregistry.
      void reportClientEngagementEvent(
        ENGAGEMENT_EVENT_TYPES.NOTES_SAVED,
        notebookId,
        { page_count: 1 },
      );
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

      {boot.phase === "ready" && notebooks.length > 0 ? (
        <div className="notes-toolbar">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              void runGlobalSearch(event.target.value);
            }}
            placeholder="🔍 ابحث في كل الدفاتر — أسماء الصفحات والنصوص…"
            aria-label="بحث في كل الدفاتر"
            className="notes-input"
            style={{ flex: 1 }}
          />
        </div>
      ) : null}

      {searchResults !== null ? (
        <div className="notes-search-results">
          {searching ? <p className="notes-hint">بنبحث…</p> : null}
          {!searching && searchResults.length === 0 ? (
            <p className="notes-hint">مفيش نتايج لـ «{searchQuery}».</p>
          ) : null}
          {searchResults.map((result) => (
            <div key={result.notebookId} className="notes-card" style={{ width: "100%" }}>
              <strong>{result.notebookTitle}</strong>
              <span className="notes-hint"> — {result.hits.length} نتيجة</span>
              <ul style={{ margin: "8px 0 0", paddingRight: "18px" }}>
                {result.hits.map((hit) => (
                  <li key={`${hit.pageId}:${hit.kind}`} style={{ margin: "4px 0" }}>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/notes/${result.notebookId}?page=${hit.pageId}`)
                      }
                      className="notes-btn"
                      style={{ padding: "2px 8px" }}
                    >
                      {hit.kind === "name" ? "🏷️" : "✍️"} صفحة {hit.pageIndex + 1}
                    </button>{" "}
                    <span className="notes-hint">{hit.snippet}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
