"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Star, LogOut, MessageCircle, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTheme, THEME_META, type ThemeId } from "@/theme/ThemeProvider";
import { NotificationToolsPanel } from "../components/ToolsSection";
import type { ThemeColor, ThemeStyles } from "../components/types";
import { THEME_STYLES } from "../components/theme-helpers";

/* ==========================================================================
   صفحة الإعدادات — /dashboard/settings

   بديل درج الإعدادات الجانبي: صفحة كاملة مستقلة وواضحة.
   الأقسام:
     1) الحساب        → البروفايل (صورة + اسم) + معلومات الحساب
     2) المظهر        → الثيمات (نفس نظام ThemeProvider — بيتحفظ تلقائياً)
     3) التنبيهات     → تذكير السلسلة + Web Push (نفس اللوحة القديمة)
     4) الدعم والمشاركة → مركز دعم MAG + «اكتب رأيك» (نفس نموذج اللاندينج)
     5) آخر الصفحة    → تسجيل الخروج (مودال تأكيد)

   🗓️ ما اتنقلش من الدرج: المكتبة الصوتية (قرآن/موسيقى/صوتياتي).
   القرآن بقى في صفحة العبادات (/worship/quran)، والموسيقى وصوتيات
   المستخدم في «التريكز» (/dashboard/tracks) مع مؤقت المذاكرة.
   ========================================================================== */

/* ألوان السواتش — نفس الثيمات الثمانية المعتمدة في العجلة والدرج القديم.
   الأسماء الإنجليزية قيم محفوظة في قاعدة البيانات ولازم تفضل زي ما هي. */
const THEME_SWATCHES: { id: ThemeId; label: string; accent: string; bg: string }[] = [
  { id: "colorful", label: "ملوّن (حالي)", accent: "#F0D24A", bg: "#0D0906" },
  { id: "crimson", label: "أسود وأحمر", accent: "#E23A3A", bg: "#0a0a0c" },
  { id: "azure", label: "أزرق", accent: "#4FA9F5", bg: "#0A1428" },
  { id: "mono", label: "أبيض ورمادي", accent: "#4B5563", bg: "#F4F5F7" },
  { id: "indigo-light", label: "نيلي فاتح", accent: "#4338CA", bg: "#F3F5FC" },
  { id: "warm-dark", label: "أسود دافي", accent: "#DC4C4C", bg: "#0D0906" },
  { id: "slate", label: "رمادي", accent: "#64748B", bg: "#1A1D23" },
  { id: "deep-green", label: "أخضر داكن", accent: "#10B981", bg: "#0B1A14" },
];

const CARD =
  "rounded-[var(--r-lg)] border border-rule bg-paper-2 p-4 sm:p-5 space-y-3";
const ROW =
  "w-full flex items-center gap-3 p-3 rounded-[var(--r-sm)] border border-rule bg-paper hover:bg-paper-3 transition text-right";
const SECTION_TITLE = "eyebrow eyebrow-flush";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { theme: activeTheme, setTheme: setAppTheme } = useTheme();

  /* ---------- حالة التحميل ---------- */
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [plan, setPlan] = useState("free");
  const [credits, setCredits] = useState<number | null>(null);
  /* لون الفسفوري (amber/emerald/coral/cyan) — محفوظ على profiles.theme
     زي ما الداشبورد بيكتبه. لوحده مش نظام data-theme (ThemeId) اللي
     العجلة ودرج الشكل بيغيّروه — الاتنين بيترقّوا على بعض زي ما كانوا. */
  const [themeColor, setThemeColor] = useState<ThemeColor>("amber");

  /* ---------- تعديل البروفايل ---------- */
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /* ---------- التنبيهات (نفس مفاتيح localStorage بتاعة الداشبورد) ---------- */
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [notifPermission, setNotifPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");

  /* ---------- «اكتب رأيك» — نفس نموذج اللاندينج /api/testimonials ---------- */
  const [rating, setRating] = useState(0);
  const [reviewName, setReviewName] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [sendingReview, setSendingReview] = useState(false);
  const [reviewNotice, setReviewNotice] = useState("");
  const [reviewError, setReviewError] = useState("");

  /* ---------- تسجيل الخروج ---------- */
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) {
          if (!cancelled) router.replace("/login?next=/dashboard/settings");
          return;
        }
        const { data: prof } = await supabase
          .from("profiles")
          .select("public_user_code, avatar_url, display_name, theme")
          .eq("id", user.id)
          .maybeSingle();
        const profileRow = (prof ?? {}) as {
          display_name?: string | null;
          public_user_code?: string | null;
          avatar_url?: string | null;
          theme?: string | null;
        };
        if (!cancelled) {
          setUserId(user.id);
          setEmail(user.email ?? null);
          const displayName =
            profileRow.display_name ??
            ((user.user_metadata?.full_name as string) ?? null);
          setName(displayName);
          setEditName(displayName ?? "");
          setReviewName(displayName ?? "");
          setCode(profileRow.public_user_code ?? null);
          setAvatarUrl(profileRow.avatar_url ?? null);
          const savedColor = profileRow.theme as ThemeColor | null;
          if (savedColor && savedColor in THEME_STYLES) setThemeColor(savedColor);
        }

        // الباقة والرصيد — مسار قائم ومستقل؛ فشله ما يسقطش الصفحة.
        try {
          const qRes = await fetch("/api/me/plan-quota", { credentials: "include" });
          if (qRes.ok) {
            const q = await qRes.json();
            if (!cancelled) {
              if (typeof q?.credits === "number") setCredits(q.credits);
              if (typeof q?.tier === "string" && q.tier) setPlan(q.tier);
            }
          }
        } catch { /* اختياري */ }

        // تفضيلات التنبيهات — نفس مفاتيح الداشبورد عشان الاتنين يتقروا
        // من مكان واحد ولا يبقى الإعدادات بتقول حاجة والداشبورد بيقول تانية.
        try {
          const saved = localStorage.getItem("study_notif_prefs");
          if (saved) {
            const { enabled, time } = JSON.parse(saved);
            if (!cancelled) setReminderTime(time || "20:00");
            if (
              enabled &&
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              if (!cancelled) setNotificationsEnabled(true);
            }
          }
        } catch { /* ignore */ }
        if (typeof window !== "undefined" && "Notification" in window) {
          if (!cancelled) setNotifPermission(Notification.permission);
        } else {
          if (!cancelled) setNotifPermission("unsupported");
        }
      } catch {
        if (!cancelled) setMsg("تعذر تحميل بياناتك. حاول تحديث الصفحة.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, router]);

  /* حفظ تفضيلات التنبيهات — نفس مفتاح الداشبورد بالظبط. */
  useEffect(() => {
    if (loading) return;
    localStorage.setItem(
      "study_notif_prefs",
      JSON.stringify({ enabled: notificationsEnabled, time: reminderTime }),
    );
  }, [notificationsEnabled, reminderTime, loading]);

  /* ---------- تعديل الصورة (نفس منطق صفحة الملف الشخصي) ---------- */
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    setMsg(null);
    try {
      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      const { data: updated, error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", userId)
        .select("id");
      if (updErr) throw updErr;
      if (!updated || updated.length === 0) {
        const { error: insErr } = await supabase
          .from("profiles")
          .insert({ id: userId, avatar_url: url });
        if (insErr) throw insErr;
      }
      setAvatarUrl(url);
      setMsg("تم تحديث الصورة.");
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "تعذر رفع الصورة.");
    } finally {
      setUploading(false);
    }
  }

  /* ---------- حفظ الاسم (profiles.display_name) ---------- */
  async function handleSaveName() {
    if (!userId || !editName.trim()) return;
    setSavingName(true);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: editName.trim() })
        .eq("id", userId);
      if (error) throw error;
      setName(editName.trim());
      setShowProfileModal(false);
      setMsg("تم حفظ الاسم.");
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "تعذر حفظ الاسم.");
    } finally {
      setSavingName(false);
    }
  }

  /* ---------- تفعيل/إلغاء التنبيهات — نفس منطق الداشبورد حرفياً ---------- */
  async function handleToggleNotifications(): Promise<void> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("المتصفح ده لا يدعم التنبيهات.");
      return;
    }
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      // القفل يشيل اشتراك الـ Push من السيرفر كمان — من غيره cron
      // تذكير السلسلة كان هيفضل يبعت إشعارات رغم إن الطالب قفلها.
      void (async () => {
        try {
          const registration = await navigator.serviceWorker?.getRegistration("/sw.js");
          const subscription = await registration?.pushManager.getSubscription();
          await subscription?.unsubscribe();
          await fetch("/api/push/subscribe", { method: "DELETE" });
        } catch (err) {
          console.warn("push unsubscribe failed (متجاهَل):", err);
        }
      })();
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission === "granted") {
      setNotificationsEnabled(true);
      new Notification("🔔 تم تفعيل تذكير الستريك!", {
        body: `هننبهك الساعة ${reminderTime} لو لسه ما ذاكرتش.`,
      });
    } else {
      alert("محتاجين إذنك لإرسال التنبيهات من إعدادات المتصفح.");
    }
  }

  const handleEnableWebPush = async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      alert("المتصفح ده لا يدعم التنبيهات في الخلفية (Web Push).");
      return;
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      alert("⚠️ الميزة دي لسه محتاجة إعداد من ناحية السيرفر (VAPID key + API route).");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      // الـ user_id بياخده السيرفر من الجلسة، فمش بنبعته من هنا
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });
      if (!res.ok) {
        alert("⚠️ مقدرناش نحفظ الاشتراك. تأكد إنك مسجّل دخول وحاول تاني.");
        return;
      }
      alert("🎉 تم تفعيل التنبيهات في الخلفية!");
    } catch (err) {
      console.error("Web Push subscribe failed:", err);
      alert("⚠️ حصل خطأ أثناء تفعيل التنبيهات، حاول تاني.");
    }
  };

  /* ---------- «اكتب رأيك» → POST /api/testimonials ---------- */
  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    setReviewError("");
    setReviewNotice("");
    if (rating < 1 || rating > 5) {
      setReviewError("اختار تقييمًا من نجمة إلى خمس نجوم.");
      return;
    }
    setSendingReview(true);
    try {
      const response = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, displayName: reviewName, comment: reviewComment }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setReviewError(data?.error ?? "تعذر إرسال رأيك، حاول تاني.");
        return;
      }
      setReviewNotice("شكراً ليك! رأيك وصل وهيظهر في الصفحة الرئيسية بعد المراجعة.");
      setRating(0);
      setReviewComment("");
    } catch {
      setReviewError("تعذر إرسال رأيك، حاول تاني.");
    } finally {
      setSendingReview(false);
    }
  }

  /* ---------- تسجيل الخروج ---------- */
  async function handleSignOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.replace("/login");
    } catch {
      setSigningOut(false);
      setShowLogoutModal(false);
      setMsg("تعذر تسجيل الخروج، حاول تاني.");
    }
  }

  const themeStyles: ThemeStyles = THEME_STYLES[themeColor];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-rule border-t-redpen rounded-full animate-spin mx-auto" />
          <p className="tag justify-center">بيحمّل إعداداتك</p>
        </div>
      </div>
    );
  }

  const initial = (name || email || "U").charAt(0).toUpperCase();

  return (
    <main className="min-h-screen bg-paper" dir="rtl">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-5">
        {/* ---- الترويسة ---- */}
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className={SECTION_TITLE}>الإعدادات</p>
            <h1 className="h2 m-0">كل أدواتك في مكان واحد</h1>
          </div>
          <Link
            href="/dashboard"
            className="btn btn-quiet text-sm shrink-0"
          >
            ← رجوع للداشبورد
          </Link>
        </header>

        {/* ---- البروفايل ---- */}
        <section className={CARD} aria-label="البروفايل">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="الصورة الشخصية"
                  className="w-16 h-16 rounded-full object-cover border-2 border-rule"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-paper-3 border-2 border-rule grid place-items-center text-xl font-bold text-ink">
                  {initial}
                </div>
              )}
              <label
                className="absolute -bottom-1 -left-1 cursor-pointer rounded-full bg-[var(--color-primary,#DC4C4C)] text-onmarker w-7 h-7 grid place-items-center shadow transition hover:opacity-90"
                title="تغيير الصورة"
              >
                {uploading ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Camera className="h-3.5 w-3.5" aria-hidden />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                />
              </label>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink truncate">{name || "—"}</p>
              <p className="text-xs text-ink-soft truncate" dir="ltr">{email || "—"}</p>
              <span className="tag tag-box mt-1.5 inline-block">{plan}</span>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <button
              onClick={() => setShowProfileModal(true)}
              className={ROW}
            >
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink">تغيير البروفايل</span>
                <span className="block text-[11px] text-ink-soft">الصورة والاسم</span>
              </span>
              <span className="mono text-ink-soft shrink-0" aria-hidden>←</span>
            </button>
            <dl className="m-0 rounded-[var(--r-sm)] border border-rule bg-paper px-3 py-1 divide-y divide-rule">
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="tag">MAG ID</dt>
                <dd className="m-0 mono text-xs text-ink truncate" dir="ltr">{code || "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="tag">رصيد الكريدت</dt>
                <dd className="m-0 mono text-xs font-bold text-ink" dir="ltr">
                  {credits === null ? "—" : credits.toLocaleString("ar-EG")}
                </dd>
              </div>
            </dl>
            <Link href="/dashboard/credits" className={ROW}>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink">تفاصيل الكريديت والاستهلاك</span>
                <span className="block text-[11px] text-ink-soft">الرصيد والاستهلاك الشهري وتاريخ انتهاء الباقة</span>
              </span>
              <span className="mono text-ink-soft shrink-0" aria-hidden>←</span>
            </Link>
            <Link href="/dashboard/profile" className={ROW}>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink">صفحة الملف الشخصي الكاملة</span>
                <span className="block text-[11px] text-ink-soft">الاشتراك والحصص والمزيد</span>
              </span>
              <span className="mono text-ink-soft shrink-0" aria-hidden>←</span>
            </Link>
          </div>
        </section>

        {/* ---- المظهر ---- */}
        <section className={CARD} aria-label="المظهر">
          <p className={SECTION_TITLE}>المظهر</p>
          <p className="text-xs leading-5 text-ink-soft m-0">
            اختر مظهر الداشبورد — بيتحفظ تلقائياً
          </p>
          <div className="flex items-center gap-3 flex-wrap" role="group" aria-label="اختيار الثيم">
            {THEME_SWATCHES.map((sw) => {
              const selected = activeTheme === sw.id;
              return (
                <button
                  key={sw.id}
                  type="button"
                  onClick={() => setAppTheme(sw.id)}
                  aria-label={sw.label}
                  aria-pressed={selected}
                  title={sw.label}
                  className={`relative h-10 w-10 shrink-0 rounded-full border-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                    selected
                      ? "border-[var(--accent)] shadow-[0_0_0_3px_var(--card-secondary,#2c261f)]"
                      : "border-[var(--card-secondary,#2c261f)] hover:border-[var(--accent-highlight)]"
                  }`}
                  style={{ backgroundColor: sw.accent }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-[6px] rounded-full"
                    style={{ backgroundColor: sw.bg, opacity: 0.18 }}
                  />
                  {selected && (
                    <span aria-hidden className="absolute inset-0 grid place-items-center text-[11px] font-bold text-white drop-shadow">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mono text-[11px] text-ink-soft m-0">
            الحالي: {THEME_SWATCHES.find((t) => t.id === activeTheme)?.label ?? THEME_META[activeTheme as ThemeId]?.label ?? activeTheme}
          </p>
        </section>

        {/* ---- التنبيهات — نفس اللوحة القديمة ---- */}
        <section className={CARD} aria-label="التنبيهات">
          <p className={SECTION_TITLE}>التنبيهات</p>
          <NotificationToolsPanel
            themeStyles={themeStyles}
            notificationsEnabled={notificationsEnabled}
            onToggleNotifications={() => void handleToggleNotifications()}
            reminderTime={reminderTime}
            onChangeReminderTime={setReminderTime}
            notifPermission={notifPermission}
            onEnableWebPush={() => void handleEnableWebPush()}
          />
        </section>

        {/* ---- الدعم والمشاركة ---- */}
        <section className={CARD} aria-label="الدعم والمشاركة">
          <p className={SECTION_TITLE}>الدعم والمشاركة</p>

          <Link href="/dashboard/support" className={ROW}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] bg-paper-3 text-[var(--color-primary,#DC4C4C)]">
              <MessageCircle className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-ink">تواصل مع الدعم</span>
              <span className="block text-[11px] text-ink-soft">تابع طلباتك وردود فريق الدعم أو ابدأ محادثة جديدة</span>
            </span>
            <span className="mono text-ink-soft shrink-0" aria-hidden>←</span>
          </Link>

          {/* «اكتب رأيك» — نفس نموذج اللاندينج (Testimonials) وبيبعت لنفس
              الـ API. الرأي بيبان في اللاندينج بعد المراجعة (is_published). */}
          <form onSubmit={handleReviewSubmit} className="rounded-[var(--r-sm)] border border-rule bg-paper p-3 space-y-2.5">
            <p className="text-sm font-semibold text-ink m-0">اكتب رأيك</p>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="التقييم">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} نجوم`}
                  onClick={() => setRating(n)}
                  className="p-0.5 transition hover:scale-110"
                >
                  <Star
                    size={22}
                    className={n <= rating ? "text-amber-400 fill-amber-400" : "text-ink-soft/40"}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
            <label className="block">
              <span className="sr-only">اسمك</span>
              <input
                type="text"
                value={reviewName}
                onChange={(e) => setReviewName(e.target.value)}
                placeholder="اسمك (اختياري)"
                className="field"
                maxLength={60}
              />
            </label>
            <label className="block">
              <span className="sr-only">رأيك</span>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="إيه اللي عجبك؟ وإيه اللي تحب نحسّنه؟"
                className="field resize-none"
                rows={3}
                maxLength={700}
              />
            </label>
            {reviewError && <p className="text-[11px] text-red-400 m-0" role="alert">{reviewError}</p>}
            {reviewNotice && <p className="text-[11px] text-emerald-400 m-0" role="status">{reviewNotice}</p>}
            <button
              type="submit"
              disabled={sendingReview}
              className="btn btn-marker btn-block text-sm disabled:opacity-45"
            >
              {sendingReview ? "جاري الإرسال…" : "إرسال الرأي"}
            </button>
          </form>
        </section>

        {/* ---- تسجيل الخروج — آخر الصفحة عشان ما يتضغطش بالغلط ---- */}
        <section aria-label="تسجيل الخروج">
          <button
            onClick={() => setShowLogoutModal(true)}
            className="w-full flex items-center justify-center gap-2.5 p-3.5 rounded-[var(--r-sm)] border border-red-500/40 bg-red-950/30 text-red-400 hover:bg-red-950/50 transition text-sm font-bold"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            تسجيل الخروج
          </button>
        </section>

        {msg && <p className="text-sm text-ink-soft text-center">{msg}</p>}
      </div>

      {/* ---- مودال تعديل البروفايل ---- */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4">
          <div className="sheet-card card-lift p-6 w-full max-w-md space-y-4">
            <div>
              <p className="eyebrow eyebrow-flush mb-1.5">تعديل</p>
              <h3 className="h3">تغيير البروفايل</h3>
            </div>
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-rule" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-paper-3 border-2 border-rule grid place-items-center font-bold text-ink">
                  {initial}
                </div>
              )}
              <label className="btn btn-quiet text-sm cursor-pointer">
                <Camera className="h-4 w-4 inline-block ml-1.5 -mt-0.5" aria-hidden />
                {uploading ? "جاري الرفع…" : "تغيير الصورة"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploading}
                />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="tag">الاسم</span>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="field"
                maxLength={60}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowProfileModal(false)}
                disabled={savingName || uploading}
                className="btn btn-quiet text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={() => void handleSaveName()}
                disabled={savingName || uploading || !editName.trim()}
                className="btn btn-marker text-sm"
              >
                {savingName ? "بيحفظ" : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- مودال تأكيد تسجيل الخروج ---- */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4">
          <div className="sheet-card card-lift p-6 w-full max-w-sm space-y-4 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-950/40 border border-red-500/40 text-red-400">
              <LogOut className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="eyebrow eyebrow-flush mb-1.5 justify-center">تأكيد</p>
              <h3 className="h3">تسجيل الخروج؟</h3>
              <p className="text-xs text-ink-soft leading-relaxed mt-1">
                هتخرج من حسابك وتحتاج تسجل دخول تاني. خطتك وسلسلتك بتفضل محفوظة.
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setShowLogoutModal(false)}
                disabled={signingOut}
                className="btn btn-quiet text-sm"
              >
                رجوع
              </button>
              <button
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="btn text-sm bg-red-500 text-white hover:opacity-90 disabled:opacity-45"
              >
                {signingOut ? "جاري الخروج…" : "خروج"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}