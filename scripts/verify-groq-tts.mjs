/**
 * التحقق من TTS المجاني على Groq (Orpheus) — D-REAL-008.
 *
 * ⚠️ حد Orpheus الرسمي: 200 حرف لكل طلب — الرد WAV مستقل لكل مقطع.
 * شغّل:  node scripts/verify-groq-tts.mjs
 * النتيجة المتوقعة: VALID لكل موديل → نثبّت الشكل في app/api/voice/speak/route.ts.
 * أي 400/422 → طبع الرد الأول 200 حرف وابعت النتيجة.
 */

const KEY = process.env.GROQ_API_KEY || "";
if (!KEY) {
  console.error("GROQ_API_KEY مش موجود في البيئة.");
  process.exit(1);
}

const URL = "https://api.groq.com/openai/v1/audio/speech";

const CASES = [
  { label: "orpheus-arabic-saudi (voice: fahad)", body: { model: "canopylabs/orpheus-arabic-saudi", voice: "fahad", input: "مرحبا بكم في ماجيكلي، مساعدك الذكي للمذاكرة.", response_format: "wav" } },
  { label: "orpheus-arabic-saudi (voice: lulwa)", body: { model: "canopylabs/orpheus-arabic-saudi", voice: "lulwa", input: "مرحبا بكم في ماجيكلي، مساعدك الذكي للمذاكرة.", response_format: "wav" } },
  { label: "orpheus-v1-english (voice: hannah)", body: { model: "canopylabs/orpheus-v1-english", voice: "hannah", input: "Welcome to Magicly, your smart study assistant.", response_format: "wav" } },
];

console.log("Groq TTS (Orpheus) verification");
console.log("================================");

let anyValid = false;
for (const c of CASES) {
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(c.body),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const isWav = buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF";
      console.log(`  ${c.label} -> HTTP 200 (${buf.length} bytes) ${isWav ? "WAV ✓" : "غريب — ليس WAV"} ${isWav ? "VALID ✓" : "✗"}`);
      if (isWav) anyValid = true;
    } else {
      const detail = await res.text().catch(() => "");
      console.log(`  ${c.label} -> HTTP ${res.status} ✗`);
      console.log(`    ${detail.slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`  ${c.label} -> خطأ شبكة: ${(e && e.message) || e}`);
  }
}

console.log(anyValid
  ? "\nالموديلات المتحقق منها فوق شغالة — المسار في app/api/voice/speak/route.ts جاهز."
  : "\nمفيش موديل اتأكد — راجع شكل الطلب/المفتاح قبل اعتماد المسار.");
