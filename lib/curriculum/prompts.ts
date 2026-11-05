/* ==========================================================================
   Curriculum Builder — بناء الـ Prompt وتفسير ردّ الموديل

   ⚠️ الردّ القادم من الموديل **بيانات غير موثوقة** لحد ما يعدّي التحقق:
   - استخراج JSON بـ extractJson (بيتعامل مع الـ fences).
   - تحقق من الشكل والعدد والحقول.
   - إزالة التكرار في العناوين.
   - فرض درس مراجعة نهائي في آخر القائمة.

   ليه الـ outline منفصل عن الإثراء؟ لأن طلب 50 درس في نداء واحد
   بيخلّي الموديل يختصر أو يقطع الـ JSON. العناوين أولاً (نداء صغير)،
   وبعدها الإثراء دفعات من 10.
   ========================================================================== */

import { extractJson } from "@/lib/ai/structured";
import type { AiChatMessage } from "@/lib/ai/types";
import {
  CURRICULUM_BATCH_SIZE,
  CURRICULUM_MAX_DESCRIPTION_CHARS,
  CurriculumGenerationError,
  type CurriculumDay,
  type CurriculumGenerationInput,
  type CurriculumLevel,
} from "./types";

export interface OutlineLesson {
  day: number;
  title: string;
  topic: string;
  kind: "content" | "review";
}

const LEVEL_LABEL: Record<CurriculumLevel, string> = {
  beginner: "مبتدئ",
  intermediate: "متوسط",
  advanced: "متقدم",
};

const LEVEL_RULES: Record<CurriculumLevel, string> = {
  beginner:
    "تعريفات واضحة، أمثلة يومية، خطوات بسيطة، وبدون رياضيات أو تفاصيل معمارية متقدمة.",
  intermediate:
    "مقارنات بين البدائل، حالات استخدام، أسباب ونتائج، وتمارين تطبيقية بعد كل مفهوم.",
  advanced:
    "تفاصيل معمارية، اعتبارات أداء، edge cases، قرارات تصميم، ومشاريع/تمارين تحدي.",
};

function clamp(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function normalizeTopic(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isReviewText(value: string): boolean {
  return /مراجعة|اختبار|review|exam|final/i.test(value);
}

function readString(
  value: unknown,
  field: string,
  max: number
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CurriculumGenerationError(
      `رد الموديل ناقص: الحقل "${field}" مطلوب.`,
      { retryable: true, code: "INVALID_MODEL_OUTPUT" }
    );
  }
  return clamp(value, max);
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CurriculumGenerationError("رد الموديل مش كائن JSON صالح.", {
      retryable: true,
      code: "INVALID_MODEL_OUTPUT",
    });
  }
  return value as Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Outline — توليد العناوين فقط
   -------------------------------------------------------------------------- */

export function buildOutlineMessages(input: CurriculumGenerationInput): AiChatMessage[] {
  const startDay = input.startDay ?? 1;
  const endDay = startDay + input.lessonCount - 1;
  const existingTopics = input.existingTopics ?? [];
  const isExpansion = existingTopics.length > 0;

  const focusLine = input.focusTopics.length
    ? input.focusTopics.map((topic, index) => `${index + 1}. ${topic}`).join("\n")
    : "لا يوجد — غطّي المنهج الأساسي للمادة بشكل منطقي.";

  const personaLine = input.personaContext
    ? `سياق المتعلم: ${input.personaContext}`
    : "سياق المتعلم: غير محدد.";

  const expansionSection = isExpansion
    ? `\n\n⚠️ ده توسيع لمنهج قائم، مش منهج جديد:
- الدروس الجديدة تبدأ من day = ${startDay} وتنتهي عند ${endDay}.
- الموضوعات اللي اتغطّت قبل كده (ممنوع تكرارها):
${existingTopics.map((topic) => `  • ${topic}`).join("\n")}
- الدروس الجديدة لازم تكمّل من حيث انتهى المنهج، بنفس المستوى ونفس أسلوب التدرج.`
    : "";

  const system = `أنت مصمم مناهج تعليمية خبير. مهمتك بناء هيكل منهج متدرج لمادة واحدة، بالعربي المصري الواضح مع إبقاء المصطلحات التقنية بالإنجليزية.

المدخلات:
- المادة: "${input.subject}"
- المجال: "${input.category}"
- مستوى العمق: ${LEVEL_LABEL[input.level]}
- عدد الدروس المطلوب: ${input.lessonCount}
- ${personaLine}${expansionSection}

قواعد صارمة:
1. أرجع ${input.lessonCount} عنصر في "outline" بالظبط. لا أكثر ولا أقل.
2. رتّب الدروس من الأساسيات إلى الأعمق، وكل درس يبني على اللي قبله.
3. موضوعات الطالب الإلزامية (لو موجودة) تبدأ بها في الدروس الأولى، وبعدها كمّل تغطية المنهج.
4. ممنوع تكرار نفس الموضوع أو إعادة صياغته. كل topic لازم يكون مختلف فعلياً.
5. ممنوع دروس حشو عامة زي "مقدمة" أو "مراجعة" أكثر من مرة واحدة.
6. العمق المطلوب: ${LEVEL_RULES[input.level]}
7. آخر عنصر في القائمة (day = ${endDay}) لازم يكون مراجعة شاملة واختبار نهائي للمنهج كله، وkind = "review". باقي العناصر kind = "content".
8. title قصير معنوي (٢–٥ كلمات) — مش "الدرس ١". وtopic هو عنوان المحتوى الحقيقي.
9. اكتب JSON فقط بدون Markdown وبدون أي نص خارجه.
10. لا تختصر القائمة بـ "..." ولا ترجع عناصر ناقصة.

الشكل:
{
  "isValid": true,
  "outline": [
    { "day": ${startDay}, "title": "عنوان قصير", "topic": "عنوان المحتوى", "kind": "content" }
  ]
}

لو المادة غير واضحة أو غير قابلة للتقسيم:
{ "isValid": false, "reason": "سبب قصير بالعربي." }`;

  const user = `المادة: "${input.subject}"
المجال: "${input.category}"
المستوى: ${LEVEL_LABEL[input.level]}
عدد الدروس: ${input.lessonCount}
موضوعات إلزامية من الطالب:
${focusLine}${isExpansion ? `\n\nالموضوعات السابقة (لا تكررها):\n${existingTopics.map((topic) => `- ${topic}`).join("\n")}` : ""}

ارجع ${input.lessonCount} عنصر بالظبط، أول عنصر day = ${startDay}، وآخر عنصر مراجعة نهائية (kind="review") عند day = ${endDay}.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function parseOutline(raw: string, input: CurriculumGenerationInput): OutlineLesson[] {
  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    throw new CurriculumGenerationError("رد الموديل مش JSON صالح.", {
      retryable: true,
      code: "INVALID_MODEL_OUTPUT",
    });
  }

  const object = readObject(parsed);

  if (object.isValid === false) {
    const reason = typeof object.reason === "string" && object.reason.trim()
      ? object.reason.trim().slice(0, 300)
      : "المادة غير واضحة. اكتب اسم مادة أدق وحاول تاني.";
    throw new CurriculumGenerationError(reason, {
      retryable: false,
      status: 422,
      code: "INVALID_SUBJECT",
    });
  }

  if (!Array.isArray(object.outline)) {
    throw new CurriculumGenerationError("رد الموديل لا يحتوي على قائمة دروس.", {
      retryable: true,
      code: "INVALID_MODEL_OUTPUT",
    });
  }

  if (object.outline.length < input.lessonCount) {
    throw new CurriculumGenerationError(
      `الموديل رجّع ${object.outline.length} درس بدل ${input.lessonCount}.`,
      { retryable: true, code: "COUNT_MISMATCH" }
    );
  }

  // لو رجّع أكتر، بناخد أول N — العدد النهائي مسؤولية الكود مش الموديل.
  const rows = object.outline.slice(0, input.lessonCount);
  const startDay = input.startDay ?? 1;

  /* موضوعات المنهج السابق جزء من "الممنوع" — إلا موضوعات المراجعة، لأن
     التوسيع لازم ينتهي بمراجعة جديدة للمنهج الموسّع. */
  const seen = new Set<string>(
    (input.existingTopics ?? [])
      .filter((topic) => !isReviewText(topic))
      .map(normalizeTopic)
  );

  const outline: OutlineLesson[] = rows.map((row, index) => {
    const item = readObject(row);
    const title = readString(item.title, "title", 120);
    const topic = readString(item.topic, "topic", 220);

    if (seen.has(normalizeTopic(topic))) {
      throw new CurriculumGenerationError(
        input.existingTopics?.length
          ? "رد الموديل كرّر موضوعاً من المنهج السابق."
          : "رد الموديل فيه موضوعات مكررة.",
        { retryable: true, code: "DUPLICATE_TOPICS" }
      );
    }
    seen.add(normalizeTopic(topic));

    return {
      day: startDay + index,
      title,
      topic,
      kind: item.kind === "review" ? "review" : "content",
    };
  });

  /* آخر درس مراجعة نهائية — قرار منتج مثبّت، مش اختيار الموديل.
     لو الموديل ما التزمش، بنصلّح العنوان/الموضوع بدل ما نرجع خطة ناقصة. */
  const last = outline[outline.length - 1];
  last.kind = "review";
  if (!isReviewText(last.title) && !isReviewText(last.topic)) {
    last.title = "المراجعة الشاملة";
    let topic = `مراجعة شاملة واختبار نهائي في ${input.subject}`;
    while (seen.has(normalizeTopic(topic))) {
      topic = `${topic} — مراجعة`;
    }
    last.topic = clamp(topic, 220);
  }

  return outline;
}

/* --------------------------------------------------------------------------
   الإثراء — وصف كل درس في دفعة
   -------------------------------------------------------------------------- */

export function buildEnrichmentMessages(
  input: CurriculumGenerationInput,
  batch: OutlineLesson[]
): AiChatMessage[] {
  const list = batch
    .map((lesson) => {
      const kind = lesson.kind === "review" ? "مراجعة نهائية" : "محتوى جديد";
      return `${lesson.day}. ${lesson.title} — ${lesson.topic} (${kind})`;
    })
    .join("\n");

  const system = `أنت مصمم مناهج تعليمية. مهمتك كتابة وصف مختصر لكل درس في القائمة، بدون تغيير العناوين.

قواعد:
1. أرجع وصفاً واحداً لكل درس في القائمة، بنفس أرقام day.
2. الوصف سطر واحد عملي (حد أقصى ${CURRICULUM_MAX_DESCRIPTION_CHARS} حرف) يقول الطالب هيتعلم إيه بالظبط.
3. ممنوع وصف عام زي "شرح الدرس" — اذكر المفاهيم أو المهارات الحقيقية.
4. للمراجعة النهائية: اكتب إنها مراجعة شاملة واختبار على المادة كلها.
5. اكتب بالعربي مع إبقاء المصطلحات التقنية بالإنجليزية.
6. JSON فقط بدون Markdown وبدون نص خارجه.

الشكل:
{
  "isValid": true,
  "days": [
    { "day": 1, "description": "..." }
  ]
}`;

  const user = `المادة: "${input.subject}"
المستوى: ${LEVEL_LABEL[input.level]}
عدد الدروس في الدفعة: ${batch.length}

الدروس:
${list}

اكتب description لكل درس بنفس رقم day.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function parseEnrichment(raw: string, batch: OutlineLesson[]): Map<number, string> {
  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    throw new CurriculumGenerationError("رد الموديل مش JSON صالح في دفعة الأوصاف.", {
      retryable: true,
      code: "INVALID_MODEL_OUTPUT",
    });
  }

  const object = readObject(parsed);
  if (!Array.isArray(object.days)) {
    throw new CurriculumGenerationError("رد الموديل لا يحتوي على أوصاف الدروس.", {
      retryable: true,
      code: "INVALID_MODEL_OUTPUT",
    });
  }

  const byDay = new Map<number, string>();
  for (const row of object.days) {
    const item = readObject(row);
    const day = Number(item.day);
    if (!Number.isInteger(day)) continue;
    const description = readString(item.description, "description", CURRICULUM_MAX_DESCRIPTION_CHARS);
    byDay.set(day, description);
  }

  for (const lesson of batch) {
    if (!byDay.has(lesson.day)) {
      throw new CurriculumGenerationError(
        `وصف الدرس رقم ${lesson.day} ناقص من رد الموديل.`,
        { retryable: true, code: "COUNT_MISMATCH" }
      );
    }
  }

  return byDay;
}

/* --------------------------------------------------------------------------
   التجميع النهائي
   -------------------------------------------------------------------------- */

export function buildCurriculumDays(
  outline: OutlineLesson[],
  descriptions: Map<number, string>
): CurriculumDay[] {
  return outline.map((lesson) => {
    const description = descriptions.get(lesson.day)?.trim();
    if (!description) {
      throw new CurriculumGenerationError(
        `وصف الدرس رقم ${lesson.day} ناقص.`,
        { retryable: true, code: "COUNT_MISMATCH" }
      );
    }
    return {
      day: lesson.day,
      title: lesson.title,
      topic: lesson.topic,
      description,
    };
  });
}

/** توزيع الدروس على دفعات الإثراء — كل دفعة 10 على الأكثر. */
export function chunkOutline(outline: OutlineLesson[]): OutlineLesson[][] {
  const batches: OutlineLesson[][] = [];
  for (let index = 0; index < outline.length; index += CURRICULUM_BATCH_SIZE) {
    batches.push(outline.slice(index, index + CURRICULUM_BATCH_SIZE));
  }
  return batches;
}
