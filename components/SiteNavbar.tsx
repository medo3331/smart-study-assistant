"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";

import { TopControls } from "@/components/TopControls";
import { UpgradeCtaSlot } from "@/components/UpgradeCta";
import { performNavAction } from "@/lib/nav-actions";
import { cn } from "@/lib/cn";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import {
  NAVBAR_GROUPS,
  NAVBAR_MORE_GROUPS,
  NAV_GROUPS,
  activeNavId,
  resolveNavHref,
  type NavGroupDef,
  type NavItemDef,
} from "@/app/dashboard/components/nav-config";
import { NAV_ICONS } from "@/app/dashboard/components/nav-icons";
import { useIsOwner } from "@/app/dashboard/components/use-is-owner";

/* ==========================================================================
   الشريط العلوي — نسخة كاملة من قايمة المنصة

   ⚠️ ده **مش** شريط تاني بقايمة تانية. البنود والمجموعات كلهم من
      `nav-config.ts` — نفس المصدر اللي `NavRail` بيقرأ منه. لو ضفت
      صفحة جديدة، بتظهر في الاتنين في نفس الوقت.

   💡 ليه شريط أفقي أصلاً والشريط الجانبي موجود؟
      الشريط الجانبي (على الشمال) هو **الفهرس الكامل** — ٩ مجموعات و٣٩
      بند، وبياخد مساحة ثابتة من الشاشة. الشريط العلوي هو **الوصول
      السريع**: نفس الأقسام كقوائم منسدلة، والقوائم الطويلة بتتجمّع في
      «المزيد». يعني المستخدم اللي عارف مكانه بيوصله بضغطة، من غير ما
      يتنقّل في فهرس طويل.

   💡 ليه `sticky` مش `fixed`؟
      `fixed` معناه إن كل صفحة لازم تدّي `padding-top` عشان المحتوى
      مايتغطّاش — والقائمة فيها صفحات بأشكال مختلفة (شاشة كاملة،
      `<main>` خاص بيها، قوالب تانية). `sticky` بياخد المساحة بتاعه من
      الـ flow من غير ما يلمس أي حاوية.

   ⚠️ الأدمن: بند لوحة الأدمن `ownerOnly` — بيختفي لغير صاحب المنصة.
      نفس فلترة `NavRail`، ونفس الـ hook (`useIsOwner`).
   ========================================================================== */

export function SiteNavbar() {
  const { locale } = useLanguage();
  const isAr = locale === "ar";
  const pathname = usePathname() || "/";
  const router = useRouter();
  const isOwner = useIsOwner();

  /**
   * حالة القوائم — ونتخزّن معاها **المسار** وقت ما فتحت.
   *
   * 💡 ليه مع المسار؟ عشان لما المسار يتغيّر (ضغط على لينك مثلاً)،
   *    القائمة تقفل لوحدها. الطريقة دي **مش** effect — الحالة بتتحسب
   *    وقت الـ render، فمفيش setState جوّه effect ومفيش رندر زيادة.
   */
  const [openMenu, setOpenMenu] = useState<{ id: string | null; path: string }>({
    id: null,
    path: pathname,
  });
  const [mobileMenu, setMobileMenu] = useState<{ open: boolean; path: string }>({
    open: false,
    path: pathname,
  });

  /** القائمة المفتوحة — لو المسار اتغيّر من فتحها، هي مقفولة. */
  const openGroupId = openMenu.path === pathname ? openMenu.id : null;
  const mobileOpen = mobileMenu.path === pathname && mobileMenu.open;

  const navRef = useRef<HTMLDivElement>(null);

  const activeId = activeNavId(pathname);
  const activeGroupId = useMemo(() => {
    for (const g of NAV_GROUPS) {
      if (g.items.some((i) => i.id === activeId)) return g.id;
    }
    return null;
  }, [activeId]);

  /* ---- فتح/قفل القويس ----
   * ⚠️ مفيش `useCallback` هنا عن قصد: React Compiler في المشروع شغّال
   *    وبيحفظ الذاكرة لوحده. و`useCallback` اليدوي كان بيخلي المترجم
   *    يتخطّى الكومبوننت كله («preserve-manual-memoization»).
   */
  const openGroup = (id: string) => setOpenMenu({ id, path: pathname });

  const closeGroup = (id: string) =>
    setOpenMenu((cur) =>
      cur.path === pathname && cur.id === id ? { id: null, path: pathname } : cur,
    );

  /** يقفل القوائم كلها. */
  const closeMenus = useCallback(() => {
    setOpenMenu({ id: null, path: pathname });
    setMobileMenu({ open: false, path: pathname });
  }, [pathname]);

  /** فتح/قفل درج الموبايل. */
  const toggleMobile = () => setMobileMenu({ open: !mobileOpen, path: pathname });

  /* ---- Escape يقفل المجموعة المفتوحة، والضغط بره يقفلها برضه ---- */
  useEffect(() => {
    if (!openGroupId && !mobileOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeMenus();
    };
    const onPointerDown = (e: MouseEvent) => {
      const root = navRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) closeMenus();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [openGroupId, mobileOpen, closeMenus]);

  /**
   * الضغط على بند. البنود اللي عندها مسار بتستخدم `<Link>` (معا prefetch)
   * — والباقي (مودال/قسم) بتيجي هنا.
   */
  const handleItemClick = (item: NavItemDef) => {
    performNavAction(item, {
      pathname,
      navigate: (href) => router.push(href),
      onNavigate: closeMenus,
    });
  };

  /** البنود اللي تقدر تظهر — الأدمن لصاحب المنصة بس. */
  const visibleItems = (group: NavGroupDef) =>
    group.items.filter((i) => !i.ownerOnly || isOwner);

  const renderItem = (item: NavItemDef, variant: "dropdown" | "sheet") => {
    const Icon = NAV_ICONS[item.icon];
    const href = resolveNavHref(item);
    const isActive = item.id === activeId;
    const isDanger = item.tone === "danger";

    const label = isAr ? item.label : item.latin;

    const classes = cn(
      "flex items-center gap-2.5 rounded-[var(--r-sm)] transition-colors",
      variant === "dropdown" ? "w-full px-3 py-2 text-start text-sm" : "px-3 py-2.5 text-sm",
      isActive
        ? "bg-paper-3 text-ink font-semibold"
        : isDanger
        ? "text-red-400 hover:bg-paper-3 hover:text-red-300"
        : "text-ink-soft hover:bg-paper-3 hover:text-ink",
    );

    const body = (
      <>
        <Icon aria-hidden size={16} strokeWidth={isActive ? 2.2 : 1.8} className="shrink-0" />
        <span className="flex-1 min-w-0 truncate">{label}</span>
        {!isAr && item.label !== item.latin && (
          <span className="mono text-[0.6rem] text-ink-soft/70 truncate hidden xl:inline">
            {item.label}
          </span>
        )}
      </>
    );

    // بند مسار → لينك. بند مودال/قسم → زرار (المشغّل بيكمّل الباقي).
    if (href) {
      return (
        <li key={item.id}>
          <Link
            href={href}
            onClick={closeMenus}
            aria-current={isActive ? "page" : undefined}
            className={classes}
          >
            {body}
          </Link>
        </li>
      );
    }

    return (
      <li key={item.id}>
        <button type="button" onClick={() => handleItemClick(item)} className={classes}>
          {body}
        </button>
      </li>
    );
  };

  /** قائمة منسدلة لمجموعة واحدة. */
  const renderDropdown = (group: NavGroupDef) => {
    const items = visibleItems(group);
    if (items.length === 0) return null;

    const open = openGroupId === group.id;
    const panelId = `navbar-group-${group.id}`;
    const groupActive = group.id === activeGroupId;
    const label = isAr ? group.title : group.latin;

    return (
      <div
        key={group.id}
        className="relative"
        onMouseEnter={() => openGroup(group.id)}
        onMouseLeave={(e) => {
          // لو التركيز جوه الزرار (كيبورد) سيبها مفتوحة — مايقفلش من تحت
          // المستخدم وهو بيقرا.
          if (!e.currentTarget.contains(document.activeElement)) closeGroup(group.id);
        }}
        onFocus={() => openGroup(group.id)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) closeGroup(group.id);
        }}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => (open ? closeGroup(group.id) : openGroup(group.id))}
          className={cn(
            "flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-2 text-sm transition-colors",
            groupActive ? "text-ink font-semibold" : "text-ink-soft hover:text-ink hover:bg-paper-3",
          )}
        >
          <span>{label}</span>
          <ChevronDown
            aria-hidden
            size={14}
            className={cn("shrink-0 transition-transform duration-150", open ? "rotate-180" : "")}
          />
        </button>

        {open && (
          <div
            id={panelId}
            className="absolute top-full start-0 z-50 mt-1 w-64 rounded-[var(--r-md)] border border-rule bg-paper-2 p-1.5 shadow-lg"
          >
            <ul className="space-y-0.5">
              {items.map((item) => renderItem(item, "dropdown"))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  /* ---- «المزيد»: المجموعات اللي مش في الشريط ---- */
  const moreGroups = NAVBAR_MORE_GROUPS.filter((g) => visibleItems(g).length > 0);
  const moreOpen = openGroupId === "__more__";
  const moreActive = moreGroups.some((g) => g.id === activeGroupId);

  return (
    <header ref={navRef} className="sticky top-0 z-40 w-full" dir={isAr ? "rtl" : "ltr"}>
      {/* ⚠️ الشريط نفسه `h-14` (56px) والحد `border-b` **جوه** الـ box
         (عشان `box-sizing: border-box` يبتلعه). كده ارتفاع الشريط = 56px
         بالظبط، وهو نفس `--nav-h` في globals.css.

         والدرج (sheet) **بره** الشريط: كان جوّاه، فلو الشريط له ارتفاع
         ثابت كان الدرج هيتقص. جوّاه = الشريط + الدرج بيتقفلوا مع بعض. */}
      <div className="h-14 border-b border-rule bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-4">
        {/* البراند */}
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2 text-lg font-bold text-[var(--accent)]"
        >
          <span aria-hidden>⚡</span>
          <span>Magicly</span>
        </Link>

        {/* ------- سطح المكتب: قوائم منسدلة ------- */}
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label={isAr ? "التنقل الرئيسي" : "Main navigation"}>
          {NAVBAR_GROUPS.map(renderDropdown)}

          {moreGroups.length > 0 && (
            <div
              className="relative"
              onMouseEnter={() => openGroup("__more__")}
              onMouseLeave={(e) => {
                if (!e.currentTarget.contains(document.activeElement)) closeGroup("__more__");
              }}
              onFocus={() => openGroup("__more__")}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) closeGroup("__more__");
              }}
            >
              <button
                type="button"
                aria-expanded={moreOpen}
                aria-controls="navbar-group-more"
                onClick={() => (moreOpen ? closeGroup("__more__") : openGroup("__more__"))}
                className={cn(
                  "flex items-center gap-1.5 rounded-[var(--r-sm)] px-3 py-2 text-sm transition-colors",
                  moreActive ? "text-ink font-semibold" : "text-ink-soft hover:text-ink hover:bg-paper-3",
                )}
              >
                <span>{isAr ? "المزيد" : "More"}</span>
                <ChevronDown
                  aria-hidden
                  size={14}
                  className={cn("shrink-0 transition-transform duration-150", moreOpen ? "rotate-180" : "")}
                />
              </button>

              {moreOpen && (
                <div
                  id="navbar-group-more"
                  className="absolute top-full start-0 z-50 mt-1 w-72 rounded-[var(--r-md)] border border-rule bg-paper-2 p-1.5 shadow-lg"
                >
                  {moreGroups.map((group) => (
                    <div key={group.id} className="mb-1 last:mb-0">
                      <p className="px-3 pt-2 pb-1 text-[0.65rem] font-bold text-ink-soft/70">
                        {isAr ? group.title : group.latin}
                      </p>
                      <ul className="space-y-0.5">
                        {visibleItems(group).map((item) => renderItem(item, "dropdown"))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <TopControls />
          <UpgradeCtaSlot />
        </div>

        {/* ------- الموبايل: زرار + درج ------- */}
        <button
          type="button"
          onClick={toggleMobile}
          aria-expanded={mobileOpen}
          aria-controls="navbar-mobile-sheet"
          aria-label={isAr ? "فتح القائمة" : "Open menu"}
          className="rounded-[var(--r-sm)] p-2 text-ink lg:hidden"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        </div>
      </div>

      {/* الدرج: كل المجموعات وكل البنود — مفيش حاجة مستخبية على الموبايل */}
      {mobileOpen && (
        <div
          id="navbar-mobile-sheet"
          className="max-h-[75vh] overflow-y-auto border-b border-rule bg-paper px-4 py-3 lg:hidden"
        >
          {NAV_GROUPS.map((group) => {
            const items = visibleItems(group);
            if (items.length === 0) return null;
            return (
              <div key={group.id} className="mb-4 last:mb-0">
                <p className="px-3 pb-1.5 text-[0.65rem] font-bold text-ink-soft/70">
                  {isAr ? group.title : group.latin}
                </p>
                <ul className="space-y-0.5">{items.map((item) => renderItem(item, "sheet"))}</ul>
              </div>
            );
          })}

          <div className="border-t border-rule pt-3">
            <TopControls />
          </div>
        </div>
      )}
    </header>
  );
}
