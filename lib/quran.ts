/* ==========================================================================
   تطبيع قائمة قرّاء القرآن

   المنطق ده عايش برة `app/api/quran/reciters/route.ts` عن قصد لسببين:
     ١. Next بيتحقق من الـ exports في ملفات الراوت — أي export زيادة عن
        دوال الـ HTTP والإعدادات المعروفة بيكسر البيلد، فمفيش طريقة
        نصدّر الدوال دي من هناك عشان نختبرها.
     ٢. الشكل اللي بييجي من mp3quran.net مش تحت سيطرتنا، فالتحقق منه
        محتاج يتكتب مرة ويتقرا لوحده.
   ========================================================================== */

import type { Reciter } from "@/app/dashboard/components/audio-library";

/**
 * الـ `server` بيروح مباشرة لـ `<audio src>` في متصفح المستخدم، يعني
 * أي دومين هنا بياخد الـ IP والـ Referer بتاعه. الرد مش تحت سيطرتنا،
 * فبنقفل الوجهة على نطاق المصدر المعروف بدل ما نثق في «https كفاية».
 */
const ALLOWED_HOST_SUFFIX = ".mp3quran.net";

/** سقف على حجم الرد: الرد الطبيعي ~٢٠٠ قارئ، وده بيروح للكلاينت كله. */
const MAX_RECITERS = 400;

/** الاسم بيتعرض في قايمة، والرد مش تحت سيطرتنا فبنقصّه بدل ما يكسر التخطيط. */
const MAX_NAME_LEN = 80;

interface RawMoshaf {
  name?: unknown;
  server?: unknown;
  surah_total?: unknown;
  surah_list?: unknown;
}

interface RawReciter {
  id?: unknown;
  name?: unknown;
  moshaf?: unknown;
}

/**
 * التحقق بيتم على الـ hostname المفكوك مش بـ `startsWith` على النص:
 * `https://mp3quran.net.evil.com/` بيعدّي أي فحص نصي، والـ URL parser
 * هو الحاجة الوحيدة اللي بتعرف فين الهوست بيخلص بالظبط.
 */
function isAllowedServer(server: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(server);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return host === ALLOWED_HOST_SUFFIX.slice(1) || host.endsWith(ALLOWED_HOST_SUFFIX);
}

export function parseSurahList(value: unknown, total: unknown): number[] {
  if (typeof value === "string" && value.trim()) {
    const nums = value
      .split(",")
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 114);
    if (nums.length) return Array.from(new Set(nums)).sort((a, b) => a - b);
  }
  // مفيش ليستة صريحة؟ لو العدد ١١٤ يبقى المصحف كامل
  const count = typeof total === "number" ? total : Number(total);
  if (count === 114) return Array.from({ length: 114 }, (_, i) => i + 1);
  return [];
}

/**
 * القارئ الواحد ممكن يكون عنده أكتر من مصحف (مرتل، مجوّد، روايات).
 * بنختار الأكمل (أكتر سور)، ولو اتساوا بنفضّل «المرتل» — هو المناسب
 * للمذاكرة، والمجوّد أبطأ وأطول بكتير.
 */
export function pickMoshaf(moshafs: RawMoshaf[]): { server: string; surahs: number[] } | null {
  let best: { server: string; surahs: number[]; murattal: boolean } | null = null;

  for (const m of moshafs) {
    if (typeof m.server !== "string") continue;
    // https بس: الصفحة نفسها https والمتصفح بيرفض صوت http جواها.
    // والدومين لازم يكون من المصدر المعروف — شوف ALLOWED_HOST_SUFFIX.
    if (!isAllowedServer(m.server)) continue;
    const surahs = parseSurahList(m.surah_list, m.surah_total);
    if (surahs.length === 0) continue;

    const murattal = typeof m.name === "string" && m.name.includes("مرتل");
    const candidate = { server: m.server, surahs, murattal };

    if (
      !best ||
      candidate.surahs.length > best.surahs.length ||
      (candidate.surahs.length === best.surahs.length && candidate.murattal && !best.murattal)
    ) {
      best = candidate;
    }
  }

  return best ? { server: best.server, surahs: best.surahs } : null;
}

export function normalizeReciters(payload: unknown): Reciter[] {
  if (typeof payload !== "object" || payload === null) return [];
  const list = (payload as { reciters?: unknown }).reciters;
  if (!Array.isArray(list)) return [];

  const out: Reciter[] = [];
  for (const entry of list as RawReciter[]) {
    // السقف بيتفرض هنا مش بعد الحلقة: من غيره، رد ضخم كان هيتبني كله
    // في الذاكرة الأول وبعدين نرمي الزيادة — ده الشغل اللي عايزين
    // نتجنّبه أصلاً.
    if (out.length >= MAX_RECITERS) break;
    if (typeof entry !== "object" || entry === null) continue;
    const id = typeof entry.id === "number" ? entry.id : Number(entry.id);
    const name = typeof entry.name === "string" ? entry.name.trim().slice(0, MAX_NAME_LEN) : "";
    if (!Number.isInteger(id) || !name) continue;
    if (!Array.isArray(entry.moshaf)) continue;

    const picked = pickMoshaf(entry.moshaf as RawMoshaf[]);
    if (!picked) continue;

    out.push({ id, name, server: picked.server, surahs: picked.surahs });
  }

  // القرّاء الكاملين الأول: اللي عنده ١١٤ سورة أنفع من اللي عنده ٣،
  // والترتيب الأصلي أبجدي بالحرف الأول ومش مفيد هنا.
  return out.sort(
    (a, b) => b.surahs.length - a.surahs.length || a.name.localeCompare(b.name, "ar")
  );
}
