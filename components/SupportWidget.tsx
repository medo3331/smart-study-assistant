"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// الرقم الافتراضي هو نفس واتساب التواصل الموجود في lib/site-links.ts.
// تقدر تغيّره في Vercel بمتغير NEXT_PUBLIC_SUPPORT_WHATSAPP كرابط wa.me كامل.
const SUPPORT_WHATSAPP =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() ||
  process.env.NEXT_PUBLIC_WHATSAPP_URL?.trim() ||
  "https://wa.me/201204556797";

/** أنواع المشكلات — القيمة بتتخزن كـ category في جدول support_tickets. */
const ISSUE_TYPES = [
  { value: "login", label: "مشكلة في تسجيل الدخول أو التسجيل" },
  { value: "account", label: "مشكلة في الحساب أو كلمة السر" },
  { value: "payment", label: "مشكلة في الاشتراك أو المميزات" },
  { value: "bug", label: "خطأ أو ميزة مش شغالة" },
  { value: "content", label: "مشكلة في المحتوى أو الدروس" },
  { value: "performance", label: "بطء أو مشاكل أداء" },
  { value: "other", label: "مشكلة أخرى" },
] as const;

const MAX_DETAILS_CHARS = 1000;

/**
 * بيفتح نافذة الدعم من أي مكان في التطبيق (مع تعبئة تلقائية للتفاصيل).
 *
 * الاستخدام: زرار «محتاج مساعدة؟» تحت رسائل الأخطاء — بيبلّغ الودجت عبر
 * custom event لأنها عايشة في الـ layout مش جنب الرسالة نفسها.
 */
export function openSupport(prefill = "") {
  window.dispatchEvent(
    new CustomEvent<{ prefill: string }>("ssa:open-support", {
      detail: { prefill },
    })
  );
}

function whatsappLink(details: string) {
  const message = [
    "أهلاً، أحتاج مساعدة في موقع ماجيكلي.",
    details.trim() ? `المشكلة: ${details.trim()}` : null,
    typeof window !== "undefined" ? `الصفحة: ${window.location.pathname}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const separator = SUPPORT_WHATSAPP.includes("?") ? "&" : "?";
  return `${SUPPORT_WHATSAPP}${separator}text=${encodeURIComponent(message)}`;
}

/**
 * قناة دعم ذكية:
 *   • تذكرة في جدول support_tickets (اختيار نوع المشكلة + التفاصيل) —
 *     للمستخدمين المسجّلين، وبيوصلهم ردود فريق الدعم.
 *   • واتساب كخيار مباشر للجميع (بما فيهم الزوار).
 */
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(ISSUE_TYPES[0].value);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();

  // أي مكان في التطبيق يقدر يفتح النافذة (ويفتحها بتفاصيل معبّأة)
  useEffect(() => {
    const onOpen = (event: Event) => {
      const prefill = (event as CustomEvent<{ prefill?: string }>).detail?.prefill ?? "";
      setOpen(true);
      setSent(false);
      setError(null);
      if (prefill) setDetails(prefill.slice(0, MAX_DETAILS_CHARS));
    };
    window.addEventListener("ssa:open-support", onOpen);
    return () => window.removeEventListener("ssa:open-support", onOpen);
  }, []);

  // في الداشبورد الرئيسي (/dashboard) فيه زرار "اسأل ماجيكلي" (الشات بوت)
  // في نفس الكورنر + ودجت الرأي، فبنخفي الدعم هنا عشان مايتراكبوش.
  // بيفضل ظاهر في كل باقي الصفحات (اللاندينج، الدخول، الدروس… إلخ).
  // ⚠️ الشرط ده لازم يفضل بعد كل الـ hooks فوقه (قواعد React).
  if (pathname === "/dashboard") return null;

  async function handleCreateTicket() {
    if (sending) return;
    const text = details.trim();
    if (text.length < 10) {
      setError("اكتب تفاصيل المشكلة (10 حروف على الأقل) عشان نقدر نساعدك.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("لازم تسجّل دخولك الأول عشان التذكرة توصلك بحسابك — أو كلّمنا على واتساب.");
        return;
      }

      const typeLabel =
        ISSUE_TYPES.find((t) => t.value === category)?.label ?? "مشكلة أخرى";
      const { error: insertError } = await supabase.from("support_tickets").insert({
        user_id: user.id,
        category,
        title: typeLabel,
        description: `الصفحة: ${pathname}\n\n${text}`,
      });

      if (insertError) {
        console.error("support ticket insert failed:", insertError.message);
        setError("مقدرناش نحفظ التذكرة دلوقتي — جرّب تاني أو كلّمنا على واتساب.");
        return;
      }

      setSent(true);
      setDetails("");
    } catch (err) {
      console.error("support ticket error:", err);
      setError("حصل خطأ غير متوقع — جرّب تاني.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed end-4 bottom-4 z-40 sm:end-6" dir="rtl">
      {open && (
        <section className="sheet-card card-lift mb-3 w-[min(22rem,calc(100vw-2rem))] p-4" aria-labelledby="support-title">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 id="support-title" className="text-sm font-bold text-ink">محتاج مساعدة؟</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                اختر نوع المشكلة واكتب تفاصيلها — هتتحفظ كتذكرة دعم يرد عليها الفريق.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="mono px-1 text-ink-soft hover:text-ink" aria-label="إغلاق الدعم">✕</button>
          </div>

          {sent ? (
            <p className="text-xs leading-relaxed text-ink" role="status">
              <span className="text-base me-1" aria-hidden>✓</span>
              وصلتنا تذكرتك — هنرد عليك من داخل التطبيق أو على إيميلك.
            </p>
          ) : (
            <>
              <label htmlFor="support-category" className="mb-1 block text-xs font-bold text-ink">
                نوع المشكلة
              </label>
              <select
                id="support-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="field mb-3 w-full text-xs"
              >
                {ISSUE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>

              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value.slice(0, MAX_DETAILS_CHARS))}
                className="field min-h-24 w-full resize-none text-xs"
                placeholder="اكتب اللي حصل بالتفصيل — مثال: بعد ما ضغطت على دخول ظهرت رسالة…"
                maxLength={MAX_DETAILS_CHARS}
              />

              <p className="my-3 text-[11px] leading-relaxed text-ink-soft">
                سنضيف مسار الصفحة للتذكرة، ولن نرسل كلمات السر أو المفاتيح.
              </p>

              {error && (
                <p className="mb-3 text-[11px] leading-relaxed text-red-500" role="alert">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleCreateTicket}
                disabled={sending}
                className="btn btn-marker mb-2 block w-full py-2 text-center text-sm"
              >
                {sending ? "جاري الإرسال…" : "ابعت تذكرة دعم"}
              </button>

              <a
                href={whatsappLink(details)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-quiet block w-full py-2 text-center text-sm"
              >
                <span aria-hidden>💬</span> أو تواصل على واتساب
              </a>
            </>
          )}
        </section>
      )}
      <button type="button" onClick={() => setOpen(true)} className="btn btn-quiet rounded-full px-4 py-2 text-sm shadow-lg" aria-expanded={open}>
        <span aria-hidden>🛟</span> مساعدة
      </button>
    </div>
  );
}
