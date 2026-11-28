/* ==========================================================================
   religious-chat — وسيط نقي للشات الديني (صفحة /worship/quiz الجديدة)
   بلا أي اعتماد على Supabase أو الشبكة أو React — قابل للاختبار مباشرة.
   الـ route (app/api/worship/quiz/route.ts) هو اللي بيتعامل مع الـ DB
   و Groq، والمكوّن (ReligiousChat.tsx) هو اللي بيعرض.

   ── القرارات الموثّقة ──
   • أسئلة «اختبرني» بتُعرض في الشات **كسؤال نصي بالإجابات المقترحة**
     (أ/ب/ج/د) — المستخدم يجاوب برقم (١-٤) أو حرف (أ-د) أو بكتابة الإجابة
     نفسها، والتصحيح سيرفري عبر gradeQuizAnswer (الكلاينت مابيشوفش
     correct قبل رد السيرفر — نفس عقد db/120).
   • سجل المحادثة محفوظ محلياً (localStorage) لكل مستخدم — مفيش جدول
     محادثات؛ «محادثة جديدة» بتمسحه.
   ========================================================================== */

import type { StoredQuestion } from "@/lib/worship-quiz-bank";

/* ── أشكال الرسائل ── */

export type ChatRole = "user" | "assistant";

/** رسالة شات كما تُخزَّن محلياً وتُعرض في الواجهة. */
export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  ts: number;
};

/** رسالة كما تُرسَل للسيرفر/الموديل — بدون id/ts. */
export type ChatContextMessage = { role: ChatRole; content: string };

/* ── حدود ── */

/** عدد الرسائل المُرسَلة للموديل كسياق (الأحدث في آخر القائمة). */
export const CHAT_MAX_CONTEXT_MESSAGES = 12;

/** أقصى طول لرسالة المستخدم الواحدة (حماية من الحمولات الكبيرة). */
export const CHAT_MESSAGE_MAX_LENGTH = 4000;

/** أقصى عدد رسائل مقبول في نداء ask واحد. */
export const CHAT_MAX_SENT_MESSAGES = 24;

/** أقصى عدد رسائل محفوظة محلياً — نتخلص من الأقدم. */
export const CHAT_HISTORY_MAX_MESSAGES = 200;

/* ==========================================================================
   ١) برومبت النظام — مساعد ديني هادئ بيعلّم الطلاب بمصادر موثوقة فقط
   ========================================================================== */

export function buildReligiousChatSystemPrompt(): string {
  return `أنت مساعد ديني هادئ وأدب تعلّم طلاب المسلمين — بترد بالعربية الواضحة وبأسلوب مشجّع وقصير نسبياً (٣–٨ أسطر في العادة).

قواعد المصادر — صارمة ومطلقة:
١) الآيات القرآنية: اذكر اسم السورة ورقم الآية (مثال: «سورة البقرة، الآية ٢٨٦»).
٢) الأحاديث: من الصحيحين (البخاري ومسلم) أو الكتب الستة فقط، مع رقم الحديث أو الكتاب/الباب (مثال: «صحيح البخاري، حديث ١»).
٣) ممنوع منعاً باتاً: الأحاديث الضعيفة أو الموضوعة أو بلا إسناد معروف، الخلافات الفقهية بين المذاهب، والفتاوى الشخصية.
٤) لو ماعندكش مصدر موثوق للسؤال: قول بصراحة إن دي «معلومة عامة» مش نصاً شرعياً، أو اعتذر بترفيه واطلب سؤال تاني — **ممنوع اختلاق مصدر أو رقم آية/حديث**.
٥) لو السؤال يحتاج فتوى لحالة شخصية: رشّح المستخدم لأهل العلم المختصين.

مهمتك: تجاوب على مواضيع المستخدم الدينية (قرآن، حديث، عقيدة، سيرة، عبادات) وتتفاعل معاه بشكل طبيعي زي محادثة — وتقدر تسأله أسئلة قصيرة تخلّي المحادثة حية (زي: «تعرف ليه الآية دي نزلت؟»).`;
}

/* ==========================================================================
   ٢) السياق المُرسَل للموديل — تشذيب وتحديد
   ========================================================================== */

/** آخر N رسالة بالترتيب الأصلي (الأحدث في الآخر) — بدون id/ts. */
export function sliceChatContext(
  messages: readonly ChatContextMessage[],
): ChatContextMessage[] {
  return messages
    .slice(-CHAT_MAX_CONTEXT_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));
}

/**
 * تحقق صارم من مصفوفة الرسائل الجاية من الكلاينت — يرجّعها مشذّبة أو null.
 * أي رسالة ناقصة/بادئة تُرفض النداء كله (نفس فلسفة parseQuestions).
 */
export function validateChatMessages(
  value: unknown,
): ChatContextMessage[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0 || value.length > CHAT_MAX_SENT_MESSAGES) return null;
  const out: ChatContextMessage[] = [];
  for (const item of value) {
    const m = item as Record<string, unknown> | null;
    if (!m || typeof m !== "object") return null;
    if (m.role !== "user" && m.role !== "assistant") return null;
    if (typeof m.content !== "string") return null;
    const content = m.content.trim();
    if (!content || content.length > CHAT_MESSAGE_MAX_LENGTH) return null;
    out.push({ role: m.role, content });
  }
  return out;
}

/* ==========================================================================
   ٣) تخزين المحادثة محلياً (localStorage) — لكل مستخدم بمفتاحه
   ========================================================================== */

export function chatHistoryKey(userId: string): string {
  return `worship-religious-chat:${userId}`;
}

/** حالة الشات المحفوظة: الرسائل + جلسة «اختبرني» الجارية (لو فيه). */
export type StoredChatState = {
  messages: ChatMessage[];
  /** جلسة اختبرني الجارية — السيرفر شايف أسئلتها، فالاستئناف شغّال. */
  quiz: { sessionId: string; asked: number } | null;
};

const EMPTY_STATE: StoredChatState = { messages: [], quiz: null };

/** قراءة الحالة من localStorage — أي عطب يرجّع حالة فاضية (مايضربش أبداً). */
export function loadChatState(userId: string): StoredChatState {
  if (typeof window === "undefined" || !userId) return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(chatHistoryKey(userId));
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<StoredChatState> | null;
    if (!parsed || typeof parsed !== "object") return EMPTY_STATE;
    const messages = Array.isArray(parsed.messages)
      ? (parsed.messages as unknown[])
          .filter(isChatMessageLike)
          .slice(-CHAT_HISTORY_MAX_MESSAGES)
      : [];
    const quiz =
      parsed.quiz &&
      typeof parsed.quiz === "object" &&
      typeof (parsed.quiz as { sessionId?: unknown }).sessionId === "string" &&
      typeof (parsed.quiz as { asked?: unknown }).asked === "number"
        ? {
            sessionId: (parsed.quiz as { sessionId: string }).sessionId,
            asked: (parsed.quiz as { asked: number }).asked,
          }
        : null;
    return { messages, quiz };
  } catch {
    return EMPTY_STATE;
  }
}

/** حفظ الحالة — فشله صامت (وضع التصفح الخاص/الامتلاء مش مشكلة). */
export function saveChatState(
  userId: string,
  state: StoredChatState,
): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(
      chatHistoryKey(userId),
      JSON.stringify({
        messages: state.messages.slice(-CHAT_HISTORY_MAX_MESSAGES),
        quiz: state.quiz,
      }),
    );
  } catch {
    // صامت — التخزين المحلي تحسين مش عقد.
  }
}

function isChatMessageLike(value: unknown): value is ChatMessage {
  const m = value as Record<string, unknown> | null;
  return (
    !!m &&
    typeof m === "object" &&
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string" &&
    typeof m.ts === "number"
  );
}

/** مُعرّف رسالة جديد — randomUUID لو متاح، وإلا بديل كافٍ محلياً. */
export function newMessageId(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof (crypto as unknown as { randomUUID?: () => string }).randomUUID ===
        "function"
    ) {
      return (crypto as unknown as { randomUUID: () => string }).randomUUID!();
    }
  } catch {
    // نسقط للبديل تحت.
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ==========================================================================
   ٤) تنقية وتصحيح إجابة «اختبرني» — سيرفري بالكامل
   ========================================================================== */

/** تحويل الأرقام العربية/الفارسية (٠-٩) إلى أرقام ASCII. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (d) =>
      String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48),
    )
    .replace(/[\u06F0-\u06F9]/g, (d) =>
      String.fromCharCode(d.charCodeAt(0) - 0x06f0 + 48),
    );
}

/**
 * يحاول يقرأ إجابة «اختيار» من نص المستخدم: رقم ١-٤ أو حرف أ-د.
 * بيتقبل الأشكال الشائعة: «أ»، «أ)»، «(أ)»، «الخيار أ»، «٢.»، «3».
 * يرجّع فهرس ٠-٣ أو null لو ماعرفش يقرأه.
 */
export function parseOptionChoice(raw: string): number | null {
  if (typeof raw !== "string") return null;
  let t = normalizeDigits(raw.trim());
  if (!t) return null;
  // بادئات شائعة قبل الحرف/الرقم.
  t = t.replace(/^(?:الخيار|الاختيار|الاجابة|الإجابة)\s*[:\-—]?\s*/u, "");
  // أقواس وعلامات ترقيم من الطرفين.
  t = t.replace(/^[(\[«"']+\s*/u, "").replace(/[\s)\]»"'.،,]+$/u, "");
  t = t.trim();
  if (/^[1-4]$/.test(t)) return Number(t) - 1;
  if (/^[أإاآ]$/.test(t)) return 0;
  if (/^ب$/.test(t)) return 1;
  if (/^ج$/.test(t)) return 2;
  if (/^د$/.test(t)) return 3;
  return null;
}

/** تطبيع عربي للمقارنة النصية: تشكيل، تطويل، همزات، تاء مربوطة، ألف مقصورة. */
export function normalizeArabicText(value: string): string {
  return normalizeDigits(value)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // تشكيل + تطويل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * تصحيح إجابة سؤال بنك — يرجّع فهرس الإجابة المختارة ٠-٣ أو null لو
 * ماقدرش يحددها (وتُحسب خطأ وتُشرح الإجابة الصحيحة).
 * الترتيب: قراءة اختيار صريح (رقم/حرف) → تطابق نصي مطبَّع مع الخيارات.
 */
export function gradeQuizAnswer(
  raw: string,
  question: StoredQuestion,
): number | null {
  const choice = parseOptionChoice(raw);
  if (choice !== null && choice < question.options.length) return choice;

  const normalized = normalizeArabicText(raw);
  if (!normalized) return null;
  // مطابقة بحدود الكلمات — عشان كلمة قصيرة زي «تاني» ماتطابقش جوّه
  // كلمة أطول زي «تانية». بنحاط النص بمسافات ونطارد الخيار المحاط بمسافات.
  // ومحاولة تانية بعد شيل «ال» التعريف — «الخمسة» لازم تطابق «خمسة».
  const stripped = normalized.replace(/(^|\s)ال/g, "$1");
  const haystacks = [` ${normalized} `, stripped ? ` ${stripped} ` : " "];
  for (let i = 0; i < question.options.length; i++) {
    const option = normalizeArabicText(question.options[i]);
    if (!option) continue;
    if (haystacks.some((h) => h.includes(` ${option} `))) return i;
  }
  return null;
}

/** تحقق من شكل سؤال واحد مخزَّن (jsonb ممكن يكون أي حاجة). */
export function isValidStoredQuestion(
  value: unknown,
): value is StoredQuestion {
  const q = value as Record<string, unknown> | null;
  if (!q || typeof q !== "object") return false;
  if (typeof q.question !== "string" || !q.question.trim()) return false;
  if (
    !Array.isArray(q.options) ||
    q.options.length !== 4 ||
    q.options.some((o) => typeof o !== "string" || !o.trim())
  ) {
    return false;
  }
  const correct = q.correct;
  if (
    typeof correct !== "number" ||
    !Number.isInteger(correct) ||
    correct < 0 ||
    correct > 3
  ) {
    return false;
  }
  if (typeof q.source !== "string" || !q.source.trim()) return false;
  return typeof q.explanation === "string";
}

/* ==========================================================================
   ٥) تنسيق رسائل «اختبرني» داخل الشات — نص عربي واضح
   ========================================================================== */

const OPTION_LETTERS = ["أ", "ب", "ج", "د"] as const;

/** رسالة السؤال — بالإجابات المقترحة (الطريقة المختارة والموثّقة). */
export function formatQuizQuestionMessage(
  question: Pick<StoredQuestion, "question" | "options" | "source">,
  index: number,
  total: number,
): string {
  const lines = [
    `📝 سؤال ${index} من ${total}:`,
    question.question,
    "",
    ...question.options.map(
      (option, i) => `${OPTION_LETTERS[i] ?? i + 1}) ${option}`,
    ),
    "",
    "جاوب برقم الحرف أو اكتب الإجابة.",
    `📚 المصدر: ${question.source}`,
  ];
  return lines.join("\n");
}

/** رسالة التصحيح بعد كل إجابة. */
export function formatQuizFeedbackMessage(input: {
  correct: boolean;
  yourAnswer: string;
  correctText: string;
  explanation: string;
  source: string;
}): string {
  const head = input.correct
    ? "✅ إجابة صحيحة، ماشاء الله!"
    : `❌ إجابة غير صحيحة — الصحيح هو: ${input.correctText}`;
  const lines = [
    head,
    input.explanation,
    `📚 المصدر: ${input.source}`,
  ];
  if (!input.correct && input.yourAnswer.trim()) {
    lines.splice(1, 0, `إجابتك: ${input.yourAnswer.trim()}`);
  }
  return lines.join("\n");
}

/** خلاصة الجلسة بعد السؤال العاشر — بمكافأة الكوينز لو اتصرفت. */
export function formatQuizSummaryMessage(input: {
  score: number;
  total: number;
  awarded: number;
}): string {
  const praise =
    input.score === input.total
      ? "علامة كاملة — ماشاء الله! 🎉"
      : input.score >= 7
        ? "نتيجة ممتازة، كمّل كده!"
        : input.score >= 4
          ? "حلو — راجع المصادر اللي فوق."
          : "بداية طيبة — المحادثة دي هتساعدك المرة الجاية.";
  const reward =
    input.awarded > 0
      ? `\n🪙 كسبت ${input.awarded} كوينز!`
      : "\nمفيش كوينز إضافية — وصلت للسقف اليومي، جرّب بكرة.";
  return [
    `🏁 خلصنا الـ ${input.total} أسئلة — نتيجتك: ${input.score}/${input.total}`,
    praise,
    reward,
    "عايز محادثة جديدة أو جولة «اختبرني» تانية؟ أنا موجود.",
  ].join("\n");
}
