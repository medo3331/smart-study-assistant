"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, EmptyState, LoadingSheets, DataNotice } from "../components/PageShell";
import { useAuthUser, formatArabicDate, formatFileSize } from "../components/use-page-data";
import { setAiSeed, setNavIntent } from "../components/nav-config";
import {
  fetchMaterials,
  insertMaterial,
  updateMaterial,
  deleteMaterial,
  type Material,
} from "@/lib/pages-data";
import { prepareFileForUpload, isImageFile } from "@/lib/image-compress";

/* ==========================================================================
   مساحة العمل — مكتبة موادك

   الفكرة: أي ملف بتقراه (PDF، Word، صورة محاضرة، ملف نصي) بيترفع مرة واحدة،
   بيتحلّل بـ /api/analyze-file، ونصه بيتخزن. بعد كده هو مرجع دايم: تقرا
   منه، تكتب ملاحظاتك عليه، أو تسأل المساعد فيه من غير ما ترفعه تاني.

   ليه بنخزّن النص مش الملف؟ لأن النص هو اللي المساعد بيقراه أصلاً، وبكده
   مش محتاجين Storage bucket ولا سياسات تانية. والملف الأصلي عندك على جهازك.

   ⚠️ محتاج جدول materials — db/pages.sql.
   ========================================================================== */

/** نفس أنواع الملفات النصية اللي المحادثة بتقراها محلياً من غير سيرفر. */
const TEXT_FILE_TYPES = ["text/plain", "text/markdown", "text/csv", "application/json"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** أيقونة على حسب نوع الملف — للتعرّف السريع في القايمة. */
function fileIcon(type: string | null, title: string): string {
  const name = title.toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "📕";
  if (type?.startsWith("image/")) return "🖼️";
  if (/\.(docx?|odt)$/.test(name)) return "📘";
  if (/\.(csv|xlsx?)$/.test(name)) return "📊";
  if (/\.(js|ts|tsx|jsx|py|java|c|cpp|cs|go|rb|php|html|css|json)$/.test(name)) return "💻";
  return "📄";
}

export default function WorkspacePage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // المادة المفتوحة. null = عارض القايمة.
  const [openId, setOpenId] = useState<string | null>(null);

  // الرفع
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // مسوّدة الملاحظة للمادة المفتوحة، وحالة الحفظ
  const [noteDraft, setNoteDraft] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");

  // التلخيص بالمساعد
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [fileAnalysis, setFileAnalysis] = useState("");
  const [fileQuestion, setFileQuestion] = useState("");
  const [fileAction, setFileAction] = useState<"summarize" | "extract" | "analyze" | "question">("analyze");
  const [isGeminiAnalyzing, setIsGeminiAnalyzing] = useState(false);

  const openMaterial = materials.find((m) => m.id === openId) ?? null;

  /* ---- تحميل المكتبة ---- */
  useEffect(() => {
    if (session.status === "loading") return;

    if (session.status === "anonymous") {
      router.push("/dashboard");
      return;
    }
    if (session.status === "error") {
      setNotice(session.message);
                  setIsLoading(false);
      return;
    }

    (async () => {
      const { data, error } = await fetchMaterials(supabase, session.user.id);
      if (error) setNotice(error.message);
      else setMaterials(data);
      setIsLoading(false);
    })();
  }, [session, supabase, router]);

  /* ---- لما تفتح مادة، املا المسوّدة بملاحظتها ---- */
  useEffect(() => {
    setNoteDraft(openMaterial?.note ?? "");
      setNoteState("idle");
  }, [openId, openMaterial?.note]);

  /* ---- رفع ملف ---- */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || session.status !== "ready") return;

    // الصور بتتصغّر في المتصفح قبل الرفع، فسقفها هنا أعلى من سقف السيرفر
    const isImage = isImageFile(file);
    if (file.size > (isImage ? 20 * 1024 * 1024 : MAX_UPLOAD_BYTES)) {
      setNotice(
        isImage
          ? "الصورة كبيرة جداً. خد سكرين شوت للجزء اللي فيه الكلام بس."
          : "الملف كبير جداً. أقصى حجم ٨ ميجا."
      );
      return;
    }
    if (file.size === 0) {
      setNotice("الملف فاضي.");
      return;
    }

    setNotice(null);
    setIsUploading(true);

    try {
      const isTextType = TEXT_FILE_TYPES.includes(file.type) || /\.(txt|md|csv|json)$/i.test(file.name);
      let text = "";

      if (isTextType) {
        // نص عادي — المتصفح بيقراه لوحده، مفيش لزوم نتعب السيرفر
        setUploadStep("بيقرا الملف…");
        text = await file.text();
      } else {
        // PDF / Word / صورة — الاستخراج محتاج السيرفر
        setUploadStep(isImage ? "بيجهّز الصورة…" : "بيستخرج النص…");

        // ⚠️ لازم يعدّي من هنا: الصور بتتصغّر تحت سقف خدمة القراءة (١ ميجا)
        const prepared = await prepareFileForUpload(file);
        if (prepared.error) {
          setNotice(prepared.error);
          return;
        }

        setUploadStep("بيستخرج النص…");
        const formData = new FormData();
        formData.append("file", prepared.file);
        const res = await fetch("/api/analyze-file", { method: "POST", body: formData });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          setNotice(data?.error || "ما قدرناش نستخرج نص الملف ده. جرّب ملف تاني.");
          return;
        }
        text = data?.text || "";
      }

      if (!text.trim()) {
        setNotice("الملف ده مفيهوش نص نقدر نقراه. لو صورة، تأكد إن الكلام فيها واضح.");
        return;
      }

      setUploadStep("بيحفظ…");
      const { data: created, error } = await insertMaterial(supabase, session.user.id, {
        title: file.name,
        fileType: file.type || null,
        fileSize: file.size,
        content: text,
      });

      if (error) {
        setNotice(error.message);
        return;
      }

      setMaterials((prev) => [created, ...prev]);
      setOpenId(created.id);
    } catch (err) {
      console.error("upload failed:", err);
      setNotice("حصل خطأ أثناء رفع الملف. حاول تاني.");
    } finally {
      setIsUploading(false);
      setUploadStep("");
    }
  };

  /* ---- حفظ الملاحظة ---- */
  const handleSaveNote = async () => {
    if (!openMaterial) return;
    setNoteState("saving");
    const { error } = await updateMaterial(supabase, openMaterial.id, { note: noteDraft });
    if (error) {
      setNotice(error.message);
      setNoteState("idle");
      return;
    }
    setMaterials((prev) => prev.map((m) => (m.id === openMaterial.id ? { ...m, note: noteDraft } : m)));
    setNoteState("saved");
  };

  /* ---- حذف مادة ---- */
  const handleDelete = async (material: Material) => {
    if (!confirm(`متأكد إنك عايز تشيل «${material.title}» من مكتبتك؟ الخطوة دي لا يمكن التراجع عنها.`)) return;

    const { error } = await deleteMaterial(supabase, material.id);
    if (error) {
      setNotice(error.message);
      return;
    }
    setMaterials((prev) => prev.filter((m) => m.id !== material.id));
    if (openId === material.id) setOpenId(null);
  };

  /* ---- تلخيص بالمساعد ----
     الملخص بيتخزن في الصف، فمرة واحدة بس لكل مادة. */
  const handleSummarize = async () => {
    if (!openMaterial || isSummarizing) return;
    setIsSummarizing(true);
    setNotice(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction:
            "أنت معلم خبير. لخّص المادة المبعوتة في نقاط عربية واضحة ومرتّبة: الفكرة الأساسية الأول، بعدها أهم النقاط، وفي الآخر إيه اللي المفروض المتعلّم يعرفه بعد ما يقراها. من غير حشو ومن غير مقدمات.",
          messages: [
            {
              role: "user",
              content: `المادة: ${openMaterial.title}\n\n--- المحتوى ---\n${openMaterial.content.slice(0, 6000)}\n--- نهاية المحتوى ---`,
            },
          ],
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(data?.error?.message || "ما قدرناش نلخّص المادة دي دلوقتي. حاول تاني.");
        return;
      }

      const summary: string = data?.choices?.[0]?.message?.content || "";
      if (!summary.trim()) {
        setNotice("رجع ملخص فاضي. حاول تاني.");
        return;
      }

      const { error } = await updateMaterial(supabase, openMaterial.id, { summary });
      if (error) {
        setNotice(error.message);
        return;
      }
      setMaterials((prev) => prev.map((m) => (m.id === openMaterial.id ? { ...m, summary } : m)));
    } catch (err) {
      console.error("summarize failed:", err);
      setNotice("حصل خطأ أثناء التلخيص. حاول تاني.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleGeminiAnalysis = async () => {
    if (!openMaterial || isGeminiAnalyzing || (fileAction === "question" && fileQuestion.trim().length < 3)) return;
    setIsGeminiAnalyzing(true); setNotice(null);
    try {
      const res = await fetch("/api/ai/file-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materialId: openMaterial.id, action: fileAction, question: fileQuestion }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message || "تعذّر تحليل الملف.");
      setFileAnalysis(data?.result || "");
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر تحليل الملف."); }
    finally { setIsGeminiAnalyzing(false); }
  };

  /* ---- افتح المحادثة والمادة مرفوعة معاها ---- */
  const handleAskAssistant = (material: Material) => {
    setAiSeed(material.title, material.content);
    setNavIntent({ kind: "modal", target: "ai" });
    router.push("/dashboard");
  };

  /* ---------------------------------------------------------------------- */

  const uploadButton = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.csv,.json,.pdf,.docx,image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading || session.status !== "ready"}
        className="btn btn-marker text-sm"
      >
        {isUploading ? uploadStep || "بيرفع…" : "ارفع مادة"}
      </button>
    </>
  );

  return (
    <PageShell
      eyebrow="مساحة العمل"
      title="مكتبة موادك"
      lede="ارفع أي ملف بتذاكر منه — PDF، Word، صورة محاضرة، أو ملف نصي — والنص بيتستخرج ويتحفظ. بعد كده تقدر تلخّصه، تكتب ملاحظاتك عليه، أو تسأل المساعد فيه من غير ما ترفعه تاني."
      action={uploadButton}
      feedbackPage="workspace"
      feedbackLabel="مساحة العمل"
    >
      {notice && <DataNotice message={notice} />}

      {isLoading ? (
        <LoadingSheets count={3} />
      ) : openMaterial ? (
        /* ================= عارض مادة واحدة ================= */
        <div className="space-y-4">
          <button onClick={() => setOpenId(null)} className="mono text-ink-soft hover:text-ink transition">
            → كل الموادّ
          </button>

          <div className="sheet-card sheet-card-live p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <span className="text-2xl leading-none shrink-0" aria-hidden>
                  {fileIcon(openMaterial.fileType, openMaterial.title)}
                </span>
                <div className="min-w-0">
                  <h2 className="font-display font-extrabold text-base text-ink leading-tight break-words">
                    {openMaterial.title}
                  </h2>
                  <p className="tag mt-1">
                    <span>{formatArabicDate(openMaterial.createdAt)}</span>
                    {formatFileSize(openMaterial.fileSize) && (
                      <span className="ltr-num">{formatFileSize(openMaterial.fileSize)}</span>
                    )}
                    <span className="ltr-num">{openMaterial.content.length.toLocaleString("en")} حرف</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => handleAskAssistant(openMaterial)} className="btn btn-quiet text-sm">
                  اسأل المساعد
                </button>
                <button
                  onClick={() => handleDelete(openMaterial)}
                  className="mono text-ink-soft hover:text-redpen px-2 py-1.5 rounded-[6px] transition"
                >
                  شيلها
                </button>
              </div>
            </div>
          </div>

          {/* ---- الملخص ---- */}
          <div className="sheet-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow eyebrow-flush">الملخص</p>
              {!openMaterial.summary && (
                <button onClick={handleSummarize} disabled={isSummarizing} className="btn btn-quiet text-sm">
                  {isSummarizing ? "بيلخّص…" : "لخّصها بالمساعد"}
                </button>
              )}
            </div>

            {openMaterial.summary ? (
              <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{openMaterial.summary}</p>
            ) : (
              <p className="text-xs text-ink-soft leading-relaxed">
                لسه مفيش ملخص. لما تعمله بيتحفظ مع المادة، فمش هتستنى تاني ولا هتاخد نسخة مختلفة كل مرة.
              </p>
            )}
          </div>

          <div className="sheet-card p-5 space-y-3">
            <div><p className="eyebrow eyebrow-flush">Gemini analysis</p><p className="text-xs text-ink-soft mt-1">تحليل النص المستخرج من الملف. في الصور، النتيجة مبنية على OCR الحالي وليست رؤية للصورة الأصلية.</p></div>
            <div className="flex flex-wrap gap-2">{([['summarize','تلخيص'],['extract','استخراج'],['analyze','تحليل'],['question','اسأل']] as const).map(([id, label]) => <button key={id} onClick={() => setFileAction(id)} className={`btn text-xs ${fileAction === id ? 'btn-marker' : 'btn-quiet'}`}>{label}</button>)}</div>
            {fileAction === "question" && <input value={fileQuestion} onChange={(e) => setFileQuestion(e.target.value)} placeholder="اكتب سؤالك عن الملف" className="w-full rounded-[var(--r-sm)] border border-rule bg-paper p-2.5 text-sm outline-none" />}
            <button onClick={() => void handleGeminiAnalysis()} disabled={isGeminiAnalyzing || (fileAction === "question" && fileQuestion.trim().length < 3)} className="btn btn-quiet text-sm disabled:opacity-40">{isGeminiAnalyzing ? "بيحلّل…" : "حلّل بـ Gemini"}</button>
            {fileAnalysis && <p className="whitespace-pre-wrap text-sm leading-7 border-t border-rule pt-3">{fileAnalysis}</p>}
          </div>

          {/* ---- ملاحظاتك ---- */}
          <div className="sheet-card p-5 space-y-3">
            <p className="eyebrow eyebrow-flush">ملاحظاتك</p>
            <textarea
              value={noteDraft}
              onChange={(e) => {
                setNoteDraft(e.target.value);
                setNoteState("idle");
              }}
              rows={5}
              placeholder="اكتب اللي فهمته، أو الأسئلة اللي لسه محتاج ترجع لها…"
              className="field text-sm"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveNote}
                disabled={noteState === "saving" || noteDraft === openMaterial.note}
                className="btn btn-marker text-sm"
              >
                {noteState === "saving" ? "بيحفظ…" : "احفظ الملاحظة"}
              </button>
              {noteState === "saved" && <span className="tag">اتحفظت</span>}
            </div>
          </div>

          {/* ---- النص المستخرج ---- */}
          <details className="sheet-card p-5">
            <summary className="eyebrow eyebrow-flush cursor-pointer">النص المستخرج</summary>
            <p className="text-[11px] text-ink-soft leading-relaxed whitespace-pre-wrap mt-3 max-h-96 overflow-y-auto">
              {openMaterial.content}
            </p>
          </details>
        </div>
      ) : materials.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title="المكتبة لسه فاضية"
          body="ارفع أول مادة — محاضرة PDF، ملف Word، أو صورة صفحة من كتاب. النص بيتستخرج مرة واحدة ويفضل معاك."
          action={uploadButton}
        />
      ) : (
        /* ================= قايمة الموادّ ================= */
        <div className="space-y-3">
          <p className="tag">
            <span className="ltr-num">{materials.length}</span> مادة في مكتبتك
          </p>

          {materials.map((material) => (
            <div key={material.id} className="sheet-card p-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOpenId(material.id)}
                  className="flex items-start gap-3 min-w-0 flex-1 text-right"
                >
                  <span className="text-xl leading-none shrink-0 mt-0.5" aria-hidden>
                    {fileIcon(material.fileType, material.title)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink truncate">{material.title}</span>
                    <span className="tag mt-1">
                      <span>{formatArabicDate(material.createdAt)}</span>
                      {material.summary && <span>ملخّصة</span>}
                      {material.note.trim() && <span>عليها ملاحظات</span>}
                    </span>
                  </span>
                </button>

                <button
                  onClick={() => handleAskAssistant(material)}
                  className="mono text-ink-soft hover:text-ink px-2 py-1.5 rounded-[6px] transition shrink-0"
                >
                  اسأل
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}