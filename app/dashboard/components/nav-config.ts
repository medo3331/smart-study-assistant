/* ==========================================================================
   قايمة التنقل — مصدر واحد للحقيقة

   كل البنود متعرّفين هنا مرة واحدة. NavRail بترسمهم، والداشبورد
   بتقرا "النية" منهم. لو عايز تزوّد بند أو تغيّر ترتيب، هنا بس.

   كل بند بيعمل حاجة من تلاتة:
     href      → صفحة كاملة (router.push)
     scrollTo  → قسم جوه صفحة الداشبورد
     signal    → إجراء محتاج حالة الداشبورد نفسها (مودال)
   ========================================================================== */

/* âڑ ï¸ڈ الليستة دي هي المرجع لـ `isNavSignal` تحت. أي إشارة جديدة تتزوّد هنا
   وبس — التحقق من النية المحفوظة بيتولّد منها، فمافيش مكان تاني تنساه. */
export const NAV_SIGNALS = [
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

export interface NavItemDef {
  id: string;
  icon: string;
  label: string; // العربي — هو الأساسي
  latin: string; // الإنجليزي — لافتة صغيرة، بتدي إيقاع للقايمة
  href?: string;
  scrollTo?: string;
  signal?: NavSignal;
  /** بند خطر — بيتلوّن أحمر بدل الرمادي الهادي (الطوارئ بس دلوقتي) */
  tone?: "danger";
}

export interface NavGroupDef {
  title: string;
  items: NavItemDef[];
}

// âڑ ï¸ڈ الترتيب هنا هو ترتيب المستخدم بالظبط. المجموعات اتزوّدت عشان البنود
// ورا بعض بيبقوا حيطة، بس من غير ما يتغيّر ترتيب أي بند.
//
// ًں—“ï¸ڈ ٨ أغسطس: الشريط العلوي في الداشبورد اتشال بالكامل (طلب المستخدم:
// آ«قايمة واحدة بس اللي على الشمال فيها كل حاجةآ»). بنوده اتوزّعوا هنا —
// الطوارئ في آ«المذاكرةآ»، والمتصدرين واصرف نقاطك في آ«التقدّمآ»، وتقرير
// المتابعة في آ«الحسابآ». البنود القديمة كلها فضلت بنفس ترتيبها النسبي.
export const NAV_GROUPS: NavGroupDef[] = [
  {
    title: "الرئيسية",
    items: [
      { id: "home", icon: "🏠", label: "الرئيسية", latin: "Home", href: "/dashboard" },
      { id: "referrals", icon: "🎁", label: "الدعوات", latin: "Referrals", href: "/dashboard/referrals" },
    ],
  },
  {
    title: "التعلم",
    items: [
      { id: "courses", icon: "📚", label: "الكورسات", latin: "Courses", href: "/dashboard/courses" },
      { id: "subjects", icon: "📖", label: "المواد", latin: "Subjects", href: "/subjects" },
      { id: "workspace", icon: "🗂️", label: "مساحة العمل", latin: "Workspace", href: "/dashboard/workspace" },
      { id: "lectures", icon: "🎙️", label: "محاضراتي", latin: "My Lectures", href: "/lectures" },
      { id: "exams", icon: "📋", label: "بنك الامتحانات", latin: "Past Exams", href: "/exams" },
      { id: "programming", icon: "💻", label: "البرمجة", latin: "Programming", href: "/programming" },
      { id: "university", icon: "🎓", label: "الجامعة", latin: "University", href: "/university" },
      { id: "quran", icon: "📖", label: "القرآن الكريم", latin: "Quran", scrollTo: "quran" },
      { id: "worship", icon: "🕌", label: "عباداتي", latin: "Worship Center", href: "/worship" },
      { id: "notes", icon: "📝", label: "الملاحظات", latin: "Notes", scrollTo: "notes" },
      { id: "break", icon: "☕", label: "استراحة", latin: "Break Zone", href: "/break" },
      { id: "escape", icon: "🧩", label: "غرفة الهروب", latin: "Escape Room", href: "/escape-room" },
      { id: "emergency", icon: "🚨", label: "وضع الطوارئ", latin: "Emergency", signal: "emergency", tone: "danger" },
    ],
  },
  {
    title: "مساحة AI",
    items: [
      { id: "ai", icon: "🤖", label: "المساعد الذكي", latin: "AI Assistant", signal: "ai" },
      { id: "agents", icon: "✦", label: "وكلاء الذكاء", latin: "AI Agents", href: "/dashboard/agents" },
      { id: "create", icon: "✎", label: "إنشاء خطة", latin: "Create", href: "/dashboard/create" },
      { id: "slides", icon: "🖥️", label: "العروض", latin: "Slides", href: "/dashboard/slides" },
      { id: "chat", icon: "💬", label: "المحادثة", latin: "Chat", href: "/chat" },
      { id: "studyTools", icon: "🛠️", label: "أدوات الدراسة", latin: "Study Tools", href: "/study-tools" },
      { id: "aiStudio", icon: "🎨", label: "استوديو AI", latin: "AI Studio", href: "/ai-studio" },
    ],
  },
  {
    title: "التخطيط",
    items: [
      { id: "planner", icon: "🎯", label: "المخطط", latin: "Planner", href: "/dashboard/planner" },
      { id: "calendar", icon: "📅", label: "التقويم", latin: "Calendar", href: "/dashboard/calendar" },
      { id: "missions", icon: "✅", label: "مهام اليوم", latin: "Daily Missions", href: "/missions" },
    ],
  },
  {
    title: "التقدم",
    items: [
      { id: "achievements", icon: "🏆", label: "الإنجازات", latin: "Achievements", href: "/dashboard/achievements" },
      { id: "rewards", icon: "🪙", label: "سجل المكافآت", latin: "Rewards", href: "/rewards" },
      { id: "analytics", icon: "📊", label: "التحليلات", latin: "Analytics", scrollTo: "analytics" },
      { id: "leaderboard", icon: "🥇", label: "لوحة المتصدرين", latin: "Leaderboard", signal: "leaderboard" },
      { id: "shop", icon: "🛍️", label: "المتجر", latin: "Shop", href: "/shop" },
      { id: "plans", icon: "📋", label: "الخطط", latin: "Plans", href: "/plans" },
      { id: "xpShop", icon: "✨", label: "اصرف نقاطك", latin: "XP Rewards", signal: "xpShop" },
      { id: "inventory", icon: "🎒", label: "المخزن", latin: "Inventory", href: "/inventory" },
    ],
  },
  {
    title: "المجتمع",
    items: [
      { id: "community", icon: "C", label: "المجتمع", latin: "Community", href: "/community" },
    ],
  },
  {
    title: "الباقة والرصيد",
    items: [
      { id: "pricing", icon: "ًں’³", label: "الباقات", latin: "Pricing", href: "/pricing" },
      { id: "store", icon: "ًں›’", label: "حزم الرصيد", latin: "Credit Store", href: "/store" },
    ],
  },
  {
    title: "حسابي وإعداداتي",
    items: [
      { id: "career", icon: "ًں’¼", label: "المسار المهني", latin: "Career", href: "/dashboard/career" },
      { id: "parentReport", icon: "ًں“„", label: "تقرير المتابعة", latin: "Report", signal: "parentReport" },
      { id: "settings", icon: "âڑ™ï¸ڈ", label: "الإعدادات", latin: "Settings", signal: "settings" },
      { id: "profile", icon: "P", label: "الملف الشخصي", latin: "Profile", href: "/dashboard/profile" },
    ],
  },
];

export const NAV_ITEMS: NavItemDef[] = NAV_GROUPS.flatMap((g) => g.items);

/* --------------------------------------------------------------------------
   نية التنقل

   المشكلة: بنود زي آ«المساعد الذكيآ» وآ«الملاحظاتآ» جوه صفحة الداشبورد —
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

   من مساحة العمل، آ«اسأل المساعد عن المادة ديآ» لازم تفتح المحادثة **ومعاها**
   نص المادة مرفوع كمرفق. المحادثة عايشة في الداشبورد، فالمادة بتتكتب هنا،
   وبنكتب معاها نية `modal → ai`، والداشبورد بتسلّمها للمودال.

   ليه sessionStorage ومش state؟ لأن فيه تنقّل صفحة كامل بين الاتنين.
   âڑ ï¸ڈ حد الحجم: النص بيتقص على ٦ آلاف حرف — نفس حد المرفقات في المحادثة
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

   من صفحة الدرس، آ«اعمل عرض من الشرح دهآ» لازم تفتح مولّد العروض والموضوع
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

/** أي بند آ«مفتوحآ» حالياً بناءً على المسار لوحده. */
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

