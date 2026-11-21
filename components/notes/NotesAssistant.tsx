"use client";

import React, { useEffect, useRef, useState } from "react";
import { dataUrlToBlob } from "@/lib/notes/blob";
import { useSpeak } from "@/lib/speech";

/**
 * The notebook's AI assistant — a floating side panel over the editor.
 *
 * It talks to the platform's own `/api/chat` route, so the assistant inherits
 * the same auth, subscription quota, rate limits and model routing as every
 * other AI surface. Nothing about the notebook is uploaded: only the typed
 * text the student chooses to include as context (handwriting stays local).
 */

type ChatMessage = { role: "user" | "assistant"; content: string };

/** 🖼️ SVG string → PNG dataURL (بدقة 2x) — الرسمة عشان تتخزن جوه الصفحة. */
async function svgToPngDataUrl(svg: string, scale = 2): Promise<string | null> {
  try {
    const container = document.createElement("div");
    container.innerHTML = svg;
    const svgElement = container.querySelector("svg");
    if (!svgElement) return null;
    svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const viewBox = svgElement.getAttribute("viewBox") ?? "";
    let width = Number(svgElement.getAttribute("width")?.replace(/[^\d.]/g, "")) || 0;
    let height = Number(svgElement.getAttribute("height")?.replace(/[^\d.]/g, "")) || 0;
    if ((!width || !height) && viewBox) {
      const parts = viewBox.split(/[\\s,]+/).map(Number);
      width = parts[2];
      height = parts[3];
    }
    if (!width || !height) return null;
    // خلفية بيضا — الرسمة جوه صفحة ورق.
    svgElement.setAttribute("width", String(width));
    svgElement.setAttribute("height", String(height));
    const blob = new Blob([new XMLSerializer().serializeToString(svgElement)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("svg load failed"));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

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
  /** بيبدأ مفتوح — وضع المذاكرة الجانبي. */
  defaultOpen = false,
  /** ✍️ إدراج نص الـ AI على الصفحة — من المحرر. */
  onInsertToPage,
  /** 🎨 إدراج رسمة/مخطط AI على الصفحة — من المحرر. */
  onInsertImage,
}: {
  /** Current page context (title + typed texts). Called when sending. */
  getEditorContext: () => string;
  /** نص العنصر المحدد على الصفحة (لو حصل تحديد لنص) — للتشغيل على نص معين. */
  getSelectedText?: () => string | null;
  /** لقطة الصفحة الحالية كـ dataURL — يبعتها للذكاء الاصطناعي كصورة. */
  getCanvasSnapshot?: () => string | null;
  /** بيبدأ مفتوح — وضع المذاكرة الجانبي. */
  defaultOpen?: boolean;
  /** ✍️ إدراج نص الـ AI على الصفحة. */
  onInsertToPage?: (text: string) => void;
  /** 🎨 إدراج رسمة AI على الصفحة. */
  onInsertImage?: (dataUrl: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🔊 قراءة بصوت — متصفح نفسه، بدون أي خدمة خارجية.
  const speak = useSpeak();

  // 🎨 أنواع الرسمات المتاحة في منتقي الرسمة.
  const DIAGRAM_TYPES: { id: string; label: string }[] = [
    { id: "mindmap", label: "🗺️ خريطة ذهنية" },
    { id: "flowchart", label: "🔀 مخطط انسيابي" },
    { id: "timeline", label: "📅 جدول زمني" },
    { id: "classDiagram", label: "🗂️ تصنيف" },
    { id: "pie", label: "🥧 نسب" },
    { id: "graph", label: "📊 علاقات" },
  ];
  const [diagramMenuOpen, setDiagramMenuOpen] = useState(false);
  const diagramSeqRef = useRef(0);
  const [diagramBusy, setDiagramBusy] = useState(false);

  /** آخر رد من الـ AI — لزر «اكتبها على النوته» و«اقرا». */
  const lastAnswer = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

  /** ✍️ يكتب آخر رد من الـ AI على الصفحة كبلوكات نص قابلة للتعديل. */
  const writeToPage = () => {
    if (!onInsertToPage) return;
    const text = lastAnswer.trim();
    if (!text) {
      setError("مفيش رد من المساعد لسه — اسأل الأول وبعدها اكتبها.");
      return;
    }
    onInsertToPage(text);
  };

  /** 🎨 مخطط/رسمة من الـ AI → SVG → PNG → على الصفحة. */
  const generateDiagramOnPage = async (type: string) => {
    if (!onInsertImage || diagramBusy) return;
    setDiagramMenuOpen(false);
    setDiagramBusy(true);
    setError(null);
    try {
      // الموضوع: نص الصفحة لو فيه حاجة، وإلا آخر سؤال من الطالب.
      const pageText = getEditorContext().slice(0, 300).trim();
      const lastQuestion = [...messages]
        .reverse()
        .find((message) => message.role === "user")?.content ?? "";
      const topic = pageText || lastQuestion.slice(0, 200).trim() || "موضوع المحاضرة";
      const res = await fetch("/api/ai/diagram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, type, detail: "medium", language: "ar" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.mermaidCode) {
        throw new Error(data?.error?.message ?? "فشل توليد الرسمة — جرّب تاني.");
      }
      const mermaid = (await import("mermaid")).default;
      // ثيم فاتح لأن الصفحة ورق أبيض، و htmlLabels=false عشان الرسم يقدر
      // يتحول PNG على الـ canvas (foreignObject مش بيتصور في بعض المتصفحات).
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "strict",
        fontFamily: "Alexandria, Tahoma, sans-serif",
        flowchart: { htmlLabels: false, curve: "basis" },
      });
      diagramSeqRef.current += 1;
      const id = `notes-dg-${diagramSeqRef.current}`;
      const { svg } = await mermaid.render(id, String(data.mermaidCode));
      const dataUrl = await svgToPngDataUrl(svg);
      if (!dataUrl) throw new Error("مقدرناش نجهز الرسمة للصفحة.");
      onInsertImage(dataUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "فشل توليد الرسمة.");
    } finally {
      setDiagramBusy(false);
    }
  };
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

  // 🚦 طابور الطلبات — ضغط سريع على زر الإرسال مبيفقدش رسالة:
  // كل طلب بينتظر لما اللي قبله يخلص (حتى 3 طلبات في الانتظار).
  const busyRef = useRef(false);
  const queueRef = useRef<string[]>([]);

  /** إضافة رسالة للحالة. */
  const pushMessage = (message: ChatMessage) => {
    setMessages((previous) => [...previous, message]);
  };

  const doSend = async (rawText: string, baseHistory?: ChatMessage[]) => {
    const text = rawText.trim();
      if (!text) return;

      const context = autoContext ? getEditorContext() : "";
      const composed = context
        ? `${text}\n\n[سياق من الدفتر]\n${context}`
        : text;

      // 🔑 التاريخ بيمر صراحةً للطلبات المُصفّرة — من غير ref.
      const history = baseHistory ?? messages;
      let conversationAfter: ChatMessage[] = history;
      const next = [...history, { role: "user" as const, content: composed }];
      setMessages(next);
      setInput("");
      setBusy(true);
      busyRef.current = true;
      setError(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.slice(-12).map((message) => ({
              role: message.role,
              content: message.content,
            })),
            systemInstruction:
              "انت مساعد مذاكرة شخصي جوه دفتر الطالب في Magicly. اشرح كأنك مدرس خصوصي شاطر بيفهم الطالب، مش ردود عابرة أو مختصرة زيادة عن اللزوم. \n" +
              "قواعد الرد:\n" +
              "• رد كامل ومفيد: غطي السؤال بالتفصيل المهم، مش سطر واحد.\n" +
              "• نظّم الرد: عنوان قصير لو الموضوع كبير، وبعدين نقاط قصيرة (•) أو خطوات مرقمة، وكل نقطة جملة واضحة.\n" +
              "• بالعربي المصري البسيط، والمصطلح العلمي بالإنجليزي بين قوسين أول مرة.\n" +
              "• اربط الإجابة بسياق الدفتر المرفق لو موجود، ولو الطالب سأل سؤال غامض خمن قصده من السياق وجاوب من غير ما تحرجله.\n" +
              "• في الآخر لو فيه حاجة تستاهل، قول سؤال مراجعة صغير يساعده يثبت المعلومة.",
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
        pushMessage({ role: "assistant", content: answer });
        // التاريخ الكامل للرد ده — أساس أي طلب مُصفّر بعده.
        conversationAfter = [...next, { role: "assistant" as const, content: answer }];
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "حصل خطأ غير متوقع.");
      } finally {
        setBusy(false);
        busyRef.current = false;
        // 🚦 الطلبات اللي في الانتظار — الأول يخلص التاني يبدأ،
        // وبياخد التاريخ الكامل اللي قبله.
        const pending = queueRef.current.shift();
        if (pending) void doSend(pending, conversationAfter);
      }
  };

  const send = (rawText: string) => {
    const text = rawText.trim();
      if (!text) return;
      if (busyRef.current) {
        if (queueRef.current.length < 3) queueRef.current.push(text);
        return;
      }
      void doSend(text);
  };

  /** ✂️ اشرح النص المحدد — بيبعت للـ AI مع طلب شرح مفصّل. */
  const explainSelection = () => {
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
  };

  /** 📸 صورة الصفحة — بيبعتها للـ AI كصورة عبر /api/ai/image-analysis. */
  const analyzeSnapshot = async () => {
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
    pushMessage({
      role: "user",
      content: question
        ? `📸 صوّرت لك الصفحة — ${question}`
        : "📸 صوّرت لك الصفحة — اشرح اللي فيها",
    });
    setInput("");
    setBusy(true);
    setError(null);
    try {
      // dataURL → blob بدون fetch (Firefox مش بيدعم fetch على data:).
      const blob = dataUrlToBlob(dataUrl);
      if (!blob) {
        setError("مقدرناش نصور الصفحة دلوقتي — جرّب تاني.");
        return;
      }
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
      pushMessage({ role: "assistant", content: answer });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حصل خطأ غير متوقع.");
    } finally {
      setBusy(false);
    }
  };

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
          </div>

          {/* 🤖 أفعال على الصفحة — الـ AI يكتب ويشرح ويرسم ويقرا. */}
          <div className="notes-assistant-chips">
            {onInsertToPage ? (
              <button
                type="button"
                className="notes-btn notes-btn-sm"
                disabled={!lastAnswer}
                onClick={writeToPage}
                title="آخر رد من الـ AI يتكتب على الصفحة كبلوكات قابلة للتعديل"
              >
                ✍️ اكتبها على النوته
              </button>
            ) : null}
            {onInsertImage ? (
              <span style={{ position: "relative" }}>
                <button
                  type="button"
                  className="notes-btn notes-btn-sm"
                  disabled={diagramBusy || busy}
                  onClick={() => setDiagramMenuOpen((value) => !value)}
                  title="المساعد يرسم مخطط توضيحي ويلزقه على الصفحة"
                >
                  {diagramBusy ? "بيقزيم…" : "🎨 رسمة على النوته"}
                </button>
                {diagramMenuOpen ? (
                  <span className="notes-diagram-menu">
                    {DIAGRAM_TYPES.map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        className="notes-btn notes-btn-sm"
                        onClick={() => void generateDiagramOnPage(type.id)}
                      >
                        {type.label}
                      </button>
                    ))}
                  </span>
                ) : null}
              </span>
            ) : null}
            {speak.supported ? (
              <>
                <button
                  type="button"
                  className="notes-btn notes-btn-sm"
                  disabled={!lastAnswer}
                  data-active={speak.speaking}
                  onClick={() => (speak.speaking ? speak.stop() : speak.speak(lastAnswer))}
                  title={speak.speaking ? "وقفة" : "اقرا آخر رد من الـ AI بصوت عربي"}
                >
                  {speak.speaking ? "⏸ وقفة" : "🔊 اقرا الرد"}
                </button>
                <button
                  type="button"
                  className="notes-btn notes-btn-sm"
                  data-active={speak.speaking}
                  onClick={() => {
                    if (speak.speaking) {
                      speak.stop();
                      return;
                    }
                    const pageText = getEditorContext().trim();
                    if (!pageText) {
                      setError("الصفحة مفيهاش نص مطبوع — اكتب حاجة الأول.");
                      return;
                    }
                    speak.speak(pageText);
                  }}
                  title="يقرا نصوص الصفحة بصوت عربي"
                >
                  📖 اقرا الصفحة
                </button>
              </>
            ) : null}
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
