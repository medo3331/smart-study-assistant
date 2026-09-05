import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { AIService } = await import("../lib/ai/service.ts");

try {
  const res = await AIService.generateStructured("quiz", 
    `Generate exactly 3 mathematics practice questions for Egyptian secondary grade 3. Each must be an MCQ with exactly 4 options (A, B, C, D), one correct option (index 0-3), an explanation in Arabic, difficulty easy/medium/hard, and topic. Return pure JSON array matching this schema: [{"question_text":"...","options_json":["...","...","...","..."],"correct_option_index":0,"explanation":"...","difficulty":"easy","topic":"..."}]`,
    (v) => {
      const arr = Array.isArray(v) ? v : JSON.parse(v);
      if (!Array.isArray(arr) || arr.length < 1) throw new Error("Not array");
      return arr;
    },
    { messages: [{role:"user", content:"Generate 3 math questions"}], temperature: 0.2, model: "nvidia/nemotron-3.5-lightning-30b-a3b" }
  );
  console.log("QUIZ NVIDIA SUCCESS provider=", res.provider, "model=", res.model, "count=", Array.isArray(res.value) ? res.value.length : "?");
  console.log(JSON.stringify(res.value, null, 2).slice(0, 1200));
} catch (e) {
  console.error("QUIZ NVIDIA FAIL:", e?.name, e?.message?.slice(0, 300));
}
