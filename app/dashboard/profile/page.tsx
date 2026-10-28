"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [quota, setQuota] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) { if (!cancelled) setLoading(false); return; }
        if (!cancelled) {
          setEmail(user.email ?? null);
          setName((user.user_metadata?.full_name as string) ?? null);
        }
        const { data: prof } = await supabase.from("profiles").select("public_user_code, avatar_url, full_name").eq("id", user.id).maybeSingle();
        if (!cancelled && prof) {
          setCode((prof as any).public_user_code ?? null);
          setAvatarUrl((prof as any).avatar_url ?? null);
          if ((prof as any).full_name) setName((prof as any).full_name);
        }
        const res = await fetch("/api/usage", { credentials: "include" });
        if (res.ok) {
          const j = await res.json();
          if (!cancelled) { setPlan(j.planKey ?? "free"); setQuota(j); }
        }
      } catch { if (!cancelled) setMsg("Failed to load profile."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) throw new Error("not authenticated");
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      setAvatarUrl(url);
      setMsg("Avatar updated.");
    } catch (err: any) {
      setMsg(err?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <div className="p-6">Loading profile…</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="avatar" className="w-20 h-20 rounded-full object-cover border" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-2xl">{(name || email || "U").charAt(0).toUpperCase()}</div>
        )}
        <div>
          <label className="text-sm cursor-pointer text-blue-600">
            {uploading ? "Uploading…" : "Change photo"}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-2">
        <div><span className="font-semibold">Name:</span> {name || "—"}</div>
        <div><span className="font-semibold">Email:</span> {email || "—"}</div>
        <div><span className="font-semibold">MAG ID:</span> {code || "—"}</div>
        <div><span className="font-semibold">Plan:</span> {plan}</div>
      </div>

      {quota && (
        <div className="rounded-xl border p-4 space-y-3">
          <h2 className="font-semibold">Message Quota</h2>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Daily</span>
              <span>{quota.daily.used} / {quota.daily.limit === -1 ? "∞" : quota.daily.limit}</span>
            </div>
            <div className="h-2 w-full rounded bg-gray-200 overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${quota.daily.limit > 0 ? Math.min(100, (quota.daily.used / quota.daily.limit) * 100) : 0}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Monthly</span>
              <span>{quota.monthly.used} / {quota.monthly.limit === -1 ? "∞" : quota.monthly.limit}</span>
            </div>
            <div className="h-2 w-full rounded bg-gray-200 overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${quota.monthly.limit > 0 ? Math.min(100, (quota.monthly.used / quota.monthly.limit) * 100) : 0}%` }} />
            </div>
          </div>
        </div>
      )}

      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </div>
  );
}
