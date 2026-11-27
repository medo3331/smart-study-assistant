"use client";

/* ======================================================================
   📄 DocumentWorkspace — مساحة الدرس للمستندات (المرحلة 24ج)

   نفس فكرة LessonWorkspace لكن لمادة من المكتبة (materials) بنصها
   المستخرج بدل تفريغ تسجيل صوتي: مفيش مشغّل ولا تفريغ بتوقيت —
   الشرح (الملخّص) + Magic (محادثة على نص المستند) + المصادر (النص الكامل)
   + Notebook. نفس التاب العلوية ونفس شريط الموبايل السفلي (بدون زر تسجيل).
   ====================================================================== */

import { Fragment, useState } from "react";
import { MessageCircle, NotebookPen } from "lucide-react";

import LectureChat from "@/components/lectures/LectureChat";
import { LectureNote } from "@/components/lectures/LectureNote";
import {
  LectureSection,
  LectureWorkspace,
} from "@/components/lectures/LectureWorkspace";
import NotesSplitToggle from "@/components/notes/NotesSplitPanel";
import { DataNotice } from "@/app/dashboard/components/PageShell";

type DocumentTab = "explain" | "magic" | "sources" | "notebook";

const TABS: { id: DocumentTab; label: string; emoji: string; primary: boolean }[] = [
  { id: "explain", label: "الشرح", emoji: "🧠", primary: true },
  { id: "magic", label: "Magic", emoji: "✨", primary: true },
  { id: "sources", label: "المصادر", emoji: "📜", primary: true },
  { id: "notebook", label: "Notebook", emoji: "🗒️", primary: false },
];

export function DocumentWorkspace({
  materialId,
  title,
  summary,
  note,
  content,
}: {
  materialId: string;
  title: string;
  summary: string | null;
  note: string | null;
  content: string;
}) {
  const [tab, setTab] = useState<DocumentTab>("explain");
  const hasContent = Boolean(content.trim());

  return (
    <LectureWorkspace defaultOpen={["summary", "explanation", "transcript"]}>
    <div>
      <nav aria-label="أقسام الدرس">
        <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-1.5">
          {TABS.map((t, i) => (
            <Fragment key={t.id}>
              {i === 3 && <span aria-hidden className="my-1 w-px shrink-0 bg-[var(--rule)]" />}
              <button
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                  tab === t.id
                    ? "bg-[var(--accent)] text-white"
                    : t.primary
                      ? "text-ink hover:bg-black/5 dark:hover:bg-white/10"
                      : "text-ink-soft hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
                }`}
              >
                <span aria-hidden>{t.emoji}</span>
                {t.label}
              </button>
            </Fragment>
          ))}
        </div>
      </nav>

      <div className="mt-4 space-y-4">
        {/* 🧠 الشرح — ملخّص المستند + ملاحظاته */}
        {tab === "explain" && (
          <div className="space-y-3">
            {summary?.trim() ? (
              <LectureSection
                id="summary"
                icon="📝"
                title="ملخّص المستند"
                lede="مراجعة سريعة لأهم ما ورد في الملف."
              >
                <LectureNote kind="summary" content={summary} />
              </LectureSection>
            ) : (
              <DataNotice
                message={`«${title}» مالوش ملخّص محفوظ لسه — اسأل Magic عن أي جزء منه وهو هيقرأ النص الكامل.`}
              />
            )}
            {note?.trim() && (
              <LectureSection
                id="explanation"
                icon="🗒️"
                title="ملاحظات على الملف"
                lede="الملاحظة المحفوظة مع المادة في مكتبتك."
              >
                <LectureNote kind="explanation" content={note} />
              </LectureSection>
            )}
          </div>
        )}

        {/* ✨ Magic — محادثة على نص المستند */}
        {tab === "magic" && (
          <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-4 shadow-sm">
            {hasContent ? (
              <LectureChat lectureId={materialId} contextText={content} />
            ) : (
              <DataNotice message="مفيش نص مستخرج للملف ده بعد — ارفعه تاني أو اسأل عنه بالمحتوى اللي فاكره." />
            )}
          </div>
        )}

        {/* 📜 المصادر — النص الكامل */}
        {tab === "sources" && (
          <LectureSection
            id="transcript"
            icon="📜"
            title="نص المستند"
            lede="النص المستخرج كامل — المصدر اللي Magic بيقرأ منه."
          >
            {hasContent ? (
              <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-[var(--rule)] bg-[var(--card-secondary)] p-4">
                <p className="text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap">{content}</p>
              </div>
            ) : (
              <DataNotice message="مفيش نص محفوظ للملف ده." />
            )}
          </LectureSection>
        )}

        {/* 🗒️ Notebook */}
        {tab === "notebook" && (
          <div className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] p-5 shadow-sm">
            <h2 className="text-sm font-extrabold text-ink">🗒️ دفتر الملاحظات</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              افتح النوت الجانبية وذاكر جنب المستند — ملاحظاتك بتتحفظ لوحدها.
            </p>
            <div className="mt-3">
              <NotesSplitToggle className="btn btn-quiet px-3 py-2 text-xs" />
            </div>
          </div>
        )}
      </div>

      {/* 📱 شريط الإجراءات السفلي — الموبايل فقط */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--rule)] bg-[var(--card-primary)]/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-around gap-1 px-2 py-2">
          <button
            type="button"
            onClick={() => setTab("magic")}
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[11px] font-bold text-ink transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <MessageCircle size={17} aria-hidden />
            اسأل Magic
          </button>
          <button
            type="button"
            onClick={() => setTab("notebook")}
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[11px] font-bold text-ink transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <NotebookPen size={17} aria-hidden />
            ملاحظة
          </button>
        </div>
      </div>
    </div>
    </LectureWorkspace>
  );
}
