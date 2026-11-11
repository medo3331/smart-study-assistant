/* ==========================================================================
   قايمة التنقل — مصدر واحد للحقيقة

   كل البنود متعرّفين هنا مرة واحدة. NavRail بترسمهم، والداشبورد
   بتقرا "النية" منهم. لو عايز تزوّد بند أو تغيّر ترتيب، هنا بس.

   كل بند بيعمل حاجة من تلاتة:
     href      → صفحة كاملة (router.push)
     scrollTo  → قسم جوه صفحة الداشبورد
     signal    → إجراء محتاج حالة الداشبورد نفسها (مودال)
   ========================================================================== */

/* ⚠️ الليستة دي هي المرجع لـ `isNavSignal` تحت. أي إشارة جديدة تتزوّد هنا
   وبس — التحقق من النية المحفوظة بيتولّد منها، فمافيش مكان تاني تنساه. */
export const NAV_SIGNALS = [
  "ai",
  "settings",
  "emergency",
  "parentReport",
  "leaderboard",
  "xpShop",
] as const;

export type NavSignal = (typeof NAV_SIGNALS)[number];

function isNavSignal(value: unknown): value is NavSignal {
  return typeof value === "string" && (NAV_SIGNALS as readonly string[]).includes(value);
}

/** أسماء أيقونات lucide. الاسم هنا مفتاح بس — الخريطة نفسها في NavRail،
    عشان الملف ده يفضل بيانات خالصة (مفيش React) ويُقرأ من السيرفر. */
export type NavIconName =
  | "dashboard"
  | "subjects"
  | "lessons"
  | "workspace"
  | "lectures"
  | "exams"
  | "slides"
  | "aiMentor"
  | "agents"
  | "assistant"
  | "create"
  | "planner"
  | "calendar"
  | "missions"
  | "notes"
  | "emergency"
  | "quran"
  | "worship"
  | "break"
  | "escape"
  | "progress"
  | "achievements"
  | "analytics"
  | "leaderboard"
  | "xpShop"
  | "inventory"
  | "community"
  | "referrals"
  | "shop"
  | "rewards"
  | "pricing"
  | "balance"
  | "plans"
  | "profile"
  | "settings"
  | "career"
  | "report"
  | "support"
  | "admin";

export interface NavItemDef {
  id: string;
  icon: NavIconName;
  label: string; // العربي — هو الأساسي
  latin: string; // الإنجليزي — لافتة صغيرة، بتدي إيقاع للقايمة
  href?: string;
  scrollTo?: string;
  signal?: NavSignal;
  /** بند خطر — بيتلوّن أحمر بدل الرمادي الهادي (الطوارئ بس دلوقتي) */
  tone?: "danger";
  /** بند إداري — مايتعرضش غير لصاحب المنصة */
  ownerOnly?: boolean;
}

export interface NavGroupDef {
  /** معرّف ثابت — حالة الفتح/القفل بتتعامل بيه، فمايتغيّرش مع الترجمة. */
  id: string;
  title: string;
  latin: string;
  icon: NavIconName;
  items: NavItemDef[];
}

// ⚠️ الترتيب هنا هو ترتيب المستخدم بالظبط: ٩ أقسام، من لوحة التحكم للدعم
// والإدارة. البنود القديمة كلها محفوظة جوه الأقسام المناسبة — مفيش أداة
// اتشالت، بس اتوزّعت على المجموعات التسعة.
//
// 🗓️ ٨ أغسطس: الشريط العلوي في الداشبورد اتشال بالكامل (طلب المستخدم:
// «قايمة واحدة بس اللي على الشمال فيها كل حاجة»). بنوده اتوزّعوا هنا —
// الطوارئ في «التخطيط»، والمتصدرين واصرف نقاطك في «التقدّم»، وتقرير
// المتابعة في «الحساب».
export const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "main",
    title: "الرئيسية",
    latin: "Main",
    icon: "dashboard",
    items: [
      { id: "home", icon: "dashboard", label: "لوحة التحكم", latin: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    id: "learning",
    title: "التعلّم",
    latin: "Learning",
    icon: "subjects",
    items: [
      // «المواد» هي صفحة الكورسات الحالية — نفس المحتوى اللي المستخدم
      // بيدخل منه مادته. مسار /dashboard/subjects المختصر هيتبني لاحقاً.
      { id: "courses", icon: "subjects", label: "المواد", latin: "Subjects", href: "/dashboard/courses" },
      { id: "lessons", icon: "lessons", label: "الدروس", latin: "Lessons", href: "/lessons" },
      { id: "workspace", icon: "workspace", label: "مساحة العمل", latin: "Workspace", href: "/dashboard/workspace" },
      { id: "lectures", icon: "lectures", label: "محاضراتي", latin: "My Lectures", href: "/lectures" },
      { id: "exams", icon: "exams", label: "بنك الامتحانات", latin: "Past Exams", href: "/exams" },
      { id: "slides", icon: "slides", label: "العروض", latin: "Slides", href: "/dashboard/slides" },
    ],
  },
  {
    id: "ai",
    title: "مساحة الذكاء",
    latin: "AI Space",
    icon: "aiMentor",
    items: [
      { id: "ai_chat", icon: "aiMentor", label: "المعلم الشخصي", latin: "AI Mentor", href: "/chat" },
      { id: "agents", icon: "agents", label: "وكلاء الذكاء", latin: "AI Agents", href: "/dashboard/agents" },
      { id: "ai", icon: "assistant", label: "المساعد الذكي", latin: "AI Assistant", signal: "ai" },
      { id: "create", icon: "create", label: "إنشاء خطة", latin: "Create", href: "/dashboard/create" },
    ],
  },
  {
    id: "planning",
    title: "التخطيط والتنظيم",
    latin: "Planning",
    icon: "planner",
    items: [
      { id: "planner", icon: "planner", label: "المخطط", latin: "Planner", href: "/dashboard/planner" },
      { id: "calendar", icon: "calendar", label: "التقويم", latin: "Calendar", href: "/dashboard/calendar" },
      { id: "missions", icon: "missions", label: "المهام اليومية", latin: "Daily Missions", href: "/missions" },
      { id: "notes", icon: "notes", label: "الملاحظات", latin: "Notes", scrollTo: "notes" },
      // الطوارئ مفتاح مش صفحة: بيقلب شكل قايمة الأيام لخطة امتحان قريب.
      { id: "emergency", icon: "emergency", label: "وضع الطوارئ", latin: "Emergency", signal: "emergency", tone: "danger" },
      // 🗓️ ١٢ أغسطس: القرآن كان مدفون جوه درج الإعدادات — البند ده بينزّل
      // على كارت القرآن في الداشبورد، والكارت فيه زرار للمكتبة الكاملة.
      { id: "quran", icon: "quran", label: "القرآن الكريم", latin: "Quran", scrollTo: "quran" },
      { id: "worship", icon: "worship", label: "عباداتي", latin: "Worship Center", href: "/worship" },
      { id: "break", icon: "break", label: "استراحة", latin: "Break Zone", href: "/break" },
      { id: "escape", icon: "escape", label: "غرفة الهروب", latin: "Escape Room", href: "/escape-room" },
    ],
  },
  {
    id: "progress",
    title: "تقدمي وإنجازاتي",
    latin: "Progress",
    icon: "progress",
    items: [
      { id: "progress", icon: "progress", label: "التقدم", latin: "Progress", href: "/dashboard/progress" },
      { id: "achievements", icon: "achievements", label: "الإنجازات", latin: "Achievements", href: "/dashboard/achievements" },
      { id: "analytics", icon: "analytics", label: "التحليلات", latin: "Analytics", scrollTo: "analytics" },
      { id: "leaderboard", icon: "leaderboard", label: "لوحة المتصدرين", latin: "Leaderboard", signal: "leaderboard" },
      // ⚠️ ده مش المتجر. المتجر بيصرف كوينز، وده بيصرف XP على تجميد
      // السلسلة وفتح اليوم اللي بعده بدري. عملتين مختلفتين خالص.
      { id: "xpShop", icon: "xpShop", label: "اصرف نقاطك", latin: "XP Rewards", signal: "xpShop" },
      { id: "inventory", icon: "inventory", label: "المخزن", latin: "Inventory", href: "/inventory" },
    ],
  },
  {
    id: "community",
    title: "المجتمع والمكافآت",
    latin: "Community",
    icon: "community",
    items: [
      { id: "community", icon: "community", label: "المجتمع", latin: "Community", href: "/community" },
      { id: "referrals", icon: "referrals", label: "الإحالات", latin: "Referrals", href: "/dashboard/referrals" },
      { id: "shop", icon: "shop", label: "المتجر", latin: "Shop", href: "/shop" },
      { id: "rewards", icon: "rewards", label: "المكافآت", latin: "Rewards", href: "/rewards" },
    ],
  },
  {
    id: "balance",
    title: "الباقة والرصيد",
    latin: "Balance",
    icon: "balance",
    items: [
      { id: "plan_current", icon: "pricing", label: "الخطة الحالية", latin: "Current Plan", href: "/pricing" },
      { id: "balance", icon: "balance", label: "الرصيد", latin: "Balance", href: "/dashboard/balance" },
      { id: "plans", icon: "plans", label: "الخطط", latin: "Plans", href: "/plans" },
    ],
  },
  {
    id: "account",
    title: "حسابي وإعداداتي",
    latin: "Account",
    icon: "profile",
    items: [
      { id: "profile", icon: "profile", label: "الملف الشخصي", latin: "Profile", href: "/dashboard/profile" },
      { id: "settings", icon: "settings", label: "الإعدادات", latin: "Settings", signal: "settings" },
      { id: "career", icon: "career", label: "المسار المهني", latin: "Career", href: "/dashboard/career" },
      { id: "parentReport", icon: "report", label: "تقرير المتابعة", latin: "Report", signal: "parentReport" },
    ],
  },
  {
    id: "support",
    title: "الدعم والإدارة",
    latin: "Support & Admin",
    icon: "support",
    items: [
      { id: "support", icon: "support", label: "الدعم الفني", latin: "Support", href: "/dashboard/support" },
      // يظهر للـ Owner بس — الفلترة في NavRail عبر isOwner.
      { id: "admin", icon: "admin", label: "لوحة الأدمن", latin: "Admin", href: "/admin", ownerOnly: true },
    ],
  },
];

export const NAV_ITEMS: NavItemDef[] = NAV_GROUPS.flatMap((g) => g.items);

/* --------------------------------------------------------------------------
   مجموعات الشريط العلوي

   الشريط الجانبي (`NavRail`) بياخد **كل** المجموعات التسعة. الشريط العلوي
   (`SiteNavbar`) شريط أفقي — تسع قوائم جنب بعض هياخدوا عرض كبير، فبقت
   ست مجموعات في الشريط والباقي في قائمة «المزيد».

   ⚠️ مجموعات الشريط العلوي مش نسخة جديدة من البيانات — هي **تحديد**
   للمجموعات الموجودة فوق. أي بند جديد بيتزاد في `NAV_GROUPS` بيظهر
   تلقائي: في الشريط لو مجموعته من `NAVBAR_GROUP_IDS`، أو في «المزيد» لو لا.

   ⚠️ بند الأدمن (`ownerOnly`) بيختفي لغير صاحب المنصة. الفلترة نفسها
   اللي في `NavRail` — مفيش fetch جديد، في `useIsOwner` واحدة مشتركة.
   -------------------------------------------------------------------------- */

/** المجموعات اللي بتظهر كقوائم منسدلة جنب بعض في الشريط العلوي. */
export const NAVBAR_GROUP_IDS = [
  "learning",
  "ai",
  "planning",
  "progress",
  "community",
  "account",
] as const;

export const NAVBAR_GROUPS: NavGroupDef[] = NAV_GROUPS.filter((g) =>
  (NAVBAR_GROUP_IDS as readonly string[]).includes(g.id),
);

/**
 * المجموعات اللي مش بتظهر في الشريط العلوي مباشرة — بتتجمّع في قائمة
 * «المزيد». أي مجموعة مش في `NAVBAR_GROUP_IDS` بتروح هنا.
 */
export const NAVBAR_MORE_GROUPS: NavGroupDef[] = NAV_GROUPS.filter(
  (g) => !(NAVBAR_GROUP_IDS as readonly string[]).includes(g.id) && g.id !== "main",
);

/**
 * مسار البند لو كان صفحة كاملة — أو `null` لو مودال أو قسم.
 *
 * ليها دالة أصلاً؟ لأن `<Link>` بيتعامل مع المسار بس، والبند اللي
 * مالهوش مسار محتاج `<button>` + `performNavAction`. فالكود اللي
 * بيرسم لازم يعرف: رابط ولا زرار؟
 */
export function resolveNavHref(item: NavItemDef): string | null {
  return item.href ?? null;
}

/* --------------------------------------------------------------------------
   نية التنقل

   المشكلة: بنود زي «المساعد الذكي» و«الملاحظات» جوه صفحة الداشبورد —
   مودال أو قسم. لو المستخدم دوس عليهم وهو في /dashboard/workspace، لازم
   ننقله للداشبورد **وبعدين** نفتح المودال أو نسكرول.

   الحل: نكتب النية في sessionStorage، ننقل، والداشبورد بتقراها بعد ما
   بياناتها تخلص تحميل. sessionStorage مش localStorage عن قصد — دي نية
   لحظية، ماينفعش تفضل مستنية لبكرة.
   -------------------------------------------------------------------------- */

export type NavIntent =
  | { kind: "modal"; target: NavSignal }
  | { kind: "scroll"; target: string };

const INTENT_KEY = "nav_intent";

export function setNavIntent(intent: NavIntent): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
  } catch {
    // الستوريج مقفول (تصفح خفي) — المستخدم هيوصل للداشبورد وبس
  }
}

/** بتقرا النية وبتمسحها في نفس النداء — نية واحدة تتنفّذ مرة واحدة. */
export function takeNavIntent(): NavIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(INTENT_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.kind === "modal" && isNavSignal(obj.target)) {
      return { kind: "modal", target: obj.target };
    }
    if (obj.kind === "scroll" && typeof obj.target === "string" && obj.target) {
      return { kind: "scroll", target: obj.target };
    }
    return null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------
   بذرة المحادثة

   من مساحة العمل، «اسأل المساعد عن المادة دي» لازم تفتح المحادثة **ومعاها**
   نص المادة مرفوع كمرفق. المحادثة عايشة في الداشبورد، فالمادة بتتكتب هنا،
   وبنكتب معاها نية `modal → ai`، والداشبورد بتسلّمها للمودال.

   ليه sessionStorage ومش state؟ لأن فيه تنقّل صفحة كامل بين الاتنين.
   ⚠️ حد الحجم: النص بيتقص على ٦ آلاف حرف — نفس حد المرفقات في المحادثة
   (MAX_FILE_CHARS)، فمفيش فايدة من تخزين أكتر من كده.
   -------------------------------------------------------------------------- */

const SEED_KEY = "ai_seed";
const SEED_MAX_CHARS = 6000;

export interface AiSeed {
  /** اسم المادة — بيظهر كاسم المرفق */
  label: string;
  content: string;
  truncated: boolean;
}

export function setAiSeed(label: string, content: string): void {
  if (typeof window === "undefined") return;
  try {
    const truncated = content.length > SEED_MAX_CHARS;
    const seed: AiSeed = {
      label,
      content: truncated ? content.slice(0, SEED_MAX_CHARS) : content,
      truncated,
    };
    window.sessionStorage.setItem(SEED_KEY, JSON.stringify(seed));
  } catch {
    // الستوريج مقفول — المحادثة هتفتح فاضية وده مقبول
  }
}

/** بتقرا البذرة وبتمسحها — زي النية، مرة واحدة بس. */
export function takeAiSeed(): AiSeed | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SEED_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(SEED_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.label !== "string" || typeof obj.content !== "string") return null;
    return { label: obj.label, content: obj.content, truncated: obj.truncated === true };
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------
   بذرة العرض التقديمي

   من صفحة الدرس، «اعمل عرض من الشرح ده» لازم تفتح مولّد العروض والموضوع
   والمحتوى محطوطين جواه. نفس منطق بذرة المحادثة بالظبط: تنقّل صفحة كامل
   بين الاتنين، فالـ state مش بينفع و sessionStorage هو الحل.

   ليه نبعت الشرح مش الموضوع بس؟ عشان الشرائح تطلع من اللي الدرس قاله
   فعلاً، مش من معرفة الموديل العامة عن العنوان.
   -------------------------------------------------------------------------- */

const SLIDES_SEED_KEY = "slides_seed";
/** نفس حد MAX_SOURCE_CHARS في /api/generate-slides — أكتر من كده بيتقص هناك. */
const SLIDES_SOURCE_MAX = 6000;

export interface SlidesSeed {
  topic: string;
  source: string;
}

export function setSlidesSeed(topic: string, source: string): void {
  if (typeof window === "undefined") return;
  try {
    const seed: SlidesSeed = { topic, source: source.slice(0, SLIDES_SOURCE_MAX) };
    window.sessionStorage.setItem(SLIDES_SEED_KEY, JSON.stringify(seed));
  } catch {
    // الستوريج مقفول — الصفحة هتفتح فاضية والمستخدم يكتب الموضوع بإيده
  }
}

/** بتقرا البذرة وبتمسحها — مرة واحدة بس، زي باقي البذور. */
export function takeSlidesSeed(): SlidesSeed | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SLIDES_SEED_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(SLIDES_SEED_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.topic !== "string" || !obj.topic) return null;
    return { topic: obj.topic, source: typeof obj.source === "string" ? obj.source : "" };
  } catch {
    return null;
  }
}

/** أي بند «مفتوح» حالياً بناءً على المسار لوحده. */
export function activeNavId(pathname: string): string | null {
  const exact = NAV_ITEMS.find((i) => i.href === pathname);
  if (exact) return exact.id;
  const nested = NAV_ITEMS.find((i) => i.href && i.href !== "/dashboard" && pathname.startsWith(`${i.href}/`));
  return nested ? nested.id : null;
}

/* --------------------------------------------------------------------------
   لون القلم المختار

   الداشبورد بتحفظ الثيم في profiles.theme، والصفحات التانية مش عايزة
   تعمل استعلام لمجرد لون. فالداشبورد بتسيب نسخة محلية والصفحات بتقراها.
   المفتاح مش "theme" عشان ما يتلخبطش مع الفاتح/الغامق بتاع ThemeProvider.
   -------------------------------------------------------------------------- */

export const PEN_THEME_KEY = "pen_theme";

/* --------------------------------------------------------------------------
   بيانات كارت الحساب

   الكارت اللي تحت القايمة بيعرض نفس الاسم والإيميل في كل الصفحات. الاشتقاق
   عايش هنا عشان الداشبورد (اللي معاها المستخدم أصلاً) والصفحات الفرعية
   (اللي NavRail بتجيبه لنفسها) يطلّعوا نفس النتيجة بالظبط — قبل كده كان
   الاشتقاق مكتوب في الداشبورد بس، وأي صفحة تانية كانت هتخمّن.
   -------------------------------------------------------------------------- */

export interface RailAccount {
  displayName: string;
  displayEmail: string;
  avatarInitial: string;
  isGuest: boolean;
}

/** الشكل اللي محتاجينه من مستخدم سوپابيز — مكتوب بإيدينا عشان الملف ده
    يفضل من غير أي import، فيقدر يتقري من السيرفر والكلاينت على السوا. */
interface AuthUserLike {
  email?: string | null;
  is_anonymous?: boolean;
  user_metadata?: { full_name?: unknown } | null;
}

export function railAccountFromUser(user: AuthUserLike | null | undefined): RailAccount | null {
  if (!user) return null;
  const isGuest = user.is_anonymous === true;
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const displayName = fullName || (isGuest ? "زائر" : user.email?.split("@")[0]) || "مستخدم";
  return {
    displayName,
    displayEmail: user.email || (isGuest ? "حساب زائر (غير مسجل)" : ""),
    avatarInitial: displayName.trim().charAt(0).toUpperCase() || "؟",
    isGuest,
  };
}
