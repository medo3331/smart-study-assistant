"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * The notebook's AI assistant — a floating side panel over the editor.
 *
 * It talks to the platform's own `/api/chat` route, so the assistant inherits
 * the same auth, subscription quota, rate limits and model routing as every
 * other AI surface. Nothing about the notebook is uploaded: only the typed
 * text the student chooses to include as context (handwriting stays local).
 */

type ChatMessage = { role: "user" | "assistant"; content: string };

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "لخّص", prompt: "لخّص المحتوى ده في نقط مختصرة أنا هحفظها:" },
  { label: "أسئلة مراجعة", prompt: "اعمل على المحتوى ده ٥ أسئلة مراجعة قصيرة مع الإجابة:" },
  { label: "اشرح أبسط", prompt: "اشرح المحتوى ده بأسلوب أبسط كأني مبتدئ:" },
  { label: "كلمات مفتاحية", prompt: "استخرج أهم المصطلحات والتعريفات من المحتوى ده:" },
];

export default function NotesAssistant({
  getEditorContext,
  getSelectedText,
  getCanvasSnapshot,
}: {
  /** Current page context (title + typed texts). Called when sending. */
  getEditorContext: () => string;
  /** نص العنصر المحدد على الصفحة (لو حصل تحديد لنص) — للتشغيل على نص معين. */
  getSelectedText?: () => string | null;
  /** لقطة الصفحة الحالية كـ dataURL — يبعتها للذكاء الاصطناعي كصورة. */
  getCanvasSnapshot?: () => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoContext, setAutoContext] = useState(true);
  // ✂️ النص المحدد حالياً — بيتحدّث بيروديا عشان زر «اشرح المحدد» يبان مفعل.
  const [selectedText, setSelectedText] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  // بنتتبع التحديد من المحرر كل نصانية — بدل ما نعمل callback معقد
  // من جوه الـ editor، كفاية إن الزر يتحدّث لما تفتح اللوحة أو ترجع لها.
  useEffect(() => {
    if (!open) return;
    const poll = () => {
      const text = getSelectedText?.() ?? null;
      setSelectedText((previous) =>
        text === previous ? previous : text,
      );
    };
    poll();
    const timer = setInterval(poll, 600);
    return () => {
      clearInterval(timer);
    };
  }, [open, getSelectedText]);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || busy) return;

      const context = autoContext ? getEditorContext() : "";
      const composed = context
        ? `${text}\n\n[سياق من الدفتر]\n${context}`
        : text;

      const next = [...messages, { role: "user" as const, content: composed }];
      setMessages(next);
      setInput("");
      setBusy(true);
      setError(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.slice(-8).map((message) => ({
              role: message.role,
              content: message.content,
            })),
            systemInstruction:
              "انت مساعد داخل دفتر ملاحظات الطالب. إجاباتك مختصرة وعملية وبالعربي، وتناسب المذاكرة السريعة. لو الطالب بعت سياق من دفتره فاعمله أساس لردك.",
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            data?.error?.message ?? "فشل الاتصال بالمساعد. حاول تاني.",
          );
        }
        // ⚠️ /api/chat بيرجّع الـ payload الخام للمزوّد (choices) — وفيه
        //   كمان `answer` الجديد. بقرا الاتنين الاحتياطيين عشان أي شكل
        //   مالوش يرجّعنا رد فاضي.
        const raw =
          data?.answer ??
          data?.choices?.[0]?.message?.content ??
          data?.content ??
          null;
        const answer = typeof raw === "string" && raw.trim()
          ? raw
          : "المساعد رجع رد فاضي — حاول تاني.";
        setMessages((previous) => [...previous, { role: "assistant", content: answer }]);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "حصل خطأ غير متوقع.");
      } finally {
        setBusy(false);
      }
    },
    [autoContext, busy, getEditorContext, messages],
  );

  /** ✂️ اشرح النص المحدد — بيبعت للـ AI مع طلب شرح مفصّل. */
  const explainSelection = useCallback(() => {
    const text = (getSelectedText?.() ?? selectedText ?? "").trim();
    if (!text) {
      setError("حدد نص على الصفحة الأول (اضغط عليه من أداة التحديد). ثم جرّب تاني.");
      return;
    }
    setError(null);
    if (text.length > 4000) {
      void send(`اشرح النص ده بالتفصيل وبأسلوب سهل:

${text.slice(0, 4000)}`);
    } else {
      void send(`اشرح النص ده بالتفصيل وبأسلوب سهل:

${text}`);
    }
  }, [getSelectedText, selectedText, send]);

  /** 📸 صورة الصفحة — بيبعتها للـ AI كصورة عبر /api/ai/image-analysis. */
  const analyzeSnapshot = useCallback(async () => {
    if (busy) return;
    if (!getCanvasSnapshot) {
      setError("مفيش دعم لقطة الصفحة هنا.");
      return;
    }
    const dataUrl = getCanvasSnapshot();
    if (!dataUrl?.startsWith("data:image/")) {
      setError("مقدرناش نصور الصفحة دلوقتي — جرّب تاني.");
      return;
    }
    const question = input.trim();
    setMessages((previous) => [
      ...previous,
      {
        role: "user" as const,
        content: question
          ? `📸 صوّرت لك الصفحة — ${question}`
          : "📸 صوّرت لك الصفحة — اشرح اللي فيها",
      },
    ]);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      // dataURL → blob عشان نبعته FormData زي أي صورة.
      const blob = await (await fetch(dataUrl)).blob();
      const form = new FormData();
      form.append("file", blob, "page.png");
      form.append(
        "question",
        question ||
          "دي صفحة من دفتر طالب بذاكر. اشرح اللي مكتوب فيها بالتفصيل بالعربي، ولو فيها أخطاء صححها.",
      );
      const res = await fetch("/api/ai/image-analysis", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.error?.message ?? "فشل تحليل الصورة. حاول تاني.",
        );
      }
      const answer = typeof data?.result === "string" && data.result.trim()
        ? data.result
        : "المساعد رجع رد فاضي — حاول تاني.";
      setMessages((previous) => [...previous, { role: "assistant", content: answer }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حصل خطأ غير متوقع.");
    } finally {
      setBusy(false);
    }
  }, [busy, getCanvasSnapshot, input]);

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="notes-assistant-fab"
          onClick={() => setOpen(true)}
          title="مساعد الذكاء الاصطناعي"
        >
          ✨
        </button>
      ) : null}

      {open ? (
        <div className="notes-assistant" role="dialog" aria-label="مساعد النوته">
          <header className="notes-assistant-head">
            <span className="notes-assistant-title">✨ مساعد النوته</span>
            <button
              type="button"
              className="notes-btn notes-btn-sm"
              onClick={() => setOpen(false)}
              aria-label="إقفال المساعد"
            >
              ✕
            </button>
          </header>

          <div ref={listRef} className="notes-assistant-list">
            {messages.length === 0 ? (
              <p className="notes-assistant-empty">
                اسأل المساعد أي حاجة عن اللي بتذاكره — ولما تكتب نصوص على الصفحة
                يقدر يقراها ويشتغل عليها.
              </p>
            ) : null}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`notes-assistant-msg`}
                data-role={message.role}
              >
                {message.content}
              </div>
            ))}
            {busy ? (
              <p className="notes-assistant-empty">المساعد بيفكر…</p>
            ) : null}
            {error ? (
              <p className="notes-alert" data-tone="error" style={{ margin: 0 }}>
                {error}
              </p>
            ) : null}
          </div>

          <div className="notes-assistant-chips">
            <button
              type="button"
              className="notes-btn notes-btn-sm"
              disabled={busy}
              data-tone={selectedText ? "primary" : undefined}
              onClick={explainSelection}
              title={selectedText ? "اشرح النص المحدد" : "حدد نص على الصفحة الأول"}
            >
              ✂️ اشرح المحدد
            </button>
            {getCanvasSnapshot ? (
              <button
                type="button"
                className="notes-btn notes-btn-sm"
                disabled={busy}
                onClick={() => void analyzeSnapshot()}
                title="صوّر الصفحة وابعتها للذكاء الاصطناعي"
              >
                📸 صورة الصفحة
              </button>
            ) : null}
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                className="notes-btn notes-btn-sm"
                disabled={busy}
                onClick={() => void send(action.prompt)}
              >
                {action.label}
              </button>
            ))}
            <label className="notes-label notes-assistant-ctx">
              <input
                type="checkbox"
                checked={autoContext}
                onChange={(event) => setAutoContext(event.target.checked)}
              />
              استخدم نص الصفحة
            </label>
          </div>

          <form
            className="notes-assistant-input"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={selectedText ? "محدد عندك نص — اسأل عنه أو دوس «اشرح المحدد»…" : "اسأل المساعد…"}
              aria-label="اكتب رسالتك للمساعد"
              disabled={busy}
              className="notes-input"
            />
            <button
              type="submit"
              disabled={busy || input.trim() === ""}
              data-tone="primary"
              className="notes-btn"
            >
              إرسال
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
