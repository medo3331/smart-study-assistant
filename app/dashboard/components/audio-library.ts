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
  { id: 30, name: "محمد صديق المنشاوي (المرتل)", server: "https://server10.mp3quran.net/minsh/", surahs: allSurahs() },
  { id: 5, name: "عبد الباسط عبد الصمد (المرتل)", server: "https://server7.mp3quran.net/basit/", surahs: allSurahs() },
  { id: 51, name: "ماهر المعيقلي", server: "https://server12.mp3quran.net/maher/", surahs: allSurahs() },
  { id: 54, name: "عبد الرحمن السديس", server: "https://server11.mp3quran.net/sds/", surahs: allSurahs() },
  { id: 118, name: "ياسر الدوسري", server: "https://server11.mp3quran.net/yasser/", surahs: allSurahs() },
  { id: 112, name: "محمود خليل الحصري (المرتل)", server: "https://server13.mp3quran.net/husr/", surahs: allSurahs() },
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
