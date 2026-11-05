import Link from "next/link";
import type { ChatCard as ChatCardType } from "@/lib/workspace/overview";

export function ChatCard({ chat }: { chat: ChatCardType }) {
  const timeAgo = relativeTime(chat.updatedAt);
  return (
    <Link
      href={`/chat?conversation=${chat.id}`}
      className="block rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-amber-500/40 transition"
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-white truncate">
          {chat.title || "محادثة بدون عنوان"}
        </h3>
        <span className="text-xs text-slate-500 whitespace-nowrap">{timeAgo}</span>
      </div>
      {chat.lastMessagePreview && (
        <p className="text-sm text-slate-400 mt-2 line-clamp-2">
          {chat.lastMessagePreview}
        </p>
      )}
      <div className="text-xs text-slate-500 mt-2">
        {chat.messageCount} رسالة
      </div>
    </Link>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return new Date(iso).toLocaleDateString("ar-EG");
}