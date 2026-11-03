"use client";

import { Check, Clock } from "lucide-react";

interface ChatBubbleProps {
  message: string;
  isAdmin: boolean;
  isRead?: boolean;
  time?: string;
}

export default function ChatBubble({ message, isAdmin, isRead, time }: ChatBubbleProps) {
  return (
    <div className={`flex mb-3 ${isAdmin ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl p-3 text-sm ${
          isAdmin
            ? "bg-blue-500 text-white text-left rounded-tl-none"
            : "bg-paper-2 text-ink border border-rule rounded-tr-none"
        }`}
      >
        <p className="break-words">{message}</p>
        <div className="flex items-center gap-1 mt-1">
          {time && (
            <span className={`text-[10px] ${isAdmin ? "text-blue-100" : "text-ink-soft"}`}>{time}</span>
          )}
          {!isAdmin && isRead && (
            <Check className="w-3 h-3 text-emerald-400" aria-hidden />
          )}
          {!isAdmin && !isRead && <Clock className="w-3 h-3 text-ink-soft text-[10px]" aria-hidden />}
        </div>
      </div>
    </div>
  );
}
