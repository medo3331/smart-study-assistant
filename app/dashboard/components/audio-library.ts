/* ==========================================================================
   المكتبة الصوتية — البيانات

   الملف ده بيانات بحتة: مفيش React ومفيش أي API متصفح على مستوى الملف،
   عشان راوت السيرفر (app/api/quran/reciters) يقدر يستورد منه.
   أي حاجة محتاجة localStorage أو IndexedDB مكانها custom-audio.ts.

   🗓️ ٨ أغسطس: أصوات التركيز القديمة (مطر/بحر/غابة/ضوضاء بيضاء) اتشالت
   بالكامل واتبدلت بالمكتبة دي — قرآن + موسيقى + صوتيات المستخدم.
   ========================================================================== */

/** نوع المصدر. بيحدد سلوك المشغّل: الموسيقى بتتكرر، والقرآن لأ. */
export type TrackKind = "quran" | "music" | "custom";

/**
 * أداء التلاوة:
 *   - murattal: الأداء العادي (مرتل) — المناسب للمذاكرة والاستماع السريع.
 *   - mujawwad: الأداء المُتقن بالتجويد — أبطأ وأطول بكتير.
 * المصدر: mp3quran.net بيفصل كل أداء في مصحف (moshaf) بسيرفر مختلف،
 * فالتبديل بينهم = تبديل مجلد السيرفر، مش تبديل القارئ.
 */
export type RecitationStyle = "murattal" | "mujawwad";

export interface SoundTrack {
  id: string;
  name: string;
  icon: string;
  url: string;
  kind: TrackKind;
  /** سطر تحت الاسم في المشغّل — اسم القارئ مثلاً */
  subtitle?: string;
  /** يتكرر لما يخلص؟ الموسيقى أيوة، السورة لأ. */
  loop: boolean;
}

/* --------------------------------------------------------------------------
   القرآن
   -------------------------------------------------------------------------- */

export interface Reciter {
  id: number;
  name: string;
  /** بينتهي بـ / — رابط السورة = server + رقم من ٣ خانات + .mp3 */
  server: string;
  /** أرقام السور المتاحة عند القارئ ده. أغلبهم ١١٤ كاملة. */
  surahs: number[];
  /**
   * سيرفر نسخة المجوّد (بينتهي بـ /) — لو القارئ عنده أداء مجود.
   * `null`/undefined = المجود مش متاح للقارئ ده. بييجي من رد
   * mp3quran (مصحف اسمه فيه «مجود») وبيتطبع في الراوت.
   */
  mujawwadServer?: string | null;
}

export const SURAH_NAMES: string[] = [
  "الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف",
  "الأنفال", "التوبة", "يونس", "هود", "يوسف", "الرعد", "إبراهيم", "الحجر",
  "النحل", "الإسراء", "الكهف", "مريم", "طه", "الأنبياء", "الحج", "المؤمنون",
  "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنكبوت", "الروم",
  "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", "يس", "الصافات", "ص", "الزمر",
  "غافر", "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية", "الأحقاف", "محمد",
  "الفتح", "الحجرات", "ق", "الذاريات", "الطور", "النجم", "القمر", "الرحمن",
  "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة", "الصف", "الجمعة",
  "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة",
  "المعارج", "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان",
  "المرسلات", "النبأ", "النازعات", "عبس", "التكوير", "الانفطار", "المطففين",
  "الانشقاق", "البروج", "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد",
  "الشمس", "الليل", "الضحى", "الشرح", "التين", "العلق", "القدر", "البينة",
  "الزلزلة", "العاديات", "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل",
  "قريش", "الماعون", "الكوثر", "الكافرون", "النصر", "المسد", "الإخلاص",
  "الفلق", "الناس",
];

/** سور بيتسمعوا كتير — بتظهر كاقتراحات سريعة فوق قائمة الـ ١١٤. */
export const POPULAR_SURAHS = [1, 36, 55, 67, 18, 56, 2, 112];

/**
 * ⚠️ ليستة احتياطية بس — مش مصدر الحقيقة.
 *
 * القرّاء الحقيقيين بييجوا من mp3quran.net عن طريق /api/quran/reciters.
 * الليستة دي بتشتغل لو الـ API وقع أو الشبكة فصلت، عشان التبويب ما
 * يفضلش فاضي. لو رابط سيرفر هنا بقى قديم، الحل إن الـ API يرجع —
 * مش إننا نحدّث الليستة دي، لأنها أصلاً مؤقتة.
 */
export const FALLBACK_RECITERS: Reciter[] = [
  { id: 123, name: "مشاري راشد العفاسي", server: "https://server8.mp3quran.net/afs/", surahs: allSurahs() },
  { id: 30, name: "محمد صديق المنشاوي (المرتل)", server: "https://server10.mp3quran.net/minsh/", surahs: allSurahs(), mujawwadServer: "https://cdn.mp3quran.net/audio/muhammad-minshawi/r2/" },
  { id: 5, name: "عبد الباسط عبد الصمد (المرتل)", server: "https://server7.mp3quran.net/basit/", surahs: allSurahs(), mujawwadServer: "https://cdn.mp3quran.net/audio/abdulbasit-abdulsamad/r1/" },
  { id: 51, name: "ماهر المعيقلي", server: "https://server12.mp3quran.net/maher/", surahs: allSurahs(), mujawwadServer: "https://cdn.mp3quran.net/audio/maher-muaiqly/r3/" },
  { id: 54, name: "عبد الرحمن السديس", server: "https://server11.mp3quran.net/sds/", surahs: allSurahs() },
  { id: 118, name: "ياسر الدوسري", server: "https://server11.mp3quran.net/yasser/", surahs: allSurahs() },
  { id: 112, name: "محمود خليل الحصري (المرتل)", server: "https://server13.mp3quran.net/husr/", surahs: allSurahs(), mujawwadServer: "https://cdn.mp3quran.net/audio/mahmoud-husary/r2/" },
  { id: 102, name: "أحمد بن علي العجمي", server: "https://server10.mp3quran.net/ajm/", surahs: allSurahs() },
];

function allSurahs(): number[] {
  return Array.from({ length: 114 }, (_, i) => i + 1);
}

/** رقم السورة بيتكتب ٣ خانات في اسم الملف: 1 → "001.mp3" */
export function surahFileName(surah: number): string {
  return `${String(surah).padStart(3, "0")}.mp3`;
}

export function quranTrack(reciter: Reciter, surah: number): SoundTrack {
  const base = reciter.server.endsWith("/") ? reciter.server : `${reciter.server}/`;
  return {
    // القارئ جزء من الـ id: نفس السورة بقارئ تاني تراك مختلف
    id: `quran:${reciter.id}:${surah}`,
    name: `سورة ${SURAH_NAMES[surah - 1] ?? surah}`,
    icon: "📖",
    url: `${base}${surahFileName(surah)}`,
    kind: "quran",
    subtitle: reciter.name,
    // السورة ليها بداية ونهاية — تكرارها تلقائي مش سلوك متوقع
    loop: false,
  };
}

/* --------------------------------------------------------------------------
   أداء التلاوة (مرتل / مجود) — منطق نقي بدون React وبدون شبكة.

   عايش هنا مش في الراوت لسببين: نفس سبب التطبيع القديم (Next بيتحقق من
   exports ملفات الراوت فمينفعش نصدّر منها حاجة نختبرها)، ولأن الاختبار
   بيستوردها من هنا على طول.
   -------------------------------------------------------------------------- */

/**
 * الـ server بيروح مباشرة لـ `<audio src>` في متصفح المستخدم — نفس منطق
 * lib/quran.ts: https بس، والهوست لازم يكون من نطاق المصدر المعروف.
 * الفحص على الـ hostname المفكوك مش على النص (startsWith بيعدّي
 * `https://mp3quran.net.evil.com/`).
 */
export function isValidQuranServer(server: unknown): server is string {
  if (typeof server !== "string") return false;
  let parsed: URL;
  try {
    parsed = new URL(server);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return host === "mp3quran.net" || host.endsWith(".mp3quran.net");
}

/** سقف بسيط على عدد المصاحف المدقّقة لكل قارئ — رد عادي فيه ١٠ كحد أقصى. */
const MAX_MOSHAFS = 50;

/** عدد سور مصحف من رد mp3quran: `surah_list` نص مفصول بفواصل، أو `surah_total`. */
function countMoshafSurahs(m: {
  surah_list?: unknown;
  surah_total?: unknown;
}): number {
  if (typeof m.surah_list === "string" && m.surah_list.trim()) {
    return m.surah_list.split(",").filter((n) => n.trim()).length;
  }
  const total = Number(m.surah_total);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/**
 * استخراج رابط نسخة المجود من مصاحف قارئ واحد (شكل رد mp3quran v3:
 * `reciters[].moshaf[]` وكل مصحف `name/server/surah_list/surah_total`).
 *
 * الاختيار: من المصاحف اللي اسمها فيه «مجود» وسيرفرها صالح، بنختار الأكمل
 * (أكتر سور)، ولو اتساوا بنفضّل رواية حفص (الأشهر والمطابقة للمرتل).
 * بيرجع الرابط متطبع بـ `/` في الآخر أو `null` لو مفيش نسخة مجودة.
 */
export function extractMujawwadServer(moshafs: unknown): string | null {
  if (!Array.isArray(moshafs)) return null;

  let best: { server: string; surahs: number; hafs: boolean } | null = null;

  for (const m of moshafs.slice(0, MAX_MOSHAFS)) {
    if (typeof m !== "object" || m === null) continue;
    const entry = m as { name?: unknown; server?: unknown; surah_list?: unknown; surah_total?: unknown };
    if (typeof entry.name !== "string" || !entry.name.includes("مجود")) continue;
    if (!isValidQuranServer(entry.server)) continue;

    // تطبيع الشرطة الأخيرة: روابط mp3quran بتيجي بـ / في الآخر عادة،
    // وبنضمنها هنا عشان دمج اسم الملف يفضل `server + 002.mp3`.
    const server = entry.server.endsWith("/") ? entry.server : `${entry.server}/`;
    const surahs = countMoshafSurahs(entry);
    if (surahs === 0) continue;

    const hafs = entry.name.includes("حفص");
    if (
      !best ||
      surahs > best.surahs ||
      (surahs === best.surahs && hafs && !best.hafs)
    ) {
      best = { server, surahs, hafs };
    }
  }

  return best ? best.server : null;
}

/* --------------------------------------------------------------------------
   الموسيقى

   ⚠️ كل اللي هنا موسيقى بدون كلمات وحقوقها مفتوحة (رخصة Pixabay: استخدام
   حر بما فيه التجاري، من غير نسب). ممنوع نهائياً إضافة أغاني محفوظة
   الحقوق هنا — لو المستخدم عايز أغانيه، مكانها تبويب «صوتياتي» وهو
   بيجيبها بنفسه على مسؤوليته.
   -------------------------------------------------------------------------- */

export const MUSIC_TRACKS: SoundTrack[] = [
  {
    id: "music:lofi",
    name: "لو-فاي للمذاكرة",
    icon: "🎧",
    url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
    kind: "music",
    subtitle: "إيقاع هادي متكرر",
    loop: true,
  },
  {
    id: "music:piano",
    name: "بيانو هادي",
    icon: "🎹",
    url: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=relaxing-piano-10269.mp3",
    kind: "music",
    subtitle: "مناسب للقراءة والحفظ",
    loop: true,
  },
  {
    id: "music:ambient",
    name: "أمبيينت للتركيز",
    icon: "🌌",
    url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b6a2d0f5.mp3?filename=ambient-piano-amp-strings-10711.mp3",
    kind: "music",
    subtitle: "خلفية بدون إيقاع واضح",
    loop: true,
  },
  {
    id: "music:guitar",
    name: "جيتار أكوستيك",
    icon: "🎸",
    url: "https://cdn.pixabay.com/download/audio/2021/11/25/audio_00fa5593f3.mp3?filename=acoustic-guitar-loop-f-major-12889.mp3",
    kind: "music",
    subtitle: "خفيف ومش مشتّت",
    loop: true,
  },
  {
    id: "music:classic",
    name: "كلاسيك خفيف",
    icon: "🎻",
    url: "https://cdn.pixabay.com/download/audio/2022/10/18/audio_31c2e15d0f.mp3?filename=classical-strings-121471.mp3",
    kind: "music",
    subtitle: "أوتار هادية",
    loop: true,
  },
  {
    id: "music:jazz",
    name: "چاز هادي",
    icon: "🎷",
    url: "https://cdn.pixabay.com/download/audio/2022/08/03/audio_2dde668d05.mp3?filename=jazz-cafe-116400.mp3",
    kind: "music",
    subtitle: "جو كافيه",
    loop: true,
  },
];
