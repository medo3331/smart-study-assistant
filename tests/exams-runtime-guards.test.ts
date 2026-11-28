import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * حارس runtime لامتحانات — يمنع regressions في الحاجات اللي اتصلّحت:
 *   ١) مهلة Vercel (Fluid Compute) = 300 ثانية على راوتات الامتحان.
 *   ٢) سقف المخرج + مهلة الطلب في نداءات التوليد (منع 503 «كل المزوّدات فشلوا»).
 *   ٣) المساعد ينفّذ طلب الامتحان بدل ما يسأل أسئلة توضيحية.
 *   ٤) المولّد بيعرض المحاضرات غير المصنّفة تحت مادة (مش «مفيش محاضرات»).
 */
function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

const CREATE_ROUTE = "app/api/exam-sessions/route.ts";
const PROCESS_ROUTE = "app/api/exam-sessions/[id]/items/[itemId]/process/route.ts";

describe("مهلات Vercel لامتحانات (Fluid Compute)", () => {
  it("راوت إنشاء الجلسة: maxDuration = 300", () => {
    expect(read(CREATE_ROUTE)).toMatch(/export const maxDuration = 300;/);
  });

  it("راوت المعالجة: maxDuration = 300", () => {
    expect(read(PROCESS_ROUTE)).toMatch(/export const maxDuration = 300;/);
  });
});

describe("نداءات التوليد — سقف المخرج ومهلة الطلب", () => {
  it("المحرك بيبعت maxTokens و timeoutMs لكل نداء", () => {
    const engine = read("lib/ai/exam-review.ts");
    expect(engine).toContain("maxTokens: examMaxTokens(aiTask, quota)");
    expect(engine).toContain("timeoutMs: EXAM_CALL_TIMEOUT_MS");
  });

  it("سقف المخرج أكبر من الصفر لكل نوع نداء", () => {
    const engine = read("lib/ai/exam-review.ts");
    expect(engine).toMatch(/export function examMaxTokens/);
    expect(engine).toContain('case "summary":');
    expect(engine).toContain('case "questions":');
  });

  it("الراووت بيمرّر الخيارين للموديل فعلاً", () => {
    const route = read(PROCESS_ROUTE);
    expect(route).toContain("maxTokens");
    expect(route).toContain("timeoutMs");
    // 429 من المزوّد (كل المفاتيح اتعيطت) ⇒ 503 «الخدمة مشغولة» مش 429 ميزانية.
    expect(route).toContain("AI_RATE_LIMITED");
  });
});

describe("المساعد — طلب امتحان بينفّذ فورًا (من غير حلقة مفرغة)", () => {
  it("/api/chat: الكشف من **التاريخ** مش آخر رسالة", () => {
    const route = read("app/api/chat/route.ts");
    expect(route).toContain("detectExamRequestFromHistory(safeMessages)");
    expect(route).toContain("buildExamHref(examRequest");
    expect(route).toContain("EXAM_REQUEST_PROMPT_RULES");
  });

  it("/api/unified-ai: التاريخ من الداتابيز + حفظ الدور (عشان مايضيعش السياق)", () => {
    const route = read("app/api/unified-ai/route.ts");
    expect(route).toContain("detectExamRequestFromHistory(examTurns)");
    expect(route).toContain("loadConversationTurns");
    expect(route).toContain("saveTurn");
    expect(route).toContain("افتح مولّد الامتحان");
    expect(route).toContain("EXAM_REQUEST_PROMPT_RULES");
  });

  it("الطلب الناقص كمان بياخد الزر فورًا (الشات مش form)", () => {
    const engine = read("lib/exam-request.ts");
    expect(engine).toContain("active: true");
    expect(engine).toContain("مولّد الامتحان وكمّل باقي الإعدادات");
  });
});

describe("المولّد — فلترة المحاضرات", () => {
  const generator = read("components/exams/ExamGenerator.tsx");

  it("المحاضرات غير المصنّفة تحت مادة بتفضل ظاهرة", () => {
    expect(generator).toContain("if (!hasSubject) return true;");
  });

  it("شاشة «بدون تفريغ» بتتحسب من transcript_text (زي شرط الراوت)", () => {
    expect(generator).toContain('not("transcript_text", "is", null)');
    expect(generator).toContain('row.transcript_text.trim().length > 0');
  });
});

/**
 * حارس المرونة (resilience) — يمنع regressions في اللي اتصلّح:
 *   ٥) تقسيم توليد الأسئلة لـ5 أسئلة كحد أقصى للنداء (منع 429).
 *   ٦) `withRetry` + `retry-after` + تدوير المفاتيح جوه نفس الطلب.
 *   ٧) OpenRouter: رد غير صالح ⇒ فشل مؤقت ⇒ fallback للمزوّد اللي بعده.
 *   ٨) الواجهة: رسالة واضحة + زرار «إعادة المحاولة» (مفيش شاشة معلقة).
 */
describe("المرونة — تقسيم النداءات وإعادة المحاولة", () => {
  it("السقف 5 أسئلة لكل نداء معروف ومطبَّق", () => {
    const engine = read("lib/ai/exam-review.ts");
    expect(engine).toContain("export const EXAM_QUESTION_CHUNK_SIZE = 5");
    expect(engine).toContain("splitQuestionQuota(quotas[index])");
    expect(engine).toContain("splitQuestionQuota(need)");
  });

  it("تقدير الميزانية بياخد عدد الأسئلة (مش القطع بس)", () => {
    const engine = read("lib/ai/exam-review.ts");
    expect(engine).toContain("estimateQuestionCalls(chunks, count)");
    const route = read(PROCESS_ROUTE);
    expect(route).toContain("estimateItemBudget(chunks.length, spec.count)");
    // ⚠️ السقف لازم يتحسب من **عدد قطع الجلسة** (كان ثابت 15 ⇒ BUDGET واطي
    //    لما القطع بقت أصغر = نداءات أكتر).
    expect(route).toContain("estimateItemBudget(sessionChunks, spec.count).logical");
    expect(route).toContain("EXAM_SOURCE_CHUNK_CHARS");
  });

  it("Groq: withRetry + retry-after + تدوير المفاتيح", () => {
    const groq = read("lib/ai/groq.ts");
    // ⚠️ `withRetry` / `parseRetryAfterMs` بقوا في `provider-retry` (مشترك بين
    //    المزوّدات) وبيتعاد تصديرهم من `groq.ts` ⇒ نفس الـAPI العام.
    expect(groq).toContain('from "./provider-retry"');
    expect(groq).toContain("export { backoffDelayMs, isRetryableProviderStatus, parseRetryAfterMs, withRetry }");
    expect(groq).toContain("GROQ_RETRY_MAX_MS = 30_000");
    expect(groq).toContain('response.headers.get("retry-after")');
    // ⚠️ التدوير لازم يكون **جوه نفس الطلب** (مش طلب جديد).
    expect(groq).toContain("callGroqWithKeys");
    expect(groq).toContain("throw new GroqRateLimitedError(retryAfterMs)");
  });

  it("OpenRouter: رد فيه error أو من غير choices ⇒ فشل مؤقت", () => {
    const openrouter = read("lib/ai/openrouter.ts");
    expect(openrouter).toContain("export function validateOpenRouterPayload");
    expect(openrouter).toContain("OpenRouter response has no choices");
    expect(openrouter).toContain("validateOpenRouterPayload(rawPayload)");
  });

  it("الواجهة: رسالة واضحة + زرار إعادة المحاولة (مفيش شاشة معلقة)", () => {
    const generator = read("components/exams/ExamGenerator.tsx");
    expect(generator).toContain("إعادة المحاولة");
    expect(generator).toContain("السيرفر مشغول جداً");
    expect(generator).toContain("errorTransient");
    // ⚠️ الـbusy دايماً بينتهي.
    expect(generator).toContain("setBusy(false);");

    const runner = read("components/exams/ExamRunner.tsx");
    expect(runner).toContain("السيرفر مشغول جداً");
    expect(runner).toContain("جرّب تاني");
  });
});

/**
 * حارس «المصادر والتسميات» — يمنع regressions في:
 *   ٩) تبويب المصادر في المولّد (تسجيلات صوتية / مستندات).
 *   ١٠) الباك إند بيقرأ نص المستند (مش بس المحاضرات).
 *   ١١) التسميات الواضحة (ميفش «المحاضرات» لكل حاجة).
 */
describe("مولّد الامتحانات — مصادر المحاضرات والمستندات", () => {
  it("المولّد بيعرض التبويبين ويبعت documentIds", () => {
    const generator = read("components/exams/ExamGenerator.tsx");
    expect(generator).toContain('"المحاضرات الصوتية"');
    expect(generator).toContain('"المستندات"');
    expect(generator).toContain('from("documents")');
    expect(generator).toContain("documentIds:");
    // ⚠️ السقف 3 **مصادر** (مش 3 محاضرات).
    expect(generator).toContain("selectedCount");
  });

  it("راوت الإنشاء بيقبل المستندات + fallback للـRPC القديم", () => {
    const route = read("app/api/exam-sessions/route.ts");
    expect(route).toContain("documentIds");
    expect(route).toContain("max 3 sources");

    const engine = read("lib/ai/exam-sessions.ts");
    expect(engine).toContain("create_exam_session_with_sources_reserve");
    expect(engine).toContain("isMissingRpc");
    expect(engine).toContain("SOURCES_UNAVAILABLE");
  });

  it("راوت المعالجة بيقرأ نص المستند وبيقطّعه", () => {
    const route = read(PROCESS_ROUTE);
    expect(route).toContain("readDocumentText");
    expect(route).toContain("buildExamSource");
    // ⚠️ التقطيع: مافيش «نص المستند كله في نداء واحد».
    expect(route).toContain("const chunks = source.chunks;");
    expect(route).toContain("chunk: () => chunks,");
  });

  it("طبقة المصادر: بتقرا knowledge_base وبتقسّم النص", () => {
    const sources = read("lib/ai/exam-sources.ts");
    expect(sources).toContain('from("knowledge_base")');
    expect(sources).toContain("chunkTranscript");
    expect(sources).toContain("EXAM_SOURCE_CHUNK_CHARS");
  });

  it("المهنة موجودة في القاعدة (migration 49) مع قيد «مصدر واحد»", () => {
    const migration = read("db/49-exam-documents.sql");
    expect(migration).toContain("create_exam_session_with_sources_reserve");
    expect(migration).toContain("exam_session_items_exactly_one_source");
    expect(migration).toContain("document_id");
  });

  it("db/49 ما يهدّش قيد db/50 (٣ مصادر) — عشان ما يفشلش بـ23514", () => {
    // ⚠️ **اللي حصل فعليًا في الإنتاج**: `db/50` اتطبّق قبل `db/49` ⇒
    //    القيد بقى 3 مصادر (lecture/document/topic) ⇒ لما `db/49` حاول
    //    يرجّعه 2 مصادر ⇒ بنود «موضوع عام» خالفت ⇒ **23514** والـapply
    //    كله تراجع ⇒ الـRPC المصلّح مااتطبّقش ⇒ 500 مستمر.
    const migration = read("db/49-exam-documents.sql");
    // لازم يختار شكل القيد حسب وجود عمود topic.
    expect(migration).toContain("information_schema.columns");
    expect(migration).toContain("num_nonnulls(lecture_id, document_id, topic)");
    // ⚠️ والقيد القديم (٢ مصادر) يبقى **جوّه الـelse** بس (مش top-level)
    //    ⇒ متى ما الـtopic موجود يبقى ٣ مصادر (ومنود «موضوع عام» ماتخالفش).
    const elseIndex = migration.indexOf("else");
    const oldRuleIndex = migration.indexOf("(lecture_id is not null and document_id is null)");
    expect(elseIndex).toBeGreaterThan(-1);
    expect(oldRuleIndex).toBeGreaterThan(elseIndex);
    // }));

    // والقيد التلاتة (المعتمد) لازم يبقى **قبل** الـelse (الفرع الأساسي).
    const threeWayIndex = migration.indexOf(
      "num_nonnulls(lecture_id, document_id, topic)"
    );
    expect(threeWayIndex).toBeGreaterThan(-1);
    expect(threeWayIndex).toBeLessThan(elseIndex);
  });

  it("db/49 وصلّح الـRPC القديم كمان (fallback) — مافيش array_length فيه", () => {
    const migration = read("db/49-exam-documents.sql");
    expect(migration).toContain("create or replace function public.create_exam_session_with_reserve");
    // ⚠️ `array_length` مسموح في **التعليق** بس — مافيش usage فعلي.
    const withoutComments = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(withoutComments).not.toContain("array_length(");
  });

  it("القيد بيتضاف NOT VALID ⇒ الـapply مايفشلش بـ23514 أبداً", () => {
    const migration = read("db/49-exam-documents.sql");
    const withoutComments = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    // ⚠️ `not valid` = الصفوف الجديدة متحكمش بيها، والقديمة ماتكسرش الـapply.
    expect(withoutComments).toContain("not valid;");
    // وبيتحقق بعدين ببلوك آمن (لو فيه صفوف قديمة ⇒ يتخطّى).
    expect(withoutComments).toContain("validate constraint exam_session_items_exactly_one_source");
    expect(withoutComments).toContain("exception when others then");
    // + تنظيف البنود اللي مالها أي مصدر (اللي بتكسر القيد).
    expect(withoutComments).toContain("delete from public.exam_session_items");
  });
});

describe("التسميات — فصل الصوتيات عن المستندات", () => {
  it("النافبار: «التسجيلات الصوتية» مش «محاضراتي»", () => {
    const nav = read("app/dashboard/components/nav-config.ts");
    expect(nav).toContain('label: "التسجيلات الصوتية"');
    expect(nav).toContain('href: "/lectures"');
  });

  it("تبويبات مساحة العمل: تسجيلات صوتية / مستندات", () => {
    const workspace = read("app/dashboard/workspace/page.tsx");
    expect(workspace).toContain('label: "التسجيلات الصوتية"');
    expect(workspace).toContain('label: "المستندات"');
  });

  it("صفحة /lectures فيها تبويبين (تسجيلات + مستندات)", () => {
    const page = read("app/lectures/page.tsx");
    expect(page).toContain("المحاضرات الصوتية");
    expect(page).toContain("المستندات");
    expect(page).toContain('resolved?.tab === "documents"');
  });
});

describe("🔥 الـhotfix — 500/503 في مسار الامتحان", () => {
  it("راوت الإنشاء: try/catch شامل + لوج مفصّل (error/stack/context)", () => {
    const route = read(CREATE_ROUTE);
    expect(route).toContain("logCrash");
    expect(route).toContain("stack:");
    expect(route).toContain("context,");
    expect(route).toMatch(/catch \(error\) \{/);
  });

  it("راوت الإنشاء: تحقق من الـbody قبل أي شغل (lectureIds + documentIds)", () => {
    const route = read(CREATE_ROUTE);
    expect(route).toContain("validateCreateBody");
    expect(route).toContain("lectureIds, documentIds or topic required");
    expect(route).toContain("max 3 sources");
    expect(route).toContain("invalid JSON body");
  });

  it("راوت المعالجة: try/catch شامل + لوج مفصّل", () => {
    const route = read(PROCESS_ROUTE);
    expect(route).toContain("logCrash");
    expect(route).toContain("summarizeProviderFailure");
    expect(route).toMatch(/catch \(error\) \{/);
  });

  it("رسائل الطالب: كودات واضحة بدل 500 غامض", () => {
    const route = read(PROCESS_ROUTE);
    expect(route).toContain("AI_RATE_LIMITED");
    expect(route).toContain("AI_PROVIDER_UNAVAILABLE");
    expect(route).toContain("AI_TIMEOUT");
    expect(route).toContain("retry_after");
  });

  it("استقلال المسارات عن الـschema (عمود document_id ناقص ⇒ fallback)", () => {
    const sessions = read("lib/ai/exam-sessions.ts");
    expect(sessions).toContain("isMissingColumnError");
    expect(sessions).toContain("PGRST204");
    expect(sessions).toContain("selectSessionItems");
    expect(sessions).toContain("selectExamItem");
    // ⚠️ الـRPC مفقود (PGRST202 = اللي بيرجعه Supabase) ⇒ fallback مش 500.
    expect(sessions).toContain("PGRST202");
  });

  it("OpenRouter بقى فيه إعادة محاولة (كان من غيرها ⇒ 503 فوري)", () => {
    const openrouter = read("lib/ai/openrouter.ts");
    expect(openrouter).toContain("withRetry");
    expect(openrouter).toContain("isRetryableProviderStatus");
  });

  it("المزوّدات بتشارك نفس سياسة الإعادة", () => {
    const shared = read("lib/ai/provider-retry.ts");
    expect(shared).toContain("export async function withRetry");
    expect(shared).toContain("500");
    const groq = read("lib/ai/groq.ts");
    expect(groq).toContain('from "./provider-retry"');
  });

  it("الواجبة: رسالة مختلفة لكل كود + احترام retry_after", () => {
    const runner = read("components/exams/ExamRunner.tsx");
    expect(runner).toContain("AI_RATE_LIMITED");
    expect(runner).toContain("AI_TIMEOUT");
    expect(runner).toContain("retry_after");
  });
});

describe("🌍 المولّد الذكي — مصدر «موضوع عام» + رفع ملف مباشر", () => {
  it("الـmigration 50: عمود topic + قيد «مصدر واحد» + RPC جديد", () => {
    const migration = read("db/50-exam-topic.sql");
    expect(migration).toContain("topic text");
    expect(migration).toContain("num_nonnulls(lecture_id, document_id, topic)");
    expect(migration).toContain("create_exam_session_with_topic_reserve");
  });

  it("الـAPI يقبل topic (وبيمنع الخلط مع الملفات)", () => {
    const route = read(CREATE_ROUTE);
    expect(route).toContain("normalizeTopic");
    expect(route).toContain("topic cannot be combined with other sources");
    expect(route).toContain("TOPIC_UNAVAILABLE");
    // ⚠️ الإشعار اللي بيقول للطالب إن الامتحان عام.
    expect(route).toContain("مبني على معلومات عامة");
  });

  it("المحرك بيفرق بين وضع التفريغ ووضع المعلومات العامة", () => {
    const engine = read("lib/ai/exam-review.ts");
    expect(engine).toContain("GROUNDING_GENERAL");
    expect(engine).toContain("groundingFor(mode)");
    expect(engine).toContain("mode?: ExamKnowledgeMode");
    // ⚠️ الوضع العام بيم��نع التفاصيل النادرة (ضوابط دقة مختلفة).
    expect(engine).toContain("ممنوع التفاصيل النادرة أو غير المؤكدة");
  });

  it("راوت المعالجة: بند الموضوع ⇒ مصدر topic + وضع عام", () => {
    const route = read(PROCESS_ROUTE);
    expect(route).toContain('itemRow.topic');
    expect(route).toContain('knowledgeMode = "general"');
    expect(route).toContain("mode: knowledgeMode");
  });

  it("الواجهة: تاب ثالث + خانة موضوع + رفع ملف", () => {
    const ui = read("components/exams/ExamGenerator.tsx");
    expect(ui).toContain('"topic" as const');
    expect(ui).toContain("موضوع عام");
    expect(ui).toContain('id="exam-topic"');
    expect(ui).toContain('fetch("/api/documents"');
  });

  it("المساعد: مافيش ملفات ⇒ اقتراح موضوع عام (مش «مفيش محاضرات»)", () => {
    const request = read("lib/exam-request.ts");
    expect(request).toContain("topicMode");
    const sources = read("lib/ai/exam-sources.ts");
    expect(sources).toContain("userHasExamSources");
    const chat = read("app/api/chat/route.ts");
    expect(chat).toContain("userHasExamSources");
    const unified = read("app/api/unified-ai/route.ts");
    expect(unified).toContain("userHasExamSources");
  });

  it("قاعدة البيانات: استعلامات مستقلة عن الـschema (topic ناقص ⇒ fallback)", () => {
    const sessions = read("lib/ai/exam-sessions.ts");
    expect(sessions).toContain("topic column missing");
    expect(sessions).toContain("topicSupport");
  });
});

describe("🔥 تخصيص الموديل لكل ميزة (Task-Specific Models)", () => {
  it("مهمة مستقلة لتوليد الامتحانات (مش chat)", () => {
    const types = read("lib/ai/types.ts");
    expect(types).toContain('"exam_generation"');
    const routing = read("lib/ai/routing.ts");
    expect(routing).toContain("exam_generation:");
    expect(routing).toContain("AI_PROVIDER_BY_TASK");
  });

  it("خريطة التوجيه: التوليد⇒سريع، الشرح⇒قوي، الشات⇒سريع", () => {
    const routing = read("lib/ai/routing.ts");
    // ⚠️ الموديل الأساسي للتوليد لازم يكون سريع (مش استدلال).
    expect(routing).toMatch(/exam_generation:\s*\[\s*"openai\/gpt-oss-20b"/);
    expect(routing).toMatch(/explain:\s*\[\s*"openai\/gpt-oss-120b"/);
    expect(routing).toMatch(/chat:\s*\[\s*"openai\/gpt-oss-20b"/);
  });

  it("المهمة الجديدة مسجّلة في سجل المهام والـrunner", () => {
    const tasks = read("lib/ai/tasks/chat.ts");
    expect(tasks).toContain("EXAM_GENERATION_TASK");
    expect(tasks).toContain('id: "exam_generation"');
    const runner = read("lib/ai/tasks/runner.ts");
    expect(runner).toContain('"exam_generation"');
  });

  it("مسار الامتحان بينادي المهمة الجديدة", () => {
    const route = read(PROCESS_ROUTE);
    expect(route).toContain('runAiTask("exam_generation"');
    expect(route).not.toContain('runAiTask("chat"');
  });

  it("المحرك: جزء بيفشل ⇒ يكمل بدل ما يرمي", () => {
    const engine = read("lib/ai/exam-review.ts");
    expect(engine).toContain("failedParts");
    expect(engine).toContain("محاولتين");
  });

  it("السجل: qwen/qwen3.8-27b (بديل llama المحجوب) مسجّل بس **معطّل** لحد الفحص الحي", () => {
    const models = read("lib/ai/models.ts");
    expect(models).toContain("qwen/qwen3.8-27b");
    // ⚠️ موديل محتاج فحص حي في التفضيلات = كل نداء بيضيع وقته.
    expect(models).toMatch(/id: "qwen\/qwen3\.8-27b"[\s\S]{0,600}?enabled: false/);
    const routing = read("lib/ai/routing.ts");
    // ⚠️ قائمة تفضيلات التوليد ما فيهاش الموديل غير المتحقق منه.
    const block = routing.slice(routing.indexOf("exam_generation: ["), routing.indexOf("]", routing.indexOf("exam_generation: [")));
    expect(block).not.toContain("qwen/qwen3.8-27b");
  });

  it("الـ404 المؤقت (تأخّر الـreplica) بيتعالج، مش خطأ نهائي", () => {
    const route = read(PROCESS_ROUTE);
    // ⚠️ قراءة واحدة + إعادة محاولة واحدة قبل «مش موجودة».
    expect(route).toContain("REPLICA_RETRY_DELAY_MS");
    const runner = read("components/exams/ExamRunner.tsx");
    expect(runner).toContain("missingSessionTries");
    expect(runner).toContain("stateRes.status === 404");
  });

  it("مصدر بلا نص ⇒ 422 (مش 404 و.message واضحة)", () => {
    const route = read(PROCESS_ROUTE);
    expect(route).toContain('fail("NO_TEXT", 422');
    const createRoute = read("app/api/exam-sessions/route.ts");
    expect(createRoute).toContain('fail("SOURCE_WITHOUT_TEXT", 422');
    // ⚠️ الفحص المسبق لازم يكون **قبل** إنشاء الجلسة (مش بعده) عشان
    //    الكريدت ما يتحجزش ل.session ميتة.
    expect(createRoute.indexOf("SOURCE_WITHOUT_TEXT")).toBeLessThan(
      createRoute.indexOf("createExamSession(supabase")
    );
  });

  it("المحرك بيقبل Array مباشر كـJSON للأسئلة", () => {
    const engine = read("lib/ai/exam-review.ts");
    expect(engine).toContain("Array.isArray(parsed)");
  });
});

/**
 * ✂️ ميزانية المصادر + إشعار القصّ.
 *
 * العَرَض الأصلي: `total chunks 69 exceeds limit 9` على ملف 69 صفحة
 * صغيرة (≈35 ألف حرف — أقل من سقف الـ60 ألف) ⇒ منع إنشاء الامتحان.
 * السبب: `sum(ceil(len/12000))` لكل صف بدل حساب الإجمالي.
 */
describe("ميزانية المصادر — القطع من الإجمالي وإلغاء الرفض", () => {
  const DB51 = "db/51-exam-source-budget.sql";

  it("db/51 بيعيد تعريف الدالتين (نفس التواقيع)", () => {
    const sql = read(DB51);
    expect(sql).toContain(
      "create or replace function public.create_exam_session_with_sources_reserve"
    );
    expect(sql).toContain("create or replace function public.create_exam_session_with_reserve");
    expect(sql).toContain("grant execute on function public.create_exam_session_with_reserve(text, uuid[]) to authenticated;");
  });

  it("القطع بيتحسب من الإجمالي مش مجموع ceil لكل صف", () => {
    const sql = read(DB51);
    expect(sql).toContain("v_total_chunks := ceil(v_total_chars::numeric / 12000)::int;");
  });

  it("مافيش رفض على عدد القطع أو على 60 ألف حرف", () => {
    const sql = read(DB51);
    expect(sql).not.toMatch(/raise exception 'total chunks/);
    expect(sql).not.toMatch(/raise exception 'total chars/);
  });

  it("سقف حماية من الإساءة لسه موجود", () => {
    expect(read(DB51)).toContain("source too large: % chars");
  });

  it("الراوت بيجهّز إشعار قصّ عربي", () => {
    const route = read(CREATE_ROUTE);
    expect(route).toContain("truncatedSources");
    expect(route).toContain("هيغطي أول");
    expect(route).toContain("notice: truncationNotice");
  });

  it("خطأ الميزانية الخام مايوصلش للطالب بإنجليزي", () => {
    const route = read(CREATE_ROUTE);
    expect(route).toContain("budgetDetail(created.error)");
    expect(route).not.toContain('return fail("BUDGET", 400, created.error)');
  });
});

describe("GET /api/exam-sessions — قائمة «امتحاناتي»", () => {
  it("الراوت فيه GET بحد أقصى للقائمة", () => {
    const route = read(CREATE_ROUTE);
    expect(route).toMatch(/export async function GET\(req: Request\)/);
    expect(route).toContain("Math.min(50");
  });

  it("الهَب بيقرا من الـAPI بدل استعلامين في المتصفح", () => {
    const hub = read("components/exams/ExamsHub.tsx");
    expect(hub).toContain('fetch("/api/exam-sessions?limit=20"');
    expect(hub).not.toContain('from("exam_session_answers")');
  });

  it("الـGET بيرجّع عدد الإجابات جوه كل جلسة", () => {
    expect(read(CREATE_ROUTE)).toContain("answered: answered.get(row.id) ?? 0");
  });
});

describe("قصّ المصادر — نفس السقف للمحاضرات والمستندات", () => {
  it("المحاضرة بتتقصّ عند EXAM_SOURCE_MAX_CHARS وقت المعالجة", () => {
    expect(read(PROCESS_ROUTE)).toContain(
      "transcript = lecture.transcript_text.slice(0, EXAM_SOURCE_MAX_CHARS);"
    );
  });

  it("نص المستند بيتقصّ في exam-sources", () => {
    const sources = read("lib/ai/exam-sources.ts");
    expect(sources).toContain("truncated: full.length > EXAM_SOURCE_MAX_CHARS");
    expect(sources).toContain("totalChars: full.length");
  });
});

/**
 * 🛟 استرجاع الكريدت + 📈 تراكم نقاط الضعف + 📄 الرفع من الشات.
 * كلها حاجات بتلمس فلوس الطالب أو وعده («إنت ضعيف في…») — فلازم
 * يكون ليها حارس يمنع رجوعها.
 */
describe("استرجاع الكريدت عند فشل الجلسة", () => {
  const ANSWERS_ROUTE = "app/api/exam-sessions/[id]/answers/route.ts";

  it("راوت المعالجة بيسترجع الكريدت لو كل البنود فشلت", () => {
    const route = read(PROCESS_ROUTE);
    expect(route).toContain("refundIfSessionDead");
    expect(route).toContain('rpc("refund_ai_credit"');
    expect(route).toContain("exam_session:${sessionId}");
    expect(route).toContain("credit_refunded_at");
  });

  it("الاسترجاع مش بيلمس جلسة مكتملة", () => {
    expect(read(PROCESS_ROUTE)).toContain('session.status === "completed"');
  });

  it("الحاكم النقي بيحمي الشرط", () => {
    expect(read("lib/ai/exam-sessions.ts")).toContain("export function isSessionExhausted");
  });

  it("الراوت بيسجل نقاط الضعف في user_weaknesses", () => {
    const route = read(ANSWERS_ROUTE);
    expect(route).toContain("summarizeByTopic");
    expect(route).toContain('from("user_weaknesses")');
    // «عام» مش جزء حقيقي ⇒ ممنوع يتسجل كضعف.
    expect(route).toContain("FALLBACK_TOPIC");
  });
});

describe("تقييم الأجزاء — ربط السؤال بالجزء", () => {
  it("البرومبت بيطلب topic والـvalidator بيقبله", () => {
    const engine = read("lib/ai/exam-review.ts");
    expect(engine).toContain('الحقل "topic" إجباري');
    expect(engine).toContain('"topic"');
    expect(engine).toContain("function readTopic");
  });

  it("المولّد بيربط كل سؤال بقسم من الملخص، وبيحط بديل حتمي لو الموديل نساه", () => {
    const engine = read("lib/ai/exam-review.ts");
    expect(engine).toContain("extractSectionTitles(summary)");
    expect(engine).toContain("snapTopic(question.topic, sections)");
    expect(engine).toContain("`الجزء ${index + 1}`");
  });

  it("واجهة النتيجة بتعرض أضعف جزء", () => {
    const results = read("components/exams/ExamResults.tsx");
    expect(results).toContain("summarizeByTopic");
    expect(results).toContain("أضعف جزء عندك");
  });
});

describe("رفع ملف من الشات ⇒ امتحان منه", () => {
  it("الشات بيرفع على /api/documents ويقترح امتحان", () => {
    const chat = read("components/ChatWorkspace.tsx");
    expect(chat).toContain('fetch("/api/documents"');
    expect(chat).toContain("/exams?gen=1&document=");
  });

  it("صفحة الامتحانات بتقرا ?document= والمولّد بيحدده", () => {
    expect(read("app/exams/page.tsx")).toContain('str("document", 64)');
    expect(read("components/exams/ExamGenerator.tsx")).toContain("initial.document");
  });
});
