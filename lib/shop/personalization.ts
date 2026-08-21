import type { Category, ShopItem } from "./types";

/** اهتمامات اختيارية، وليست وصفاً أو تصنيفاً للمستخدم. */
export const INTERESTS = [
  { id: "football", label: "كرة القدم", icon: "⚽", categories: ["effect", "frame", "title"] },
  { id: "cars", label: "العربيات", icon: "🏎️", categories: ["avatar", "frame", "effect"] },
  { id: "gaming", label: "Gaming", icon: "🎮", categories: ["theme", "avatar", "effect"] },
  { id: "tech", label: "التكنولوجيا", icon: "💻", categories: ["theme", "companion", "frame"] },
  { id: "music", label: "الموسيقى", icon: "🎵", categories: ["sound", "theme", "effect"] },
  { id: "movies", label: "الأفلام", icon: "🎬", categories: ["avatar", "title", "effect"] },
  { id: "sports", label: "الرياضة", icon: "🏃", categories: ["title", "frame", "companion"] },
  { id: "travel", label: "السفر", icon: "✈️", categories: ["theme", "avatar", "frame"] },
  { id: "books", label: "الكتب", icon: "📚", categories: ["theme", "title", "companion"] },
  { id: "design", label: "التصميم", icon: "🎨", categories: ["theme", "frame", "effect"] },
  { id: "business", label: "البيزنس", icon: "📈", categories: ["title", "theme", "avatar"] },
] as const satisfies readonly {
  id: string;
  label: string;
  icon: string;
  categories: readonly Category[];
}[];

export type InterestId = (typeof INTERESTS)[number]["id"];
export type StylePreference = "calm" | "bold" | "minimal" | null;

export type Personalization = {
  interests: InterestId[];
  style: StylePreference;
  completed: boolean;
};

export const EMPTY_PERSONALIZATION: Personalization = {
  interests: [],
  style: null,
  completed: false,
};

export function isInterestId(value: string): value is InterestId {
  return INTERESTS.some((interest) => interest.id === value);
}

/**
 * ترتيب التوصيات قابل للتفسير: الاهتمامات أولاً، ثم ما اشترى المستخدم من
 * نفس الأقسام. لا نعرض أو نخزّن أي استنتاج حساس عن المستخدم.
 */
export function personalizedCategories(
  interests: readonly InterestId[],
  purchased: readonly ShopItem[],
): Category[] {
  const score = new Map<Category, number>();
  for (const interest of INTERESTS) {
    if (!interests.includes(interest.id)) continue;
    interest.categories.forEach((category, index) =>
      score.set(category, (score.get(category) ?? 0) + 6 - index),
    );
  }
  purchased.forEach((item) => score.set(item.category, (score.get(item.category) ?? 0) + 2));

  return [...score.entries()]
    .sort(([a, aScore], [b, bScore]) => bScore - aScore || a.localeCompare(b))
    .map(([category]) => category);
}

export function recommendationsFor(
  catalog: readonly ShopItem[],
  interests: readonly InterestId[],
  purchased: readonly ShopItem[],
  ownedIds: ReadonlySet<string>,
): ShopItem[] {
  const categories = personalizedCategories(interests, purchased);
  if (categories.length === 0) return [];
  const rank = new Map(categories.map((category, index) => [category, index]));

  return catalog
    .filter((item) => !ownedIds.has(item.id) && rank.has(item.category))
    .sort(
      (a, b) =>
        (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99) ||
        Number(!!b.featured) - Number(!!a.featured) ||
        a.price - b.price,
    )
    .slice(0, 8);
}
