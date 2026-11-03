"use client";

import { useEffect, useState } from "react";
import { Bell, Info, Sparkles, AlertCircle } from "lucide-react";
import { listMyNotifications } from "@/app/dashboard/actions/support";

type Notif = { id: string; title: string; message: string; type: string };

const TYPE_CONFIG: Record<string, { icon: React.ElementType; bg: string; border: string; text: string; close: string }> = {
  info: { icon: Info, bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-600", close: "text-blue-500 hover:text-blue-700" },
  warning: { icon: AlertCircle, bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-600", close: "text-amber-500 hover:text-amber-700" },
  feature: { icon: Sparkles, bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-600", close: "text-emerald-500 hover:text-emerald-700" },
};

export default function AnnouncementBanner() {
  const [item, setItem] = useState<Notif | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const d = localStorage.getItem("dismissed_banner");
    if (d) setDismissed(true);
    listMyNotifications().then((res) => {
      const found = (res.data as Notif[]).find((n) => n.type === "warning" || n.type === "feature" || n.type === "info");
      if (found) setItem(found);
    });
  }, []);

  if (dismissed || !item) return null;

  const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.info;
  const Icon = cfg.icon;

  const close = () => {
    localStorage.setItem("dismissed_banner", item.id);
    setDismissed(true);
  };

  return (
    <div className={`w-full ${cfg.bg} ${cfg.border} rounded-xl p-3 mb-6 flex items-center justify-between text-sm`}>
      <div className="flex items-center gap-3">
        <div className={`p-1.5 rounded ${cfg.bg.replace("/10", "/20")}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className={`font-bold ${cfg.text} text-right`}>{item.title}</p>
          <p className={`text-slate-600 text-right text-xs`}>{item.message}</p>
        </div>
      </div>
      <button onClick={close} className={`ml-4 ${cfg.close}`} aria-label="إغلاق الإشعار">
        ✕
      </button>
    </div>
  );
}
