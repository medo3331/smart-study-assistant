// Tavily Web Search verification — شغّله محليًا بعد ما تحط TAVILY_API_KEY في .env.local
//   node scripts/verify-tavily.mjs
const key = process.env.TAVILY_API_KEY?.trim();

console.log("Tavily Web Search verification");
console.log("=================================");

if (!key) {
  console.log("✗ TAVILY_API_KEY مش موجود في البيئة.");
  console.log('  ضيفه في .env.local بالشكل: TAVILY_API_KEY=tvly-...');
  process.exit(1);
}

if (!key.startsWith("tvly-")) {
  console.log(`⚠️ المفتاح مش بيبدأ بـ "tvly-" (طوله ${key.length}) — اتأكد إنه نسخة كاملة من مفاتيح Tavily.`);
}

try {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query: "أحدث توصيات علاج ارتفاع ضغط الدم",
      max_results: 3,
      include_answer: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.log(`✗ HTTP ${res.status} — ${body.slice(0, 300)}`);
    if (res.status === 401 || res.status === 403) {
      console.log("  المفتاح مرفوض — راجعه من لوحة Tavily.");
    }
    process.exit(1);
  }

  const data = await res.json();
  console.log("Tavily: OK ✓");
  if (data.answer) console.log(`answer: ${String(data.answer).slice(0, 200)}`);
  for (const r of (data.results ?? []).slice(0, 3)) {
    console.log(`- ${r.title} → ${r.url}`);
  }
} catch (e) {
  console.log("✗ فشل الاتصال:", e?.message ?? e);
  process.exit(1);
}
