"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { listMyNotifications, markNotificationRead, deleteMyNotification } from "@/app/dashboard/actions/support";

type Notif = { id: string; title: string; message: string; type: string; is_read: boolean; created_at: string };

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);

  const load = async () => {
    const res = await listMyNotifications();
    setItems(res.data as Notif[]);
  };

  useEffect(() => { load(); }, []);

  const unread = items.filter((n) => !n.is_read).length;

  const markRead = async (id: string) => {
    await markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const remove = async (id: string) => {
    await deleteMyNotification(id);
    setItems((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative rounded-full p-2 hover:bg-slate-800" aria-label="إشعارات">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl text-right">
          <p className="mb-2 text-xs font-bold text-amber-300 text-right">الإشعارات</p>
          {items.length === 0 && <p className="text-xs text-slate-400 text-right">لا توجد إشعارات</p>}
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {items.slice(0, 5).map((n) => (
              <li key={n.id} className={`rounded-lg p-2 text-xs ${n.is_read ? "bg-slate-800/50" : "bg-slate-800"}`}>
                <div className="font-bold text-right">{n.title}</div>
                <div className="text-slate-300 text-right">{n.message}</div>
                <div className="mt-1 flex gap-2 justify-end">
                  {!n.is_read && <button onClick={() => markRead(n.id)} className="text-[10px] text-emerald-400">تعليم كمقروء</button>}
                  <button onClick={() => remove(n.id)} className="text-[10px] text-rose-400">حذف</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
