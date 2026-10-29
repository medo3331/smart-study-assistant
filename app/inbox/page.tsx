"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function InboxPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("user_inbox")
        .select("id, subject, body, is_read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setItems(data || []);
      setLoading(false);
    })();
  }, []);

  async function markRead(id: string) {
    const supabase = createClient();
    await supabase.from("user_inbox").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
  }

  if (loading) return <div className="p-6">جاري التحميل...</div>;
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">صندوق الرسائل</h1>
      {items.length === 0 ? <p>لا توجد رسائل.</p> : null}
      {items.map((m) => (
        <div key={m.id} className="rounded border border-slate-700 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{m.subject}</h2>
            {!m.is_read ? (
              <button onClick={() => markRead(m.id)} className="text-xs text-amber-400">تحديد كمقروء</button>
            ) : (
              <span className="text-xs text-slate-500">مقروء</span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{m.body}</p>
          <p className="mt-2 text-[11px] text-slate-500">{new Date(m.created_at).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}
