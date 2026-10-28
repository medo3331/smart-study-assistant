/* ==========================================================================
   ظ‚ط§ظٹظ…ط© ط§ظ„طھظ†ظ‚ظ„ â€” ظ…طµط¯ط± ظˆط§ط­ط¯ ظ„ظ„ط­ظ‚ظٹظ‚ط©

   ظƒظ„ ط§ظ„ط¨ظ†ظˆط¯ ظ…طھط¹ط±ظ‘ظپظٹظ† ظ‡ظ†ط§ ظ…ط±ط© ظˆط§ط­ط¯ط©. NavRail ط¨طھط±ط³ظ…ظ‡ظ…طŒ ظˆط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯
   ط¨طھظ‚ط±ط§ "ط§ظ„ظ†ظٹط©" ظ…ظ†ظ‡ظ…. ظ„ظˆ ط¹ط§ظٹط² طھط²ظˆظ‘ط¯ ط¨ظ†ط¯ ط£ظˆ طھط؛ظٹظ‘ط± طھط±طھظٹط¨طŒ ظ‡ظ†ط§ ط¨ط³.

   ظƒظ„ ط¨ظ†ط¯ ط¨ظٹط¹ظ…ظ„ ط­ط§ط¬ط© ظ…ظ† طھظ„ط§طھط©:
     href      â†’ طµظپط­ط© ظƒط§ظ…ظ„ط© (router.push)
     scrollTo  â†’ ظ‚ط³ظ… ط¬ظˆظ‡ طµظپط­ط© ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯
     signal    â†’ ط¥ط¬ط±ط§ط، ظ…ط­طھط§ط¬ ط­ط§ظ„ط© ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ظ†ظپط³ظ‡ط§ (ظ…ظˆط¯ط§ظ„)
   ========================================================================== */

/* âڑ ï¸ڈ ط§ظ„ظ„ظٹط³طھط© ط¯ظٹ ظ‡ظٹ ط§ظ„ظ…ط±ط¬ط¹ ظ„ظ€ `isNavSignal` طھط­طھ. ط£ظٹ ط¥ط´ط§ط±ط© ط¬ط¯ظٹط¯ط© طھطھط²ظˆظ‘ط¯ ظ‡ظ†ط§
   ظˆط¨ط³ â€” ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط§ظ„ظ†ظٹط© ط§ظ„ظ…ط­ظپظˆط¸ط© ط¨ظٹطھظˆظ„ظ‘ط¯ ظ…ظ†ظ‡ط§طŒ ظپظ…ط§ظپظٹط´ ظ…ظƒط§ظ† طھط§ظ†ظٹ طھظ†ط³ط§ظ‡. */
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
  label: string; // ط§ظ„ط¹ط±ط¨ظٹ â€” ظ‡ظˆ ط§ظ„ط£ط³ط§ط³ظٹ
  latin: string; // ط§ظ„ط¥ظ†ط¬ظ„ظٹط²ظٹ â€” ظ„ط§ظپطھط© طµط؛ظٹط±ط©طŒ ط¨طھط¯ظٹ ط¥ظٹظ‚ط§ط¹ ظ„ظ„ظ‚ط§ظٹظ…ط©
  href?: string;
  scrollTo?: string;
  signal?: NavSignal;
  /** ط¨ظ†ط¯ ط®ط·ط± â€” ط¨ظٹطھظ„ظˆظ‘ظ† ط£ط­ظ…ط± ط¨ط¯ظ„ ط§ظ„ط±ظ…ط§ط¯ظٹ ط§ظ„ظ‡ط§ط¯ظٹ (ط§ظ„ط·ظˆط§ط±ط¦ ط¨ط³ ط¯ظ„ظˆظ‚طھظٹ) */
  tone?: "danger";
}

export interface NavGroupDef {
  title: string;
  items: NavItemDef[];
}

// âڑ ï¸ڈ ط§ظ„طھط±طھظٹط¨ ظ‡ظ†ط§ ظ‡ظˆ طھط±طھظٹط¨ ط§ظ„ظ…ط³طھط®ط¯ظ… ط¨ط§ظ„ط¸ط¨ط·. ط§ظ„ظ…ط¬ظ…ظˆط¹ط§طھ ط§طھط²ظˆظ‘ط¯طھ ط¹ط´ط§ظ† ط§ظ„ط¨ظ†ظˆط¯
// ظˆط±ط§ ط¨ط¹ط¶ ط¨ظٹط¨ظ‚ظˆط§ ط­ظٹط·ط©طŒ ط¨ط³ ظ…ظ† ط؛ظٹط± ظ…ط§ ظٹطھط؛ظٹظ‘ط± طھط±طھظٹط¨ ط£ظٹ ط¨ظ†ط¯.
//
// ًں—“ï¸ڈ ظ¨ ط£ط؛ط³ط·ط³: ط§ظ„ط´ط±ظٹط· ط§ظ„ط¹ظ„ظˆظٹ ظپظٹ ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ط§طھط´ط§ظ„ ط¨ط§ظ„ظƒط§ظ…ظ„ (ط·ظ„ط¨ ط§ظ„ظ…ط³طھط®ط¯ظ…:
// آ«ظ‚ط§ظٹظ…ط© ظˆط§ط­ط¯ط© ط¨ط³ ط§ظ„ظ„ظٹ ط¹ظ„ظ‰ ط§ظ„ط´ظ…ط§ظ„ ظپظٹظ‡ط§ ظƒظ„ ط­ط§ط¬ط©آ»). ط¨ظ†ظˆط¯ظ‡ ط§طھظˆط²ظ‘ط¹ظˆط§ ظ‡ظ†ط§ â€”
// ط§ظ„ط·ظˆط§ط±ط¦ ظپظٹ آ«ط§ظ„ظ…ط°ط§ظƒط±ط©آ»طŒ ظˆط§ظ„ظ…طھطµط¯ط±ظٹظ† ظˆط§طµط±ظپ ظ†ظ‚ط§ط·ظƒ ظپظٹ آ«ط§ظ„طھظ‚ط¯ظ‘ظ…آ»طŒ ظˆطھظ‚ط±ظٹط±
// ط§ظ„ظ…طھط§ط¨ط¹ط© ظپظٹ آ«ط§ظ„ط­ط³ط§ط¨آ». ط§ظ„ط¨ظ†ظˆط¯ ط§ظ„ظ‚ط¯ظٹظ…ط© ظƒظ„ظ‡ط§ ظپط¶ظ„طھ ط¨ظ†ظپط³ طھط±طھظٹط¨ظ‡ط§ ط§ظ„ظ†ط³ط¨ظٹ.
export const NAV_GROUPS: NavGroupDef[] = [
  {
    title: "ط§ظ„ط±ط¦ظٹط³ظٹط©",
    items: [
      { id: "home", icon: "ًںڈ ", label: "ط§ظ„ط±ط¦ظٹط³ظٹط©", latin: "Home", href: "/dashboard" },
    ],
  },
  {
    title: "ط§ظ„طھط¹ظ„ظ‘ظ…",
    items: [
      { id: "courses", icon: "ًں“ڑ", label: "ط§ظ„ظƒظˆط±ط³ط§طھ", latin: "Courses", href: "/dashboard/courses" },
      { id: "workspace", icon: "ًں—‚ï¸ڈ", label: "ظ…ط³ط§ط­ط© ط§ظ„ط¹ظ…ظ„", latin: "Workspace", href: "/dashboard/workspace" },
      { id: "create", icon: "âœژ", label: "ط¥ظ†ط´ط§ط، ط®ط·ط©", latin: "Create", href: "/dashboard/create" },
      { id: "planner", icon: "ًںژ¯", label: "ط§ظ„ظ…ط®ط·ط·", latin: "Planner", href: "/dashboard/planner" },
      { id: "calendar", icon: "ًں“…", label: "ط§ظ„طھظ‚ظˆظٹظ…", latin: "Calendar", href: "/dashboard/calendar" },
      { id: "notes", icon: "ًں“‌", label: "ط§ظ„ظ…ظ„ط§ط­ط¸ط§طھ", latin: "Notes", scrollTo: "notes" },
      { id: "quran", icon: "ًں“–", label: "ط§ظ„ظ‚ط±ط¢ظ† ط§ظ„ظƒط±ظٹظ…", latin: "Quran", scrollTo: "quran" },
      { id: "worship", icon: "ًں•Œ", label: "ط¹ط¨ط§ط¯ط§طھظٹ", latin: "Worship Center", href: "/worship" },
      { id: "exams", icon: "ًں“‹", label: "ط¨ظ†ظƒ ط§ظ„ط§ظ…طھط­ط§ظ†ط§طھ", latin: "Past Exams", href: "/exams" },
      { id: "lectures", icon: "ًںژ™ï¸ڈ", label: "ظ…ط­ط§ط¶ط±ط§طھظٹ", latin: "My Lectures", href: "/lectures" },
      { id: "slides", icon: "ًں–¥ï¸ڈ", label: "ط§ظ„ط¹ط±ظˆط¶", latin: "Slides", href: "/dashboard/slides" },
      { id: "break", icon: "âک•", label: "ط§ط³طھط±ط§ط­ط©", latin: "Break Zone", href: "/break" },
      { id: "escape", icon: "ًں§©", label: "ط؛ط±ظپط© ط§ظ„ظ‡ط±ظˆط¨", latin: "Escape Room", href: "/escape-room" },
      { id: "emergency", icon: "ًںڑ¨", label: "ظˆط¶ط¹ ط§ظ„ط·ظˆط§ط±ط¦", latin: "Emergency", signal: "emergency", tone: "danger" },
    ],
  },
  {
    title: "ظ…ط³ط§ط­ط© ط§ظ„ط°ظƒط§ط،",
    items: [
      { id: "ai", icon: "ًں¤–", label: "ط§ظ„ظ…ط³ط§ط¹ط¯ ط§ظ„ط°ظƒظٹ", latin: "AI Assistant", href: "/chat" },
      { id: "agents", icon: "âœ¦", label: "ظˆظƒظ„ط§ط، ط§ظ„ط°ظƒط§ط،", latin: "AI Agents", href: "/dashboard/agents" },
    ],
  },
  {
    title: "طھظ‚ط¯ظ…ظٹ ظˆط¥ظ†ط¬ط§ط²ط§طھظٹ",
    items: [
      { id: "achievements", icon: "ًںڈ†", label: "ط§ظ„ط¥ظ†ط¬ط§ط²ط§طھ", latin: "Achievements", href: "/dashboard/achievements" },
      { id: "missions", icon: "âœ…", label: "ظ…ظ‡ط§ظ… ط§ظ„ظٹظˆظ…", latin: "Daily Missions", href: "/missions" },
      { id: "rewards", icon: "ًںھ™", label: "ط³ط¬ظ„ ط§ظ„ظ…ظƒط§ظپط¢طھ", latin: "Rewards", href: "/rewards" },
      { id: "analytics", icon: "ًں“ٹ", label: "ط§ظ„طھط­ظ„ظٹظ„ط§طھ", latin: "Analytics", href: "/dashboard/progress" },
      { id: "leaderboard", icon: "ًں¥‡", label: "ظ„ظˆط­ط© ط§ظ„ظ…طھطµط¯ط±ظٹظ†", latin: "Leaderboard", signal: "leaderboard" },
      { id: "shop", icon: "ًں›چï¸ڈ", label: "ط§ظ„ظ…طھط¬ط±", latin: "Shop", href: "/shop" },
      { id: "plans", icon: "ًں“‹", label: "ط§ظ„ط®ط·ط·", latin: "Plans", href: "/plans" },
      { id: "xpShop", icon: "âœ¨", label: "ط§طµط±ظپ ظ†ظ‚ط§ط·ظƒ", latin: "XP Rewards", signal: "xpShop" },
      { id: "inventory", icon: "ًںژ’", label: "ط§ظ„ظ…ط®ط²ظ†", latin: "Inventory", href: "/inventory" },
    ],
  },
  {
    title: "ط§ظ„ظ…ط¬طھظ…ط¹",
    items: [
      { id: "community", icon: "ًں‘¥", label: "ط§ظ„ظ…ط¬طھظ…ط¹", latin: "Community", href: "/community" },
    ],
  },
  {
    title: "ط§ظ„ط¨ط§ظ‚ط© ظˆط§ظ„ط±طµظٹط¯",
    items: [
      { id: "pricing", icon: "ًں’³", label: "ط§ظ„ط¨ط§ظ‚ط§طھ", latin: "Pricing", href: "/pricing" },
      { id: "store", icon: "ًں›’", label: "ط­ط²ظ… ط§ظ„ط±طµظٹط¯", latin: "Credit Store", href: "/store" },
    ],
  },
  {
    title: "ط­ط³ط§ط¨ظٹ ظˆط¥ط¹ط¯ط§ط¯ط§طھظٹ",
    items: [
      { id: "career", icon: "ًں’¼", label: "ط§ظ„ظ…ط³ط§ط± ط§ظ„ظ…ظ‡ظ†ظٹ", latin: "Career", href: "/dashboard/career" },
      { id: "parentReport", icon: "ًں“„", label: "طھظ‚ط±ظٹط± ط§ظ„ظ…طھط§ط¨ط¹ط©", latin: "Report", signal: "parentReport" },
      { id: "settings", icon: "âڑ™ï¸ڈ", label: "ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ", latin: "Settings", signal: "settings" },`n      { id: "profile", icon: "P", label: "ط§ظ„ظ…ظ„ظپ ط§ظ„ط´ط®طµظٹ", latin: "Profile", href: "/dashboard/profile" },
    ],
  },
];

export const NAV_ITEMS: NavItemDef[] = NAV_GROUPS.flatMap((g) => g.items);

/* --------------------------------------------------------------------------
   ظ†ظٹط© ط§ظ„طھظ†ظ‚ظ„

   ط§ظ„ظ…ط´ظƒظ„ط©: ط¨ظ†ظˆط¯ ط²ظٹ آ«ط§ظ„ظ…ط³ط§ط¹ط¯ ط§ظ„ط°ظƒظٹآ» ظˆآ«ط§ظ„ظ…ظ„ط§ط­ط¸ط§طھآ» ط¬ظˆظ‡ طµظپط­ط© ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ â€”
   ظ…ظˆط¯ط§ظ„ ط£ظˆ ظ‚ط³ظ…. ظ„ظˆ ط§ظ„ظ…ط³طھط®ط¯ظ… ط¯ظˆط³ ط¹ظ„ظٹظ‡ظ… ظˆظ‡ظˆ ظپظٹ /dashboard/workspaceطŒ ظ„ط§ط²ظ…
   ظ†ظ†ظ‚ظ„ظ‡ ظ„ظ„ط¯ط§ط´ط¨ظˆط±ط¯ **ظˆط¨ط¹ط¯ظٹظ†** ظ†ظپطھط­ ط§ظ„ظ…ظˆط¯ط§ظ„ ط£ظˆ ظ†ط³ظƒط±ظˆظ„.

   ط§ظ„ط­ظ„: ظ†ظƒطھط¨ ط§ظ„ظ†ظٹط© ظپظٹ sessionStorageطŒ ظ†ظ†ظ‚ظ„طŒ ظˆط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ط¨طھظ‚ط±ط§ظ‡ط§ ط¨ط¹ط¯ ظ…ط§
   ط¨ظٹط§ظ†ط§طھظ‡ط§ طھط®ظ„طµ طھط­ظ…ظٹظ„. sessionStorage ظ…ط´ localStorage ط¹ظ† ظ‚طµط¯ â€” ط¯ظٹ ظ†ظٹط©
   ظ„ط­ط¸ظٹط©طŒ ظ…ط§ظٹظ†ظپط¹ط´ طھظپط¶ظ„ ظ…ط³طھظ†ظٹط© ظ„ط¨ظƒط±ط©.
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
    // ط§ظ„ط³طھظˆط±ظٹط¬ ظ…ظ‚ظپظˆظ„ (طھطµظپط­ ط®ظپظٹ) â€” ط§ظ„ظ…ط³طھط®ط¯ظ… ظ‡ظٹظˆطµظ„ ظ„ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ظˆط¨ط³
  }
}

/** ط¨طھظ‚ط±ط§ ط§ظ„ظ†ظٹط© ظˆط¨طھظ…ط³ط­ظ‡ط§ ظپظٹ ظ†ظپط³ ط§ظ„ظ†ط¯ط§ط، â€” ظ†ظٹط© ظˆط§ط­ط¯ط© طھطھظ†ظپظ‘ط° ظ…ط±ط© ظˆط§ط­ط¯ط©. */
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
   ط¨ط°ط±ط© ط§ظ„ظ…ط­ط§ط¯ط«ط©

   ظ…ظ† ظ…ط³ط§ط­ط© ط§ظ„ط¹ظ…ظ„طŒ آ«ط§ط³ط£ظ„ ط§ظ„ظ…ط³ط§ط¹ط¯ ط¹ظ† ط§ظ„ظ…ط§ط¯ط© ط¯ظٹآ» ظ„ط§ط²ظ… طھظپطھط­ ط§ظ„ظ…ط­ط§ط¯ط«ط© **ظˆظ…ط¹ط§ظ‡ط§**
   ظ†طµ ط§ظ„ظ…ط§ط¯ط© ظ…ط±ظپظˆط¹ ظƒظ…ط±ظپظ‚. ط§ظ„ظ…ط­ط§ط¯ط«ط© ط¹ط§ظٹط´ط© ظپظٹ ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯طŒ ظپط§ظ„ظ…ط§ط¯ط© ط¨طھطھظƒطھط¨ ظ‡ظ†ط§طŒ
   ظˆط¨ظ†ظƒطھط¨ ظ…ط¹ط§ظ‡ط§ ظ†ظٹط© `modal â†’ ai`طŒ ظˆط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ط¨طھط³ظ„ظ‘ظ…ظ‡ط§ ظ„ظ„ظ…ظˆط¯ط§ظ„.

   ظ„ظٹظ‡ sessionStorage ظˆظ…ط´ stateطں ظ„ط£ظ† ظپظٹظ‡ طھظ†ظ‚ظ‘ظ„ طµظپط­ط© ظƒط§ظ…ظ„ ط¨ظٹظ† ط§ظ„ط§طھظ†ظٹظ†.
   âڑ ï¸ڈ ط­ط¯ ط§ظ„ط­ط¬ظ…: ط§ظ„ظ†طµ ط¨ظٹطھظ‚طµ ط¹ظ„ظ‰ ظ¦ ط¢ظ„ط§ظپ ط­ط±ظپ â€” ظ†ظپط³ ط­ط¯ ط§ظ„ظ…ط±ظپظ‚ط§طھ ظپظٹ ط§ظ„ظ…ط­ط§ط¯ط«ط©
   (MAX_FILE_CHARS)طŒ ظپظ…ظپظٹط´ ظپط§ظٹط¯ط© ظ…ظ† طھط®ط²ظٹظ† ط£ظƒطھط± ظ…ظ† ظƒط¯ظ‡.
   -------------------------------------------------------------------------- */

const SEED_KEY = "ai_seed";
const SEED_MAX_CHARS = 6000;

export interface AiSeed {
  /** ط§ط³ظ… ط§ظ„ظ…ط§ط¯ط© â€” ط¨ظٹط¸ظ‡ط± ظƒط§ط³ظ… ط§ظ„ظ…ط±ظپظ‚ */
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
    // ط§ظ„ط³طھظˆط±ظٹط¬ ظ…ظ‚ظپظˆظ„ â€” ط§ظ„ظ…ط­ط§ط¯ط«ط© ظ‡طھظپطھط­ ظپط§ط¶ظٹط© ظˆط¯ظ‡ ظ…ظ‚ط¨ظˆظ„
  }
}

/** ط¨طھظ‚ط±ط§ ط§ظ„ط¨ط°ط±ط© ظˆط¨طھظ…ط³ط­ظ‡ط§ â€” ط²ظٹ ط§ظ„ظ†ظٹط©طŒ ظ…ط±ط© ظˆط§ط­ط¯ط© ط¨ط³. */
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
   ط¨ط°ط±ط© ط§ظ„ط¹ط±ط¶ ط§ظ„طھظ‚ط¯ظٹظ…ظٹ

   ظ…ظ† طµظپط­ط© ط§ظ„ط¯ط±ط³طŒ آ«ط§ط¹ظ…ظ„ ط¹ط±ط¶ ظ…ظ† ط§ظ„ط´ط±ط­ ط¯ظ‡آ» ظ„ط§ط²ظ… طھظپطھط­ ظ…ظˆظ„ظ‘ط¯ ط§ظ„ط¹ط±ظˆط¶ ظˆط§ظ„ظ…ظˆط¶ظˆط¹
   ظˆط§ظ„ظ…ط­طھظˆظ‰ ظ…ط­ط·ظˆط·ظٹظ† ط¬ظˆط§ظ‡. ظ†ظپط³ ظ…ظ†ط·ظ‚ ط¨ط°ط±ط© ط§ظ„ظ…ط­ط§ط¯ط«ط© ط¨ط§ظ„ط¸ط¨ط·: طھظ†ظ‚ظ‘ظ„ طµظپط­ط© ظƒط§ظ…ظ„
   ط¨ظٹظ† ط§ظ„ط§طھظ†ظٹظ†طŒ ظپط§ظ„ظ€ state ظ…ط´ ط¨ظٹظ†ظپط¹ ظˆ sessionStorage ظ‡ظˆ ط§ظ„ط­ظ„.

   ظ„ظٹظ‡ ظ†ط¨ط¹طھ ط§ظ„ط´ط±ط­ ظ…ط´ ط§ظ„ظ…ظˆط¶ظˆط¹ ط¨ط³طں ط¹ط´ط§ظ† ط§ظ„ط´ط±ط§ط¦ط­ طھط·ظ„ط¹ ظ…ظ† ط§ظ„ظ„ظٹ ط§ظ„ط¯ط±ط³ ظ‚ط§ظ„ظ‡
   ظپط¹ظ„ط§ظ‹طŒ ظ…ط´ ظ…ظ† ظ…ط¹ط±ظپط© ط§ظ„ظ…ظˆط¯ظٹظ„ ط§ظ„ط¹ط§ظ…ط© ط¹ظ† ط§ظ„ط¹ظ†ظˆط§ظ†.
   -------------------------------------------------------------------------- */

const SLIDES_SEED_KEY = "slides_seed";
/** ظ†ظپط³ ط­ط¯ MAX_SOURCE_CHARS ظپظٹ /api/generate-slides â€” ط£ظƒطھط± ظ…ظ† ظƒط¯ظ‡ ط¨ظٹطھظ‚طµ ظ‡ظ†ط§ظƒ. */
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
    // ط§ظ„ط³طھظˆط±ظٹط¬ ظ…ظ‚ظپظˆظ„ â€” ط§ظ„طµظپط­ط© ظ‡طھظپطھط­ ظپط§ط¶ظٹط© ظˆط§ظ„ظ…ط³طھط®ط¯ظ… ظٹظƒطھط¨ ط§ظ„ظ…ظˆط¶ظˆط¹ ط¨ط¥ظٹط¯ظ‡
  }
}

/** ط¨طھظ‚ط±ط§ ط§ظ„ط¨ط°ط±ط© ظˆط¨طھظ…ط³ط­ظ‡ط§ â€” ظ…ط±ط© ظˆط§ط­ط¯ط© ط¨ط³طŒ ط²ظٹ ط¨ط§ظ‚ظٹ ط§ظ„ط¨ط°ظˆط±. */
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

/** ط£ظٹ ط¨ظ†ط¯ آ«ظ…ظپطھظˆط­آ» ط­ط§ظ„ظٹط§ظ‹ ط¨ظ†ط§ط،ظ‹ ط¹ظ„ظ‰ ط§ظ„ظ…ط³ط§ط± ظ„ظˆط­ط¯ظ‡. */
export function activeNavId(pathname: string): string | null {
  const exact = NAV_ITEMS.find((i) => i.href === pathname);
  if (exact) return exact.id;
  const nested = NAV_ITEMS.find((i) => i.href && i.href !== "/dashboard" && pathname.startsWith(`${i.href}/`));
  return nested ? nested.id : null;
}

/* --------------------------------------------------------------------------
   ظ„ظˆظ† ط§ظ„ظ‚ظ„ظ… ط§ظ„ظ…ط®طھط§ط±

   ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ط¨طھط­ظپط¸ ط§ظ„ط«ظٹظ… ظپظٹ profiles.themeطŒ ظˆط§ظ„طµظپط­ط§طھ ط§ظ„طھط§ظ†ظٹط© ظ…ط´ ط¹ط§ظٹط²ط©
   طھط¹ظ…ظ„ ط§ط³طھط¹ظ„ط§ظ… ظ„ظ…ط¬ط±ط¯ ظ„ظˆظ†. ظپط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ط¨طھط³ظٹط¨ ظ†ط³ط®ط© ظ…ط­ظ„ظٹط© ظˆط§ظ„طµظپط­ط§طھ ط¨طھظ‚ط±ط§ظ‡ط§.
   ط§ظ„ظ…ظپطھط§ط­ ظ…ط´ "theme" ط¹ط´ط§ظ† ظ…ط§ ظٹطھظ„ط®ط¨ط·ط´ ظ…ط¹ ط§ظ„ظپط§طھط­/ط§ظ„ط؛ط§ظ…ظ‚ ط¨طھط§ط¹ ThemeProvider.
   -------------------------------------------------------------------------- */

export const PEN_THEME_KEY = "pen_theme";

/* --------------------------------------------------------------------------
   ط¨ظٹط§ظ†ط§طھ ظƒط§ط±طھ ط§ظ„ط­ط³ط§ط¨

   ط§ظ„ظƒط§ط±طھ ط§ظ„ظ„ظٹ طھط­طھ ط§ظ„ظ‚ط§ظٹظ…ط© ط¨ظٹط¹ط±ط¶ ظ†ظپط³ ط§ظ„ط§ط³ظ… ظˆط§ظ„ط¥ظٹظ…ظٹظ„ ظپظٹ ظƒظ„ ط§ظ„طµظپط­ط§طھ. ط§ظ„ط§ط´طھظ‚ط§ظ‚
   ط¹ط§ظٹط´ ظ‡ظ†ط§ ط¹ط´ط§ظ† ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ (ط§ظ„ظ„ظٹ ظ…ط¹ط§ظ‡ط§ ط§ظ„ظ…ط³طھط®ط¯ظ… ط£طµظ„ط§ظ‹) ظˆط§ظ„طµظپط­ط§طھ ط§ظ„ظپط±ط¹ظٹط©
   (ط§ظ„ظ„ظٹ NavRail ط¨طھط¬ظٹط¨ظ‡ ظ„ظ†ظپط³ظ‡ط§) ظٹط·ظ„ظ‘ط¹ظˆط§ ظ†ظپط³ ط§ظ„ظ†طھظٹط¬ط© ط¨ط§ظ„ط¸ط¨ط· â€” ظ‚ط¨ظ„ ظƒط¯ظ‡ ظƒط§ظ†
   ط§ظ„ط§ط´طھظ‚ط§ظ‚ ظ…ظƒطھظˆط¨ ظپظٹ ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ط¨ط³طŒ ظˆط£ظٹ طµظپط­ط© طھط§ظ†ظٹط© ظƒط§ظ†طھ ظ‡طھط®ظ…ظ‘ظ†.
   -------------------------------------------------------------------------- */

export interface RailAccount {
  displayName: string;
  displayEmail: string;
  avatarInitial: string;
  isGuest: boolean;
}

/** ط§ظ„ط´ظƒظ„ ط§ظ„ظ„ظٹ ظ…ط­طھط§ط¬ظٹظ†ظ‡ ظ…ظ† ظ…ط³طھط®ط¯ظ… ط³ظˆظ¾ط§ط¨ظٹط² â€” ظ…ظƒطھظˆط¨ ط¨ط¥ظٹط¯ظٹظ†ط§ ط¹ط´ط§ظ† ط§ظ„ظ…ظ„ظپ ط¯ظ‡
    ظٹظپط¶ظ„ ظ…ظ† ط؛ظٹط± ط£ظٹ importطŒ ظپظٹظ‚ط¯ط± ظٹطھظ‚ط±ظٹ ظ…ظ† ط§ظ„ط³ظٹط±ظپط± ظˆط§ظ„ظƒظ„ط§ظٹظ†طھ ط¹ظ„ظ‰ ط§ظ„ط³ظˆط§. */
interface AuthUserLike {
  email?: string | null;
  is_anonymous?: boolean;
  user_metadata?: { full_name?: unknown } | null;
}

export function railAccountFromUser(user: AuthUserLike | null | undefined): RailAccount | null {
  if (!user) return null;
  const isGuest = user.is_anonymous === true;
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const displayName = fullName || (isGuest ? "ط²ط§ط¦ط±" : user.email?.split("@")[0]) || "ظ…ط³طھط®ط¯ظ…";
  return {
    displayName,
    displayEmail: user.email || (isGuest ? "ط­ط³ط§ط¨ ط²ط§ط¦ط± (ط؛ظٹط± ظ…ط³ط¬ظ„)" : ""),
    avatarInitial: displayName.trim().charAt(0).toUpperCase() || "طں",
    isGuest,
  };
}

