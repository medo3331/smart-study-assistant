"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BrandGlyph } from "@/components/BrandLogo";
import { SITE_NAME, SITE_NAME_EN } from "@/lib/seo";
import { performNavAction } from "@/lib/nav-actions";
import { siteNavbarVisible } from "@/components/UnifiedNavbar";
import { useIsOwner } from "./use-is-owner";
import type { ThemeStyles } from "./types";
import {
  NAV_GROUPS,
  activeNavId,
  railAccountFromUser,
  type NavItemDef,
  type NavSignal,
  type RailAccount,
} from "./nav-config";
import { NAV_ICONS } from "./nav-icons";

/* --------------------------------------------------------------------------
   أيقونات الأقسام والبنود

   ⚠️ الخريطة نفسها في `nav-icons.ts` — منفصلة عشان الشريط العلوي
      (`SiteNavbar`) بيستخدمها كمان من غير ما يسحب `framer-motion`.
   -------------------------------------------------------------------------- */

/** كل الأقسام مفتوحة أول مرة — المستخدم يشوف كل حاجة قبل ما يقرر يقفل. */
const DEFAULT_OPEN_GROUPS: string[] = NAV_GROUPS.map((group) => group.id);

/* ==========================================================================
   قايمة التنقل — فهرس الملزمة

   ⚠️ دي القايمة الوحيدة في المنتج. الشريط العلوي اللي كان في الداشبورد
   (طوارئ / المزيد / الإعدادات / زرار الحساب) اتشال بالكامل في ٨ أغسطس،
   وبنوده نزلت هنا. فأي أداة جديدة مكانها nav-config.ts — مش ترويسة جديدة.

   على الشاشات الكبيرة شريط ثابت، وعلى الموبايل زرار بيفتح نفس القايمة درج.
   البنود نفسها متعرّفة في nav-config.ts — الملف ده رسم بس.

   الكومبوننت ده بيستعمل في الداشبورد وفي كل صفحاتها الفرعية. الفرق:
   الداشبورد بتبعت onSignal عشان تفتح مودالاتها بنفسها، والصفحات الفرعية
   مابتبعتش حاجة — فالبند بيكتب نيته وينقل للداشبورد وهي بتكمّل.
   ========================================================================== */

/** رقمين بيتعرضوا في لوحة الحساب لما تتفتح. اختياري كله: الصفحات الفرعية
    مابتعرفش المستوى، فبتسيبه فاضي واللوحة بتفتح على تسجيل الخروج بس.

    ⚠️ ١١ أغسطس: النوع ده كان فيه `xpRemaining` و`currentLevelProgress`
    كمان، لكارت «كمّل» اللي كان تحت القايمة. الكارت اتشال والحقلين اتشالوا
    معاه — النوع بيوصف اللي الكومبوننت محتاجه فعلاً، مش اللي الداشبورد
    بتحسبه. التقدّم لسه بيتعرض كامل في `StatsSection` جوه الصفحة. */
export interface RailMotivation {
  level: number;
  streak?: number;
}

interface NavRailProps {
  themeStyles: ThemeStyles;
  /** بتتبعت من صفحة الداشبورد بس — بتفتح المودال على طول من غير تنقّل */
  onSignal?: (signal: NavSignal) => void;
  motivation?: RailMotivation;
  /**
   * بيانات كارت الحساب. الداشبورد بتبعتها لأنها محمّلة المستخدم أصلاً؛
   * الصفحات الفرعية بتسيبها فاضية والشريط بيجيبها لنفسه بنداء واحد.
   */
  account?: RailAccount | null;
  /** وضع الطوارئ شغّال؟ الداشبورد بس هي اللي بتعرف. */
  emergencyOn?: boolean;
  /** فيه صوت شغّال؟ نقطة صغيرة على بند الإعدادات. */
  audioOn?: boolean;
}

/** بيجيب الحساب بنفسه — بس لو حد ما بعتهوش. الصفحات الفرعية مش عايزة
    تعمل استعلام كامل عشان اسم في كارت، ونداء `getUser` رخيص وكفاية. */
function useSelfAccount(enabled: boolean): RailAccount | null {
  const [account, setAccount] = useState<RailAccount | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (alive) setAccount(railAccountFromUser(data.user));
      })
      .catch(() => {
        // مفيش جلسة أو الشبكة فصلت — الكارت يختفي وبس
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return account;
}

/* ⚠️ فلترة بند لوحة الأدمن (`ownerOnly`) بتستخدم `useIsOwner` من
   `use-is-owner.ts` — نفس الـ Hook ونفس الـ endpoint اللي بيستخدمهم
   الشريط العلوي (`SiteNavbar`). مافيش fetch تاني. */

export function NavRail({
  themeStyles,
  onSignal,
  motivation,
  account,
  emergencyOn = false,
  audioOn = false,
}: NavRailProps) {
  const router = useRouter();
  const pathname = usePathname();

  // هل الشريط العلوي العام موجود فوقRail في الصفحة دي؟ لو موجود،
  // الـ rail لازم ينزل تحتّه (هو fixed — فمش هيزحّ لوحده).
  const hasSiteNavbar = siteNavbarVisible(pathname ?? "/");

  // البند النشط: المسار هو الحقيقة. بنود القسم (الملاحظات/التحليلات)
  // مالهاش مسار، فبتتعلّم بالضغط — وده بيتصفّر أول ما تسيب الصفحة.
  const [clickedId, setClickedId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // 🗂️ الأقسام المفتوحة. الحالة هنا (مش جوه كل قسم) عشان لو قفلت قسم
  // وفتحت التاني، الأول يفضل مقفول — كل مجموعة مستقلة عن التانية.
  const [openGroups, setOpenGroups] = useState<string[]>(DEFAULT_OPEN_GROUPS);

  const selfAccount = useSelfAccount(account === undefined);
  const acct = account ?? selfAccount;
  const isOwner = useIsOwner();

  const routeIdRaw = activeNavId(pathname ?? "");
  const routeId = pathname?.startsWith("/admin") ? "admin" : routeIdRaw;
  const onDashboard = pathname === "/dashboard";
  const activeId = onDashboard ? clickedId ?? routeId : routeId;

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const drawerRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  // درج الموبايل مودال حقيقي (aria-modal)، فلازم يتصرف كده: Escape بيقفله،
  // الصفحة ورا الدرج ماتسكرولش، والـ Tab مايخرجش منه. الشريط الثابت على
  // الشاشات الكبيرة مش مودال — هو جزء من الصفحة — فالسلوك ده للموبايل بس.
  useEffect(() => {
    if (!isMenuOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
        return;
      }
      if (e.key !== "Tab") return;

      // حبس التركيز: من غيره الـ Tab بيمشي على الصفحة اللي ورا الحجاب
      // وهي مش شايفاها، فالمستخدم بيتوه في عناصر مخفية بصرياً.
      const root = drawerRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.getAttribute("aria-disabled") !== "true");
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // التركيز يدخل الدرج أول ما يفتح، ويرجع لزرار ☰ أول ما يقفل — من غير
    // كده التركيز بيفضل واقف على زرار مش موجود في الشاشة.
    const trigger = menuBtnRef.current;
    const frame = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>("button")?.focus();
    });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.cancelAnimationFrame(frame);
      trigger?.focus();
    };
  }, [isMenuOpen]);

  const isDim = (_item: NavItemDef) => {
    void _item;
    return false;
  };

  const handleClick = (item: NavItemDef) => {
    if (isDim(item)) return;

    // ⚠️ السلوك نفسه (صفحة / قسم / مودال) في `lib/nav-actions.ts` — الشريط
    //    العلوي بيستدعي نفس الدالة، فمافيش نسختين تختلف من أول تعديل.
    performNavAction(item, {
      pathname: pathname ?? "",
      navigate: (href) => router.push(href),
      onSignal,
      onActiveChange: (id) => setClickedId(id),
      onNavigate: () => setIsMenuOpen(false),
    });
  };

  async function handleSignOut(): Promise<void> {
    await createClient().auth.signOut();
    // بعد الخروج: شاشة الترحيب هي البداية الطبيعية للتدفّق الجديد.
    router.push("/welcome");
  }

  /* ---- بند واحد في القايمة ---- */
  const renderItem = (item: NavItemDef) => {
    const dim = isDim(item);
    const danger = item.tone === "danger";
    const Icon = NAV_ICONS[item.icon];
    // الطوارئ مفتاح مش صفحة: «مفتوح» عنده معناها «شغّال»، فبياخد
    // aria-pressed بدل aria-current — ده الفرق الوحيد بينه وبين الباقي.
    const isToggle = item.id === "emergency";
    const isOn = isToggle && emergencyOn;
    const isActive = isOn || (!isToggle && activeId === item.id);
    // بند قسم مش صفحة، فـ "location" أدق من "page" — الاتنين مفهومين
    // لقارئ الشاشة بس "page" بيوعد بتنقّل مش بيحصل هنا.
    const current = !isToggle && isActive ? (item.scrollTo ? "location" : "page") : undefined;

    return (
      <li key={item.id}>
        <button
          type="button"
          onClick={() => handleClick(item)}
          // aria-disabled مش disabled: البند يفضل في مسار الـ Tab فقارئ
          // الشاشة يعرف إن المساعد موجود بس مقفول لحد ما تبقى فيه خطة.
          aria-disabled={dim || undefined}
          aria-current={current}
          aria-pressed={isToggle ? isOn : undefined}
          className={`relative w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-[var(--r-sm)] text-right transition-colors duration-150 ${
            dim
              ? "opacity-45 cursor-default text-ink-soft"
              : isOn
              ? "bg-red-500 text-ondanger"
              : isActive
              ? `${themeStyles.lightBg} text-ink`
              : danger
              ? "text-red-400 hover:bg-red-950"
              : "text-ink-soft hover:bg-paper-3 hover:text-ink"
          }`}
        >
          {/* الضربة الجانبية = علامة الصفحة المفتوحة في الملزمة */}
          {isActive && !isOn && (
            <span
              aria-hidden
              className={`absolute inset-y-1.5 w-[3px] rounded-full ${themeStyles.accentBg}`}
              style={{ insetInlineEnd: "-6px" }}
            />
          )}
          <Icon
            aria-hidden
            size={17}
            strokeWidth={isActive ? 2.2 : 1.8}
            className={`shrink-0 ${dim ? "opacity-60" : ""}`}
          />
          {/* الاسم ثابت مهما كانت الحالة: aria-pressed هو اللي بيقول شغّال
              ولا لأ. لو الاسم نفسه بيتغيّر، قارئ الشاشة بيقرا زرار جديد. */}
          <span className="flex-1 min-w-0 text-sm font-semibold truncate">{item.label}</span>
          {isOn && <span className="tag tag-box shrink-0 border-current">شغّال</span>}
          {/* نقطة الصوت على الإعدادات: كانت على زرار الترويسة القديم،
              والإعدادات هي نفس الدرج اللي فيه مفتاح الصوت. */}
          {item.signal === "settings" && audioOn && (
            <>
              <span aria-hidden className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="sr-only">فيه صوت شغّال</span>
            </>
          )}
          {dim ? (
            <span className="tag tag-quiet shrink-0">قريباً</span>
          ) : (
            <span
              className={`mono text-[0.62rem] shrink-0 hidden xl:inline ${
                isOn ? "text-ondanger/70" : "text-ink-soft/70"
              }`}
            >
              {item.latin}
            </span>
          )}
        </button>
      </li>
    );
  };

  /* ---- جسم القايمة: نفس المحتوى بالظبط في الشريط الثابت وفي درج الموبايل ----
     كل قسم زرار قابل للطي؛ لوحة البنود تفضل مركّبة و`hidden` هي اللي
     بتخفيها عشان `aria-controls` يفضل شغّال، والأهم إن أي حالة جوه البند
     (زي مؤشر الصوت) ما تتفكّش مع القفل والفتح. */
  const renderNavBody = (scope: "rail" | "drawer") => (
    <div className="p-3 space-y-1.5">
      {NAV_GROUPS.map((group) => {
        // لوحة الأدمن ownerOnly — بتتشال من القايمة قبل ما تترسم.
        const items = group.items.filter((item) => !item.ownerOnly || isOwner);
        if (items.length === 0) return null;

        const open = openGroups.includes(group.id);
        const GroupIcon = NAV_ICONS[group.icon];
        const groupActive = items.some((item) => item.id === activeId);
        const panelId = `nav-group-${scope}-${group.id}`;

        return (
          <div key={group.id} className="rounded-[var(--r-sm)]">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={open}
              aria-controls={panelId}
              className={`w-full flex items-center gap-2.5 px-3 py-2 min-h-[40px] rounded-[var(--r-sm)] text-right transition-colors duration-150 hover:bg-paper-3 ${
                groupActive ? "text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              <GroupIcon
                aria-hidden
                size={15}
                strokeWidth={1.8}
                className={`shrink-0 ${groupActive ? themeStyles.accentText : ""}`}
              />
              <span className="flex-1 min-w-0 text-xs font-bold truncate">{group.title}</span>
              {/* القسم مقفول وفيه الصفحة الحالية؟ نقطة صغيرة تقول كده. */}
              {groupActive && !open && (
                <span
                  aria-hidden
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${themeStyles.accentBg}`}
                />
              )}
              <span className="mono text-[0.58rem] text-ink-soft/60 hidden xl:inline truncate max-w-[5.5rem]">
                {group.latin}
              </span>
              <ChevronDown
                aria-hidden
                size={14}
                className={`shrink-0 text-ink-soft transition-transform duration-200 ${
                  open ? "" : "-rotate-90"
                }`}
              />
            </button>

            <div id={panelId} hidden={!open} className="pt-0.5 pb-1">
              <ul aria-label={group.title} className="space-y-0.5 list-none m-0 p-0">
                {items.map(renderItem)}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );

  /* ---- 🗓️ ١١ أغسطس: كارت «كمّل» اتشال ----
     كان تحت القايمة وبيقول «فاضلك N نقطة توصل المستوى X» بمسطرة تقدّم.
     طلب صريح من المستخدم يتشال. المستوى والسلسلة لسه في لوحة الحساب تحت،
     والتقدّم الكامل في `StatsSection` جوه الصفحة — فمفيش معلومة ضاعت،
     اللي اتشال هو التكرار التالت. الكلاس `.motiv-card` اتشال من globals.css
     في نفس الوقت لأنه مكان واحد بس كان بيستعمله. */

  /* ---- كارت الحساب: آخر حاجة في القايمة ----
     كان زرار الحرف الأول في الترويسة. بقى كارت ثابت: الاسم والإيميل باينين
     من غير ضغط، والضغط بيفتح المستوى والسلسلة وتسجيل الخروج. */
  /* ⚠️ الكارت بيتركّب مرتين (الشريط الثابت + الدرج) والاتنين موجودين في
     الـ DOM في نفس الوقت — واحد بس هو الظاهر. فالـ id لازم يتفرّق، وإلا
     aria-controls بيشاور على عنصر مكرر. */
  const renderAccountCard = (scope: "rail" | "drawer") => {
    if (!acct) return null;
    const panelId = `account-panel-${scope}`;

    return (
    <div className="p-3 border-t border-rule">
      <AnimatePresence initial={false}>
        {accountOpen && (
          <motion.div
            id={panelId}
            key="account-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 pb-3">
              {acct.isGuest && (
                <div className="notice notice-error text-[11px]">
                  <p className="m-0">
                    إنت داخل كحساب زائر — بياناتك على الجهاز ده بس. سجّل بإيميل عشان متضيعش.
                  </p>
                </div>
              )}

              {motivation && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[var(--r-sm)] bg-paper p-2.5">
                    <p className="tag mb-1">المستوى</p>
                    <p className="font-display font-extrabold text-ink text-lg leading-none tnum">
                      {motivation.level}
                    </p>
                  </div>
                  <div className="rounded-[var(--r-sm)] bg-paper p-2.5">
                    <p className="tag mb-1">السلسلة</p>
                    <p className="font-display font-extrabold text-ink text-lg leading-none tnum">
                      {motivation.streak ?? 0}
                    </p>
                  </div>
                </div>
              )}

              {acct.isGuest ? (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    router.push("/login");
                  }}
                  className="btn btn-marker btn-block text-sm"
                >
                  سجّل حساب دائم
                </button>
              ) : (
                <button
                  onClick={handleSignOut}
                  className="btn btn-block text-sm bg-red-950 text-red-400 border-red-500/35 hover:bg-red-900"
                >
                  تسجيل الخروج
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setAccountOpen((v) => !v)}
        aria-expanded={accountOpen}
        aria-controls={panelId}
        className="w-full flex items-center gap-2.5 p-2 rounded-[var(--r-sm)] text-right hover:bg-paper-3 transition"
      >
        <span
          aria-hidden
          className={`w-9 h-9 shrink-0 rounded-[var(--r-sm)] flex items-center justify-center font-display font-extrabold text-sm ${
            acct.isGuest ? "bg-paper-3 text-ink-soft border border-rule" : `${themeStyles.accentBg} text-onmarker`
          }`}
        >
          {acct.avatarInitial}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-bold text-ink truncate">{acct.displayName}</span>
          <span className="block mono text-ink-soft truncate normal-case">{acct.displayEmail}</span>
        </span>
        <span aria-hidden className="mono text-ink-soft shrink-0">
          {accountOpen ? "▾" : "▴"}
        </span>
      </button>
    </div>
    );
  };

  const brand = (
    <div className="p-5">
      <p className="eyebrow eyebrow-flush mb-1.5">الفهرس</p>
      {/* الاسم من `lib/seo.ts` مش مكتوب بالإيد — الداشبورد مابيستخدمش
          القاموس (كله عربي ثابت)، فمصدر الاسم الوحيد اللي يوصل هنا هو
          ثوابت الـ SEO. اللوجو بلون `--hl-yellow-ink` عشان يتبع باليتة
          المتجر الملبوسة زي باقي ألوان الداشبورد. */}
      <div className="flex items-center gap-2">
        <BrandGlyph className="h-6 w-auto shrink-0 aspect-[56.87/45] text-[var(--hl-yellow-ink)]" />
        <span>
          <p className="font-display font-extrabold text-base text-ink leading-tight">{SITE_NAME}</p>
          <p className="mono text-ink-soft/70 mt-0.5">{SITE_NAME_EN}</p>
        </span>
      </div>
    </div>
  );

  return (
    <>
      {/* ================= الشريط الجانبي — lg وفوق ================= */}
      {/* ⚠️ الشريط ده `fixed` — يعني مش بياخد مكان من الـ flow، فالـ
          `inset-y-0` بيحطّه من الصفر. لو الشريط العلوي العام موجود
          فوقه (56px = `--nav-h`)، أول بند في الفهرس بيختفي تحته.

          عشان كده لما الشريط العلوي موجود بنزحّ Rail لتحت بيه
          (`top-[var(--nav-h)]`) بدل ما نعدّيه. والداشبورد (مفيش
          فيها شريط علوي) بيفضل `inset-y-0` زي ما كان.

          ⚠️ الشرط في `siteNavbarVisible` — نفس مرجع `UnifiedNavbar`. */}
      <nav
        aria-label="أقسام لوحة التحكم"
        className={`hidden lg:flex fixed z-30 w-56 xl:w-64 flex-col bg-paper-2 ${
          hasSiteNavbar ? "top-[var(--nav-h)] bottom-0" : "inset-y-0"
        }`}
        style={{
          insetInlineEnd: 0,
          // هامش الملزمة الأحمر: على الحد الداخلي المواجه للمحتوى
          borderInlineStartWidth: 3,
          borderInlineStartStyle: "solid",
          borderInlineStartColor: "var(--redpen)",
        }}
      >
        <div className="shrink-0 border-b border-rule">{brand}</div>

        {/* البنود بقت أكتر بعد ما الترويسة اتشالت، فالسكرول بقى على الجزء
            ده لوحده — الفهرس وكارت الحساب لازم يفضلوا ثابتين. */}
        <div className="flex-1 overflow-y-auto">{renderNavBody("rail")}</div>

        <div className="shrink-0">{renderAccountCard("rail")}</div>
      </nav>

      {/* ================= الموبايل: زرار + درج ================= */}
      <div className="lg:hidden sticky top-0 z-30 -mx-4 sm:-mx-6 md:-mx-10 mb-4 px-4 sm:px-6 md:px-10 py-2 bg-paper/95 backdrop-blur border-b border-rule flex items-center gap-3">
        <button
          ref={menuBtnRef}
          type="button"
          onClick={() => setIsMenuOpen(true)}
          aria-expanded={isMenuOpen}
          aria-controls="nav-drawer"
          className="mono flex items-center gap-2 px-3 py-2 rounded-[var(--r-sm)] border border-rule bg-paper text-ink hover:bg-paper-3 transition"
        >
          <span aria-hidden>☰</span>
          <span>القايمة</span>
          {(emergencyOn || audioOn) && (
            <>
              <span
                aria-hidden
                className={`w-2 h-2 rounded-full ${emergencyOn ? "bg-red-500" : "bg-emerald-500"}`}
              />
              <span className="sr-only">{emergencyOn ? "وضع الطوارئ شغّال" : "فيه صوت شغّال"}</span>
            </>
          )}
        </button>

        <p className="font-display font-extrabold text-sm text-ink truncate m-0 flex-1">{SITE_NAME}</p>

        {emergencyOn && <span className="tag tag-box bg-red-950 text-red-400 shrink-0">طوارئ</span>}
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="أقسام لوحة التحكم">
            <motion.div
              key="nav-scrim"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setIsMenuOpen(false)}
              className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
            />
            <motion.nav
              ref={drawerRef}
              id="nav-drawer"
              key="nav-drawer"
              aria-label="أقسام لوحة التحكم"
              // الشريط الثابت عايش على الحد الداخلي (شمال في RTL)، فالدرج
              // بيطلع من نفس الناحية — لو طلع من الناحية التانية كان هيحس
              // إنه قايمة تانية مش نفس القايمة.
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="absolute inset-y-0 w-[86%] max-w-xs bg-paper-2 flex flex-col"
              style={{
                insetInlineEnd: 0,
                borderInlineStartWidth: 3,
                borderInlineStartStyle: "solid",
                borderInlineStartColor: "var(--redpen)",
              }}
            >
              <div className="shrink-0 flex items-start justify-between border-b border-rule">
                <div className="min-w-0">{brand}</div>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  aria-label="إغلاق القايمة"
                  className="mono text-ink-soft hover:text-ink m-3 px-2 py-1 rounded-[var(--r-sm)] hover:bg-paper-3 transition shrink-0"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">{renderNavBody("drawer")}</div>

              <div className="shrink-0">{renderAccountCard("drawer")}</div>
            </motion.nav>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
