/* ==========================================================================
   🔍 كشف المصطلحات المشكوك فيها — Phase 2
   ══════════════════════════════════════════════════════════════════════

   الغرض: بعد تفريغ المحاضرة بنجاح، نكشف عن مصطلحات ممكن تكون غلط
   صوتياً (homophones) أو تقنياً (terminology errors) ونربط كل مصطلح
   بتوقيته في التسجيل عشان الطالب يقدر يراجع ويصحح.

   sierver only — مفيش fetch ولا process.env في هذا الملف؟ لا، فيه fetch
   لأن اللي بيستدعي الموديل بيكون في الراوت. دي دوال نقية + подготов للبرومبت.

   ══════════════════════════════════════════════════════════════════════ */

/** مصطلح واحد مشكوك في صحته مع توقيته. */
export type SuspectedTerm = {
  /** المصطلح كما ظهر في التفريغ. */
  term: string;
  /** التصحيح المقترح من الـ AI. */
  suggested_correction: string;
  /** سبب الشك (مثلاً: "كلمة غامضة صوتياً"، "مصطلح تقني غير موجود في قاموس المادة"). */
  reason: string;
  /** بداية المقطع بالثواني (من TranscriptWord.start). */
  start: number;
  /** نهاية المقطع بالثواني (من TranscriptWord.end). */
  end: number;
  /* فهرس القطعة (segment) اللي فيها الكلمة. */
  segment_index: number;
  /* فهرس الكلمة في القطعة. */
  word_index: number;
};

/** مدخلات دالة الكشف. */
export type DetectSuspectsInput = {
  transcript: {
    text: string;
    segments: Array<{
      text: string;
      words: Array<{ text: string; start: number; end: number }>;
    }>;
  };
  subject?: string | null;
  dictionaryTerms?: string[];
};

/** نتيجة الكشف. */
export type DetectSuspectsResult = {
  suspectedTerms: SuspectedTerm[];
  aiCalls: number;
};

/**
 * يبني برومبت الكشف عن المصطلحات المشكوك فيها.
 * tekst transcript + قاموس المادة (إن وجد) → JSON output من الـ AI.
 */
export function buildSuspectsPrompt(input: {
  transcriptText: string;
  subject?: string | null;
  dictionaryTerms?: string[];
}): string {
  const { transcriptText, subject, dictionaryTerms } = input;
  const dictHint =
    dictionaryTerms && dictionaryTerms.length > 0
      ? `\nقاموس المادة "${subject ?? "غير محددة"}":\n${dictionaryTerms
          .map((t) => `- ${t}`)
          .join("\n")}\nأي كلمة ليست في القاموس ده وليست كلمة عربية أو إنجليزية شائعة = مشبوهة.\n`
      : "\nلم يتم توفير قاموس للمادة — اعتمد على حكمك اللغوي والتقني فقط.\n";

  return `أنت مساعد أكاديمي متخصص في مراجعة نصوص المحاضرات المفرغة.

المهمتك: اقرأ النص التالي وعرّف أي كلمات أو مصطلحات مشكوك في صحتها — أي كلمة ممكن تكون:
1. غلط صوتياً (homophone): صوتها يشبه كلمة تانية ومعناها مختلف (مثلاً "congruence" invece "compare").
2. مصطلح تقني غير صحيح في سياق المادة.
3. كلمة غير مفهومة أو غامضة.

${dictHint}

النص:
"""\n${transcriptText}\n"""

أرجع JSON فقط بالشكل التالي، لا شيء غير JSON:
{
  "suspected_terms": [
    {
      "term": "الكلمة كما ظهرت في النص",
      "suggested_correction": "التصحيح المقترح",
      "reason": "سبب الشك",
      "start": 12.5,
      "end": 15.2,
      "segment_index": 0,
      "word_index": 3
    }
  ]
}

إذا مافيش أي كلمات مشبوهة، أرجع مصفوفة فاضية: {"suspected_terms": []}
لا تضف أي شرح أو نص خارج JSON.`;
}

/**
 * يحول المقطع (segment) والكلمات إلى فهرس word_index عالمي عبر كل القطاعات.
 * يستخدم لتحديد موقع الكلمة بدقة في transcript_data.
 */
export function mapWordToGlobalIndex(
  segments: Array<{ words: Array<{ text: string; start: number; end: number }> }>,
  targetText: string,
  targetStart: number
): { segment_index: number; word_index: number } | null {
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const words = segments[segIdx].words;
    for (let wordIdx = 0; wordIdx < words.length; wordIdx++) {
      if (
        words[wordIdx].text === targetText &&
        Math.abs(words[wordIdx].start - targetStart) < 0.5
      ) {
        return { segment_index: segIdx, word_index: wordIdx };
      }
    }
  }
  return null;
}

/** يبني معرّفًا ثابتًا للمصطلح من موضعه الأصلي في transcript_data. */
export function buildTermId(
  segmentIndex: number,
  wordIndex: number,
  start: number
): TermId {
  return `${segmentIndex}:${wordIndex}:${start.toFixed(3)}`;
}

/** يستخرج معرّف المصطلح من كائن SuspectedTerm. */
export function termIdFromSuspected(term: SuspectedTerm): TermId {
  return buildTermId(term.segment_index, term.word_index, term.start);
}

/** يبني خريطة من termId إلى suggested_correction من suspectedTerms. */
export function buildCorrectionMap(
  suspectedTerms: SuspectedTerm[]
): Map<TermId, string> {
  const map = new Map<TermId, string>();
  for (const term of suspectedTerms) {
    map.set(termIdFromSuspected(term), term.suggested_correction);
  }
  return map;
}

/**
 * يبني النص المصحح من transcript_data وقرارات المراجعة.
 *
 * - يُترك transcript_text الأصلي دون تعديل.
 * - يُطبّق كل قرار على موضع الكلمة الأصلي في transcript_data words،
 *   وليس على النص الخام (تجنب replace عام قد يغيّر مواضع صحيحة أخرى).
 * - إذا كان المصطلح في موضع غير موثوق أو حدث تعارض بين التصحيحات
 *   (مصطلحان يشتركون نفس الموضع)، يُرجع null ويستدعي مراجعة يدوية.
 * - لا تُطبّق القرارات على نسخة مصححة سابقًا — دائمًا يبدأ من transcript_data الأصلي.
 * - بالنسبة لـ accept بدون finalValue، يُستخدم suggested_correction من suspectedTerms.
 */
export function buildReviewedText(
  transcript: {
    text: string;
    segments?: Array<{
      text?: string;
      words?: Array<{ text?: string; start?: number; end?: number }>;
    }>;
  },
  suspectedTerms: SuspectedTerm[],
  decisions: ReviewDecision[]
): string | null {
  const segments = transcript.segments;
  if (!segments || segments.length === 0) {
    return null;
  }

  const correctionMap = buildCorrectionMap(suspectedTerms);

  // تجميع القرارات حسب الموضع (segment_index:wordIndex) للكشف عن التعارضات.
  const decisionsByPos = new Map<string, ReviewDecision[]>();
  for (const decision of decisions) {
    const parts = decision.termId.split(":");
    if (parts.length !== 3) return null;
    const segIdx = Number(parts[0]);
    const wordIdx = Number(parts[1]);
    const start = Number(parts[2]);

    if (!Number.isFinite(segIdx) || !Number.isFinite(wordIdx) || !Number.isFinite(start)) {
      return null;
    }
    if (segIdx < 0 || segIdx >= segments.length) {
      return null;
    }

    const seg = segments[segIdx];
    const words = seg?.words;
    if (!words || wordIdx < 0 || wordIdx >= words.length) {
      return null;
    }

    const word = words[wordIdx];
    if (typeof word.start !== "number" || Math.abs(word.start - start) > 0.5 || typeof word.text !== "string") {
      return null;
    }

    const key = `${segIdx}:${wordIdx}`;
    const existing = decisionsByPos.get(key);
    if (existing) {
      existing.push(decision);
    } else {
      decisionsByPos.set(key, [decision]);
    }
  }

  // التحقق من عدم وجود تعارض (قرارات متعددة لنفس الموضع بإجراءات مختلفة).
  // Reject duplicate termId in the request.
  const seenTermIds = new Set<string>();
  for (const decision of decisions) {
    if (seenTermIds.has(decision.termId)) {
      return null;
    }
    seenTermIds.add(decision.termId);
  }
  for (const [, decs] of decisionsByPos) {
    if (decs.length > 1) {
      const actions = new Set(decs.map((d) => d.action));
      if (actions.size > 1) {
        return null;
      }
    }
  }

  // enrichment: accept بدون finalValue → خذ suggested_correction من suspectedTerms.
  const enriched: ReviewDecision[] = decisions.map((d) => {
    if (d.action === "accept" && (!d.finalValue || d.finalValue.trim() === "")) {
      const suggested = correctionMap.get(d.termId);
      if (suggested) {
        return { ...d, finalValue: suggested };
      }
      // accept بدون قيمة نهائية — لا يمكن التطبيق بأمان.
      return null;
    }
    return d;
  });

  // إذا أي قرار accept/enrichment فشل، نرجع null (مراجعة يدوية مطلوبة).
  if (enriched.some((d) => d === null)) {
    return null;
  }

  // Rebuild decisionsByPos from enriched decisions so finalValue is applied.
  decisionsByPos.clear();
  for (const decision of enriched as ReviewDecision[]) {
    const parts = decision.termId.split(":");
    const segIdx = Number(parts[0]);
    const wordIdx = Number(parts[1]);
    const key = `${segIdx}:${wordIdx}`;
    const existing = decisionsByPos.get(key);
    if (existing) existing.push(decision);
    else decisionsByPos.set(key, [decision]);
  }

  // rebuild النص من خلال المرور على الكلمات وتطبيق القرارات على المواضع الأصلية.
  const resultParts: string[] = [];
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    const words = seg?.words ?? [];
    if (segIdx > 0) {
      resultParts.push(" ");
    }
    for (let wordIdx = 0; wordIdx < words.length; wordIdx++) {
      if (wordIdx > 0) {
        resultParts.push(" ");
      }
      const word = words[wordIdx];
      const key = `${segIdx}:${wordIdx}`;
      const decs = decisionsByPos.get(key);

      if (decs && decs.length >= 1) {
        const decision = decs[0] as ReviewDecision;
        if (decision.action === "accept") {
          resultParts.push(decision.finalValue ?? word.text ?? "");
        } else if (decision.action === "manual_edit") {
          resultParts.push(decision.finalValue ?? word.text ?? "");
        } else {
          // reject → الكلمة الأصلية.
          resultParts.push(word.text ?? "");
        }
      } else {
        // لا قرار لهذا المصطلح — الكلمة الأصلية.
        resultParts.push(word.text ?? "");
      }
    }
  }

  return resultParts.join("");
}

/* ───────────────────────── Phase 3: أنواع قرارات المراجعة ───────────────────────── */

/** معرّف مستقر لكل مصطلح مشكوك فيه — يُبنى من موضع الكلمة الأصلي
 *  (segment_index + word_index + start) ليكون ثابتًا عبر إعادة تحميل الصفحة
 *  وإعادة إرسال الطلب. */
export type TermId = string;

/** قرار واحد لمصطلح مشكوك فيه. */
export type ReviewDecision = {
  /** معرّف ثابت للم término (segment_index:word_index:start). */
  termId: TermId;
  /** الإجراء المتخذ: قبول التصحيح، أو رفضه والبقاء على الأصلي، أو تعديل يدوي. */
  action: "accept" | "reject" | "manual_edit";
  /** القيمة النهائية إذا كان الإجراء manual_edit (نص التصحيح الذي أدخله المستخدم). */
  finalValue?: string | null;
  /** وقت اتخاذ القرار بالصيغة ISO. */
  decidedAt: string;
};

/** طلب إرسال قرارات المراجعة. */
export type SubmitReviewRequest = {
  /** مصفوفة قرارات لكل مصطلح مشكوك فيه. */
  decisions: ReviewDecision[];
};

/** رد endpoint إرسال المراجعة. */
export type SubmitReviewResponse = {
  success: true;
  lectureId: string;
  reviewedText: string;
  reviewStatus: "completed" | "needs_attention";
  reviewedAt: string;
};