// lib/lesson/video-relevance.ts
//
// 🎯 بوابة الصلة (Relevance Gate) — P2 مطلب 3.
//
// «مفيش فيديوهات من أي حاجة ملهاش علاقة» — قبل عرض أي مرشّح فيديو من
// اقتراحات الـ AI، بنحسب درجة صلة بين (العنوان + الوصف) و(موضوع الدرس +
// المادة) بعد التطبيع العربي (normalizeForMatch من lecture-intensive).
//
// القاعدة:
//   • المفردة الأساسية للموضوع (أطول كلمة دالّة) لازم تظهر، **أو**
//   • تداخل واضح (كلمتين دالتين أو أكتر من الموضوع)، **أو**
//   • كلمة دالة من الموضوع + كلمتين من المادة (المادة لوحدها مش كفاية).
//   • لو الموضوع فاضي: كلمة دالة واحدة من المادة تكفي.
//   • الموضوع والمادة الاتنين فاضيين ⇒ مش بنقدر نحكم — بنمرّر (can't judge).
//
// البحث اليدوي (كلمات الطالب نفسه) **مش بيعدي على البوابة دي** — الطالب
// كتب الكلام بنفسه؛ بيتفلتر بس ضد الفوضى (موسيقى/ترفيه/مدة).
//
// الملف نقّي (pure) — بيتاختبر مباشرة في lib/lesson/__tests__.

import { normalizeForMatch } from "@/lib/ai/lecture-intensive";

export type RelevanceContext = { topic?: string | null; subject?: string | null };
export type RelevanceInput = { title: string; description?: string | null };

export type RelevanceVerdict = {
  pass: boolean;
  /** درجة ترتيب — أعلى = أقرب (بتستخدم للفرز مش للبوابة). */
  score: number;
  matchedTopic: string[];
  matchedSubject: string[];
  /** نص «ليه اتيرشح» — جاهز للعرض في الواجهة. */
  reason: string;
};

/** كلمات ركيكة عربية/إنجليزية مش دالة على الصلة. */
const STOPWORDS = new Set([
  "في", "من", "علي", "عن", "الي", "الى", "هذا", "هذه", "التي", "الذي", "الذين",
  "او", "أو", "مع", "كل", "بين", "ثم", "قد", "كان", "كانت", "هو", "هي", "ما",
  "لا", "لم", "لن", "ان", "أن", "إن", "اليوم", "درس", "محاضرة", "شرح", "تعليمي",
  "lesson", "lecture", "tutorial", "the", "and", "for", "with", "how", "what",
]);

/** كلمات دالة بعد التطبيع — تُقارن بالاحتواء داخل نص المرشّح (بتلحق السوابق: ال، بال…). */
function significantTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const normalized = normalizeForMatch(text);
  if (!normalized) return [];
  const seen = new Set<string>();
  for (const word of normalized.split(" ")) {
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    seen.add(word);
    if (seen.size >= 10) break;
  }
  return [...seen];
}

/** سوابق الجر والتعريف — بتتجرد قبل اختيار المفردة الأساسية (ال/بال/وال/لل…). */
const ARABIC_PREFIXES = /^(?:وال|فال|كال|بال|لل|ال)/;

/** المفردة الأساسية للموضوع = أطول كلمة دالة بعد تجريد السوابق. */
export function coreTopicToken(topic: string | null | undefined): string {
  const tokens = significantTokens(topic);
  if (tokens.length === 0) return "";
  const stripped = tokens.map((t) => t.replace(ARABIC_PREFIXES, ""));
  const best = stripped.reduce((a, b) => (b.length > a.length ? b : a));
  // بنرجّع الشكل المجرد — المطابقة بالاحتواء بتصطاد الشكل بالسابقة (التكامل ⊃ تكامل).
  return best;
}

function matchTokens(tokens: string[], haystack: string): string[] {
  return tokens.filter((t) => haystack.includes(t));
}

/**
 * relevanceVerdict — حساب الصلة لمرشّح واحد.
 * المقارنة بعد التطبيع العربي (أ/إ/آ→ا، ى→ي، ة→ه، إزالة التشكيل).
 */
export function relevanceVerdict(input: RelevanceInput, ctx: RelevanceContext): RelevanceVerdict {
  const topicTokens = significantTokens(ctx.topic);
  const subjectTokens = significantTokens(ctx.subject);
  const core = coreTopicToken(ctx.topic);

  if (topicTokens.length === 0 && subjectTokens.length === 0) {
    return {
      pass: true,
      score: 0,
      matchedTopic: [],
      matchedSubject: [],
      reason: "مفيش سياق موضوع/مادة للحكم عليه — مُمرَّر كما هو",
    };
  }

  const haystack = normalizeForMatch(`${input.title ?? ""} ${input.description ?? ""}`);
  const matchedTopic = matchTokens(topicTokens, haystack);
  const matchedSubject = matchTokens(subjectTokens, haystack);
  const coreMatched = core.length >= 3 && haystack.includes(core);

  // درجة الترتيب (مش بوابة): الموضوع أوزان مضاعفة + بونص للمفردة الأساسية.
  const score = matchedTopic.length * 2 + matchedSubject.length + (coreMatched ? 3 : 0);

  let pass = false;
  let reason = "";
  if (topicTokens.length === 0) {
    // الموضوع فاضي — المادة هي المرجع.
    pass = matchedSubject.length >= 1;
    reason = pass ? `مرتبط بمادة ${ctx.subject?.trim()}` : "مش مرتبط بالمادة";
  } else if (matchedTopic.length >= 2) {
    pass = true;
    reason = `العنوان/الوصف فيه كلمتين من موضوع الدرس: ${matchedTopic.slice(0, 3).join("، ")}`;
  } else if (coreMatched) {
    pass = true;
    reason = `العنوان فيه المفردة الأساسية للموضوع: «${core}»`;
  } else if (matchedTopic.length >= 1 && matchedSubject.length >= 1) {
    pass = true;
    reason = `بيجمع موضوع الدرس (${matchedTopic[0]}) مع المادة (${matchedSubject[0]})`;
  } else {
    pass = false;
    reason = `مش فيه أي كلمة دالة من موضوع «${(ctx.topic ?? "").trim()}»`;
  }

  return { pass, score, matchedTopic, matchedSubject, reason };
}

/**
 * filterRelevantVideos — بوابة قائمة مرشّحين: اللي فشل بيتشال من العرض.
 * ترتيب الناجين بيتصحّح بالدرجة (الثبات مع نتيجة أفضل أولاً).
 */
export function filterRelevantVideos<T extends RelevanceInput>(videos: T[], ctx: RelevanceContext): T[] {
  return videos
    .map((v) => ({ v, verdict: relevanceVerdict(v, ctx) }))
    .filter(({ verdict }) => verdict.pass)
    .sort((a, b) => b.verdict.score - a.verdict.score)
    .map(({ v }) => v);
}
