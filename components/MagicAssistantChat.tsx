import React, { useState } from "react";
import { buildAssistantPrompt } from "@/lib/magic-assistant/prompt";

interface MagicAssistantChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MagicAssistantChat({ isOpen, onClose }: MagicAssistantChatProps) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    // Simple rule-based responses for now (no AI call to avoid credits/routing complexity)
    const lower = trimmed.toLowerCase();
    let response = "";

    if (
      lower.includes("رفع") ||
      lower.includes("upload") ||
      lower.includes("محاضرة")
    ) {
      response = "لرفع محاضرة، اذهب إلى صفحة الدروس واضغط 'رفع ملف'. يقبل الموقع ملفات hasta 20 ميجا بالنسخة المجانية، وأعلى في الخطط الأعلى. بعد الرفع، يمكنك استخدام المعلم الذكي لشرح المحتوى.";
    } else if (
      lower.includes("خطة") ||
      lower.includes("مميزات") ||
      lower.includes("مجانية")
    ) {
      response = "الخطة المجانية تعطيك 20 رسالة كل ساعتين، ورفع ملفات لغاية 20 ميجا، ورسائل غير محدودة في الخطط الأعلى. تقدر تشوف تفاصيل أكثر في صفحة الخطط.";
    } else if (
      lower.includes("معلم") ||
      lower.includes("شات") ||
      lower.includes("مذاكرة") ||
      lower.includes("دراسة")
    ) {
      response = "أنا مرشد للمنصة، لأجل أسئلة المذاكرة استخدم الشات الرئيسي /chat. أنا موجود لمساعدتك في معرفة كيفية استخدام الموقع وأدواته.";
    } else if (lower.includes("دعم") || lower.includes("اتصال")) {
      response = "يمكنك التواصل مع الدعم من خلال صفحة 'Contact Us' في القائمة الجانبية، أو إرسال طلب عبر نموذج الاتصال.";
    } else {
      response = "ممكن rephrase سؤالك؟ أنا موجود للمساعدة في استخدام المنصة، وإيجاد المعلومات عن الخطط، وإيجاد طريقة الرفع، أو أي سؤال عن إعدادات الحساب.";
    }

    // Add assistant message
    setMessages((prev) => [...prev, { role: "assistant", content: response }]);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed bottom-6 left-6 right-6 z-50 max-w-md mx-auto"
      aria-modal="true"
    >
      <div
        className="bg-paper rounded-[var(--r-sm)] shadow-lg border border-rule p-5 transform transition-transform scale-100"
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-ink">Magic Assistant</h4>
          <button
            onClick={onClose}
            className="text-text-soft hover:opacity-70 text-sm"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        <div className="h-96 overflow-y-auto space-y-2" aria-label="محادثة">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-[var(--r-sm)] ${
                msg.role === "user" ? "bg-emerald-100 self-end" : "bg-paper self-start"
              }`}
            >
              <p className="text-sm {msg.role === "user" ? "text-emink" : "text-ink"}">
                {msg.content}
              </p>
            </div>
          ))}

          {!messages.length ? (
            <p className="text-text-soft text-center py-4">ابدأ بكتابة سؤال أو اضغط على أحد الاقتراحات</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="اكتب سؤالك هنا..."
          className="flex-1 bg-paper border border-rule rounded-[var(--r-sm)] px-3 py-2 text-xs text-ink placeholder:text-text-soft focus:outline-none focus:border-rule-strong"
          aria-label="كتابة رسالة"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="px-4 py-2 bg-emerald-600 text-white rounded-[var(--r-sm)] hover:bg-emerald-700 transition"
          aria-label="إرسال"
        >
          أرسل
        </button>
      </div>
    </div>
  );
}