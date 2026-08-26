import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

/**
 * فحص حي end-to-end لطبقة الراوتنج الحقيقية (AIService → Router → Provider)
 * بمهمة واحدة صغيرة لكل مسار رئيسي. بدون أي mocks — الردود الحقيقية فقط،
 * وبدون طباعة أي قيم حساسة أو محتوى المستخدم.
 */
const { AIService } = await import("../lib/ai/service.ts");

const paths = [
  { label: "CHAT     (policy: Groq)", task: "chat", msg: 'Reply with exactly: OK' },
  { label: "TUTOR    (matrix: Nemotron Lightning)", task: "tutor", msg: "اشرح لي في جملة واحدة يعني إيه التمثيل الضوئي" },
  { label: "PLANNING (matrix: Nemotron Super)", task: "planning", msg: "اكتب خطة من سطرين لمراجعة مادة في أسبوع" },
];

for (const path of paths) {
  const startedAt = Date.now();
  try {
    const response = await AIService.generate(path.task, {
      messages: [{ role: "user", content: path.msg }],
      temperature: 0,
    });
    console.log(
      `${path.label} -> ${response.provider}/${response.model} (${Date.now() - startedAt}ms) content=${response.content.length} chars ${response.content.trim() ? "✓" : "EMPTY ✗"}`
    );
  } catch (error) {
    console.log(`${path.label} -> FAILED: ${error?.name}: ${String(error?.message).slice(0, 120)}`);
  }
}

// RAG embeddings عبر الموديل المتحقق منه.
try {
  const startedAt = Date.now();
  const { aiRouter } = await import("../lib/ai/router.ts");
  const nvidia = aiRouter["providers"]?.nvidia;
  if (!nvidia?.embed) {
    console.log("RAG       -> SKIP (no embedding provider instantiated)");
  } else {
    const result = await nvidia.embed({ texts: ["مرحبا بالعالم"] });
    console.log(
      `RAG       -> ${result.provider}/${result.model} (${Date.now() - startedAt}ms) dim=${result.vectors[0]?.length} ✓`
    );
  }
} catch (error) {
  console.log(`RAG       -> FAILED: ${error?.name}: ${String(error?.message).slice(0, 120)}`);
}
