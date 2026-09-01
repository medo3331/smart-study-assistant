with open('app/api/chat/route-rag.patch.ts') as f:
    lines = f.read().splitlines()
new_lines = lines[:52] + [
"// c/d/e/f — RAG logic (context assembly + prompt + threshold 0.7 + response unchanged)",
"if (matches && Array.isArray(matches) && matches.length > 0) {",
"  const matchArr = (matches as any).data ?? matches;",
"  const bestSim = Math.max(...((matchArr as any[]).map((m: any) => m.similarity ?? 0) || [0]));",
"  ragThresholdMet = bestSim >= 0.7;",
"  ragContext = (matchArr as any[]).map((m: any) => `--- من ${m.source_name ?? \"\"}${m.source_page ? \" (صفحة \" + m.source_page + \")\" : \"\"} ---\\n${m.content ?? \"\"}`).join(\"\\n\\n\");",
"  ragSources = (matchArr as any[]).map((m: any) => ({ source_name: m.source_name ?? \"\", source_page: m.source_page ?? \"\", content: m.content ?? \"\", similarity: m.similarity ?? 0 }));",
"}",
"const ragInstruction = ragContext",
"  ? `أجب بناءً على السياق التالي من مصادر معتمدة فقط. إذا لم يكن السياق متعلقاً بالسؤال، قل ذلك بوضوح.`",
"  : `أجب بشكل عام. هذه إجابة عامة وليست من مصدر معتمد.`;",
"const sourceCite = ragSources.filter((s) => s.similarity >= 0.7)",
"  .map((s) => `المصدر: ${s.source_name}${s.source_page ? \" (\" + s.source_page + \")\" : \"\"}`).join(\"; \");",
"// Modify system message (before aiRouter.completeChat) — response/streaming untouched",
"system = ragContext",
"  ? `[RAG CONTEXT ENABLED]\\n${ragInstruction}\\n\\nالسياق:\\n${ragContext}\\n\\nسؤال الطالب: ${lastUserMsg}\\n\\nتعليمات الإخراج: استخدم السياق أعلاه. في نهاية الإجابة اذكر المصادر المستخدمة بهذا الشكل: \\"من ${ragSources[0]?.source_name ?? \"\"}\\".`",
"  : (system || \"\") + \"\\n\\nسؤال الطالب: \" + lastUserMsg + \"\\n\\n(إجابة عامة — لا مصدر معتمد محدد.)\";",
"// --- END RAG PATCH ---",
"// Note: user said DO NOT change response/streaming shape; only retrieval + prompt added.",
] + lines[88:]
with open('app/api/chat/route-rag.patch.ts', 'w') as f:
    for ln in new_lines:
        f.write(ln + '\n')
print('Rewrote', len(new_lines), 'lines; placeholder removed:', 'PLACEHOLDER' not in ''.join(new_lines))
