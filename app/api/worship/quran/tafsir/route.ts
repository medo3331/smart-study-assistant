import { NextRequest, NextResponse } from "next/server";

/* ==========================================================================
   /api/worship/quran/tafsir — تفسير الآية (سيرفر-سايد)

   المصدر: api.quran.com/api/v4 — الاكتشاف تم من /resources/tafsirs:
     • ١٦ = التفسير الميسر (ar-tafsir-muyassar) — الأساسي.
     • ١٤ = تفسير ابن كثير (ar-tafsir-ibn-kathir) — إثرائي.
   النداء: GET /v4/tafsirs/{id}/by_ayah/{surah}:{ayah} (نقطة النهاية
   القديمة /quran/tafsirs رجّعت نتايج فاضية — دي المعتمدة شغّالاً).

   ⚠️ الجلب من الكلاينت ممنوع (CSP بيسد الدومينات الخارجية) — عشان كده
      البروكسي داخلي هنا. التفاسير نصوص ثابتة فالكاش في الميموري (Map + TTL)
      كافي، مع سقف حجم بسيط يمنع تضخّم الذاكرة.

   Response: { surah, ayah, tafsirs: [{ id, name, text }] }
   الفشل: 502 مع { error } — الكلاينت يعرض رسالة لطيفة + زرار إعادة محاولة.
   ========================================================================== */

export const dynamic = "force-dynamic";

const TAFSIR_API_BASE = "https://api.quran.com/api/v4";

/** التفاسير العربية المعتمدة — الميسر أولاً (سهل ومباشر) ثم ابن كثير. */
const TAFSIR_SOURCES = [
  { id: 16, name: "التفسير الميسر" },
  { id: 14, name: "تفسير ابن كثير" },
] as const;

/** صلاحية الكاش — التفاسير ثابتة فاليوم كامل معقول. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** سقف عدد مدخلات الكاش (آية = مدخل) — نفضّي الأقدم عند التجاوز. */
const CACHE_MAX_ENTRIES = 2000;

interface TafsirEntry {
  id: number;
  name: string;
  /** نص مُنظَّف بدون HTML — آمن للعرض مباشرة. */
  text: string;
}

interface CacheEntry {
  expiresAt: number;
  tafsirs: TafsirEntry[];
}

/** كاش الميمونات (عبر الطلبات في نفس الـ instance — serverless فده كافٍ). */
const tafsirCache = new Map<string, CacheEntry>();

function readCache(key: string): TafsirEntry[] | null {
  const hit = tafsirCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    tafsirCache.delete(key);
    return null;
  }
  // LRU مبسّط: إعادة الإدخال ترفعه لآخر الخريطة.
  tafsirCache.delete(key);
  tafsirCache.set(key, hit);
  return hit.tafsirs;
}

function writeCache(key: string, tafsirs: TafsirEntry[]): void {
  if (tafsirCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = tafsirCache.keys().next().value;
    if (oldest !== undefined) tafsirCache.delete(oldest);
  }
  tafsirCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, tafsirs });
}

/**
 * تحويل HTML التفسير لنص عادي آمن للعرض — بدون dangerouslySetInnerHTML:
 * فواصل الفقرات تتحول لأسطر، وكل الوسوم والكيانات تُنظَّف.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchTafsirText(tafsirId: number, ayahKey: string): Promise<string | null> {
  const url = `${TAFSIR_API_BASE}/tafsirs/${tafsirId}/by_ayah/${encodeURIComponent(ayahKey)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
    // التفاسير ثابتة — كاش HTTP من طرف Vercel/الطرف اللي بينيهم برضه مفيد.
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error(`Tafsir source returned HTTP ${response.status} for id ${tafsirId}`);
  }
  const payload = (await response.json()) as { tafsir?: { text?: unknown } | null };
  const text = payload?.tafsir?.text;
  if (typeof text !== "string" || !text.trim()) return null;
  return htmlToText(text);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const surah = Number(searchParams.get("surah"));
  const ayah = Number(searchParams.get("ayah"));

  // صيغة ayah key: {surah}:{ayah} — سور ١..١١٤ وآيات ١..٢٨٦ (أقصى سورة).
  if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1 || ayah > 286) {
    return NextResponse.json(
      { error: "محددات غير صالحة — المطلوب surah (1-114) و ayah (1-286)" },
      { status: 400 },
    );
  }

  const ayahKey = `${surah}:${ayah}`;
  const cached = readCache(ayahKey);
  if (cached) {
    return NextResponse.json({ surah, ayah, tafsirs: cached });
  }

  // نجيب التفسيرين بالتوازي — فشل واحد مابيمنعش التاني.
  const results = await Promise.allSettled(
    TAFSIR_SOURCES.map(async (source) => ({
      id: source.id,
      name: source.name,
      text: await fetchTafsirText(source.id, ayahKey),
    })),
  );

  const tafsirs: TafsirEntry[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.text) {
      tafsirs.push({ id: result.value.id, name: result.value.name, text: result.value.text });
    }
  }

  if (tafsirs.length === 0) {
    // كله فشل أو فاضي — رسالة لطيفة والكلاينت يقدر يعيد المحاولة.
    return NextResponse.json(
      { error: "تعذّر جلب التفسير من المصدر حاليًا — جرّب مرة تانية" },
      { status: 502 },
    );
  }

  writeCache(ayahKey, tafsirs);
  return NextResponse.json({ surah, ayah, tafsirs });
}
