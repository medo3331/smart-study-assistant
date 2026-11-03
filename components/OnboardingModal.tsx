import React from "react";
import { useOnboarding } from "@/hooks/useOnboarding";
import { buildAssistantPrompt } from "@/lib/magic-assistant/prompt";

interface OnboardingModalProps {
  open: boolean;
  onDismiss: () => void;
  onButtonClick: (mode: "upload" | "chat" | "plans") => void;
  planType: "free" | "pro" | "ultra";
}

export function OnboardingModal({ open, onDismiss, onButtonClick, planType }: OnboardingModalProps) {
  const prompt = buildAssistantPrompt(planType);

  const handleButtonClick = (mode: "upload" | "chat" | "plans") => {
    onButtonClick(mode);
    onDismiss();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-paper rounded-[var(--r-sm)] p-6 max-w-lg w-full shadow-xl transform transition-transform scale-100"
        role="document"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-ink">أهلاً بك في Magicly!</h3>
          <button
            onClick={onDismiss}
            className="text-text-soft hover:opacity-70"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        <p className="text-text-soft text-sm mb-6">
          أنا Magic Assistant، مرشدك الشخصي في المنصة. خطتك الحالية هي {planType === "free" ? "المجانية" : planType === "pro" ? "ال احترافية" : "الفائقة"}، و{planType === "free" ? "بها" : "فيها"} {prompt}.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => handleButtonClick("upload")}
            className="w-full px-4 py-2 bg-emerald-600 text-white rounded-[var(--r-sm)] hover:bg-emerald-700 transition"
          >
            إزاي أرفع محاضرة؟
          </button>
          <button
            onClick={() => handleButtonClick("chat")}
            className="w-full px-4 py-2 bg-paper border border-rule text-ink rounded-[var(--r-sm)] hover:bg-paper-200 transition"
          >
            إزاي أستخدم المعلم الذكي؟
          </button>
          <button
            onClick={() => handleButtonClick("plans")}
            className="w-full px-4 py-2 bg-paper border border-rule text-ink rounded-[var(--r-sm)] hover:bg-paper-200 transition"
          >
            خطط الأسعار
          </button>
        </div>
      </div>
    </div>
  );
}