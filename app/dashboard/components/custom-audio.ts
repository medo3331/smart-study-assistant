/* ==========================================================================
   صوتيات المستخدم

   المستخدم بيحط روابط MP3 بتاعته. بتتخزن في localStorage — مش في قاعدة
   البيانات — عن قصد: دي تفضيلات جهاز، والزائر (بدون حساب) لازم يقدر
   يستخدمها، ومفيش سبب نعمل جدول لحاجة ماحدش تاني هيقراها.

   ⚠️ ليه روابط بس ومش رفع ملفات؟ رفع ملفات صوت يعني تخزين حقيقي
   (Supabase Storage) + فاتورة + مسؤولية قانونية على محتوى مرفوع. الرابط
   بيسيب الملف مكانه والمسؤولية على صاحبه.
   ========================================================================== */

import type { SoundTrack } from "./audio-library";

const CUSTOM_KEY = "custom_audio";

/** سقف معقول: القايمة بتتقرا كلها في الذاكرة وبتترسم في لوحة صغيرة. */
export const MAX_CUSTOM_TRACKS = 30;

/** أطول اسم — بيتقص عند الإضافة وعند القراءة، مش عند الإضافة بس. */
const MAX_NAME_LEN = 60;

/**
 * كل تراك مستخدم لازم يبدأ بالبادئة دي.
 *
 * ⚠️ مش تجميل: من غيرها، مدخل مخزّن بـ `id: "music:lofi"` بيتصادم مع
 * تراك مدمج — الاختيار بيتحدّد بالـ id، فالمكتبة بتضوّي الصف الغلط،
 * ومسح الصوت المستعار بيوقّف التراك التاني. الستوريج مفتوح لأي حد على
 * الجهاز، فالبادئة بتتفرض هنا عند القراءة مش بس عند الكتابة.
 */
const CUSTOM_PREFIX = "custom:";

export interface CustomAudioInput {
  name: string;
  url: string;
}

/**
 * بيتأكد إن الرابط صوت من مصدر آمن.
 *
 * ⚠️ https بس: الصفحة نفسها https، والمتصفح بيرفض تشغيل http جواها
 * (mixed content) — فالرابط كان هيفشل بصمت والمستخدم مش هيفهم ليه.
 * وblob:/data:/javascript: مرفوضين لأنهم مش «ملف صوت على سيرفر».
 */
export function normalizeAudioUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  return parsed.toString();
}

/** امتدادات الصوت المعروفة — تحذير مش منع، لأن فيه روابط بتستريم بدون امتداد. */
export function looksLikeAudio(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return [".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wav", ".flac", ".webm"].some((ext) =>
      path.endsWith(ext)
    );
  } catch {
    return false;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function newCustomId(): string {
  return `${CUSTOM_PREFIX}${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function loadCustomTracks(): SoundTrack[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // بنعيد بناء كل تراك من الأول بدل ما نثق في المخزّن: الحقول اللي
    // بتحدد السلوك (kind/loop) بتتحط هنا، فحتى لو حد عدّل الستوريج
    // بإيده مش هيقدر يحوّل تراك لنوع تاني.
    const seen = new Set<string>();
    const out: SoundTrack[] = [];

    for (const entry of parsed) {
      if (out.length >= MAX_CUSTOM_TRACKS) break; // السقف بيتفرض على القراءة كمان
      if (!isRecord(entry)) continue;
      const { id, name, url } = entry;
      if (typeof name !== "string" || typeof url !== "string") continue;

      const safeUrl = normalizeAudioUrl(url);
      if (!safeUrl) continue;

      const safeName = name.trim().slice(0, MAX_NAME_LEN);
      if (!safeName) continue;

      // id مش من نوعنا أو متكرر؟ نولّد واحد جديد بدل ما نرمي التراك —
      // المستخدم مالوش ذنب في ملف ستوريج بايظ.
      const safeId =
        typeof id === "string" && id.startsWith(CUSTOM_PREFIX) && !seen.has(id)
          ? id
          : newCustomId();

      seen.add(safeId);
      out.push({ id: safeId, name: safeName, url: safeUrl, icon: "🎵", kind: "custom", loop: true });
    }

    return out;
  } catch {
    return [];
  }
}

function persist(tracks: SoundTrack[]): void {
  if (typeof window === "undefined") return;
  try {
    const slim = tracks.map((t) => ({ id: t.id, name: t.name, url: t.url }));
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(slim));
  } catch {
    // الستوريج مقفول أو مليان — التراك هيشتغل في الجلسة دي وبس
  }
}

export type AddCustomResult =
  | { ok: true; tracks: SoundTrack[]; track: SoundTrack }
  | { ok: false; error: string };

export function addCustomTrack(existing: SoundTrack[], input: CustomAudioInput): AddCustomResult {
  const name = input.name.trim().slice(0, MAX_NAME_LEN);
  if (!name) return { ok: false, error: "اكتب اسم للصوت الأول." };

  const url = normalizeAudioUrl(input.url);
  if (!url) {
    return { ok: false, error: "الرابط لازم يكون رابط https صحيح لملف صوت." };
  }

  if (existing.some((t) => t.url === url)) {
    return { ok: false, error: "الصوت ده مضاف عندك خلاص." };
  }

  if (existing.length >= MAX_CUSTOM_TRACKS) {
    return { ok: false, error: `الحد ${MAX_CUSTOM_TRACKS} صوت. امسح واحد عشان تضيف جديد.` };
  }

  const track: SoundTrack = {
    id: newCustomId(),
    name,
    url,
    icon: "🎵",
    kind: "custom",
    loop: true,
  };

  const tracks = [...existing, track];
  persist(tracks);
  return { ok: true, tracks, track };
}

export function removeCustomTrack(existing: SoundTrack[], id: string): SoundTrack[] {
  const tracks = existing.filter((t) => t.id !== id);
  persist(tracks);
  return tracks;
}
