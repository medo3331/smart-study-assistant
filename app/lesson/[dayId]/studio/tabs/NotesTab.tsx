"use client";

import { useLessonStudio, useNotebook } from "../LessonStudioProvider";
import AddToNotebookMenu from "../tools/AddToNotebookMenu";

/* ==========================================================================
   NotesTab — بوابة النوتة المرتبطة بالدرس (§1.3): يفتح الـ NotebookPanel
   (الـ iframe الوحيد) + آخر إضافة + قائمة «أضف للنوتة».
   ========================================================================== */

export default function NotesTab() {
  const { lesson } = useLessonStudio();
  const { notebook, openNotebook, undoLastAppend } = useNotebook();

  return (
    <div className="space-y-5" dir="rtl">
      <div className="sheet-card p-5 sm:p-6 space-y-4">
        <div>
          <p className="eyebrow eyebrow-flush mb-1.5">النوتة</p>
          <h2 className="h3">نوتة مرتبطة بدرس «{lesson.topic}»</h2>
        </div>

        <p className="text-xs text-ink-soft leading-relaxed">
          افتح نوتتك جوه الصفحة، وأضف أي جزء من الشرح أو الفيديو عليها — كل إضافة بتتعمل
          بالمعاينة الأول، وممكن تتراجع.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => openNotebook()} className="btn btn-marker text-xs px-4 py-2.5">
            📝 افتح النوتة
          </button>
          <AddToNotebookMenu
            buildDraft={() => ({
              title: lesson.topic,
              body: lesson.description,
              source: "وصف الدرس",
            })}
          />
          <button
            onClick={undoLastAppend}
            disabled={!notebook.lastAppended}
            className="btn btn-quiet text-xs px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
            title="رجّع آخر إضافة اتضافت للنوتة"
          >
            ↩️ تراجع عن آخر إضافة
          </button>
        </div>

        {notebook.lastAppended && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-secondary)] p-3 space-y-1">
            <span className="tag tag-quiet">آخر إضافة للدرس</span>
            <p className="text-[12px] font-bold text-ink">{notebook.lastAppended.title}</p>
            <p className="text-[11px] text-ink-soft line-clamp-3 whitespace-pre-wrap">{notebook.lastAppended.body}</p>
          </div>
        )}
      </div>
    </div>
  );
}
