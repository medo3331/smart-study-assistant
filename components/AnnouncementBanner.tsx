"use client";

import { useEffect, useState } from "react";
import { listMyNotifications } from "@/app/dashboard/actions/support";

type Notif = { id: string; title: string; message: string; type: string };

export default function AnnouncementBanner() {
  const [item, setItem] = useState<Notif | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const d = localStorage.getItem("dismissed_banner");
    if (d) setDismissed(true);
    listMyNotifications().then((res) => {
      const found = (res.data as Notif[]).find((n) => n.type === "warning" || n.type === "feature");
      if (found) setItem(found);
    });
  }, []);

  if (dismissed || !item) return null;

  const close = () => {
    localStorage.setItem("dismissed_banner", item.id);
    setDismissed(true);
  };

  return (
    <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <div>
        <span className="font-bold">{item.title}</span> — {item.message}
      </div>
      <button onClick={close} className="text-amber-300 hover:text-amber-100">✕</button>
    </div>
  );
}
