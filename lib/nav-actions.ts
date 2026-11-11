import {
  setNavIntent,
  type NavItemDef,
  type NavSignal,
} from "@/app/dashboard/components/nav-config";

/* ==========================================================================
   تنقّل بند القايمة — مصدر واحد لسلوك الضغط

   كل بند في القايمة بيعمل حاجة من تلاتة:
     href      → صفحة كاملة (تنقّل عادي)
     scrollTo  → قسم جوه صفحة الداشبورد (سكرول)
     signal    → مودال في الداشبورد (نية محفوظة + تنقّل)

   ⚠️ السلوك ده كان مكتوب جوّه `NavRail.handleClick` بس. لما الشريط
      العلوي احتاج نفس السلوك، النسختين كانتا هتختلف من أول تعديل.
      فالمسؤولية اتنقلت هنا، والاتنين نادوا نفس الدالة.

   💡 ليه مش بنستخدم `<Link>` للكل؟ لأن `<Link>` بيتعامل مع المسار
      بس. البند اللي مالهوش مسار (مودال أو قسم) محتاج النية
      (`setNavIntent`) + تنقّل للداشبورد، وده مش شغل `<Link>`.
   ========================================================================== */

export interface NavActionOptions {
  /** المسار الحالي — بنعرف منه إننا في الداشبورد ولا في صفحة تانية */
  pathname: string;
  /** تنفيذ التنقّل فعليًا (عادةً `router.push`) */
  navigate: (href: string) => void;
  /**
   * الداشبورد بتفتح المودال بنفسها من غير تنقّل (لأنها هي اللي عندها
   * الـ state). لو مش موجودة، بنكتب النية وبننقّل للداشبورد.
   */
  onSignal?: (signal: NavSignal) => void;
  /** بيتنادى قبل أي تنقّل — الشريط بيقفل القايمة نفسها */
  onNavigate?: () => void;
  /**
   * تغيّر البند النشط. الشريط الجانبي بيحتاجها للبند اللي مالهوش مسار
   * (الملاحظات/التحليلات): مفيش مسار يوضّح إنه هو المفتوح، فبنقوله
   * صراحةً. الـ null معناها "رجّعنا لعنصر المسار".
   */
  onActiveChange?: (id: string | null) => void;
}

export function performNavAction(item: NavItemDef, opts: NavActionOptions): void {
  const onDashboard = opts.pathname === "/dashboard";

  // القايمة (شريط جانبي أو درج) بتسكر قبل ما نتحرك — عشان الدرج
  // مايفضلش معلّق فوق الصفحة الجديدة.
  opts.onNavigate?.();

  /* ---- 1) صفحة كاملة ---- */
  if (item.href) {
    opts.onActiveChange?.(null);
    // واقع على الصفحة نفسها: بنرجّعه لفوق بدل ما نعمل تنقّل فاضي.
    if (opts.pathname === item.href) {
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    opts.navigate(item.href);
    return;
  }

  /* ---- 2) قسم جوه الداشبورد ---- */
  if (item.scrollTo) {
    if (onDashboard) {
      opts.onActiveChange?.(item.id);
      if (typeof document !== "undefined") {
        document
          .getElementById(item.scrollTo)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    setNavIntent({ kind: "scroll", target: item.scrollTo });
    opts.navigate("/dashboard");
    return;
  }

  /* ---- 3) مودال ---- */
  if (item.signal) {
    if (opts.onSignal) {
      opts.onSignal(item.signal);
      return;
    }
    setNavIntent({ kind: "modal", target: item.signal });
    opts.navigate("/dashboard");
  }
}
