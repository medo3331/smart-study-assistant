/* ==========================================================================
   بحث الويب عبر Tavily — للأسئلة المعرفية وطلبات «ابحث في النت».
   المفتاح من env (TAVILY_API_KEY) — لو مش موجود بنرجّع TAVILY_NOT_CONFIGURED
   والـ route يكمل عادي من غير ما يكسر الرد.
   ========================================================================== */

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const TIMEOUT_MS = 12_000;
const MAX_RESULTS = 5;

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOutcome {
  ok: boolean;
  answer?: string;
  results: WebResult[];
  error?: "TAVILY_NOT_CONFIGURED" | "TAVILY_FAILED";
}

export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

export async function webSearch(query: string, opts?: { deep?: boolean }): Promise<WebSearchOutcome> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return { ok: false, results: [], error: "TAVILY_NOT_CONFIGURED" };
  const q = query.trim().slice(0, 400);
  if (!q) return { ok: false, results: [], error: "TAVILY_FAILED" };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: q,
        search_depth: opts?.deep ? "advanced" : "basic",
        include_answer: true,
        max_results: MAX_RESULTS,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, results: [], error: "TAVILY_FAILED" };
    const data = (await res.json().catch(() => null)) as {
      answer?: string;
      results?: { title?: string; url?: string; content?: string }[];
    } | null;
    const results = (data?.results ?? [])
      .filter((r) => typeof r.url === "string" && r.url)
      .slice(0, MAX_RESULTS)
      .map((r) => ({
        title: (r.title ?? "").slice(0, 200),
        url: r.url as string,
        snippet: (r.content ?? "").slice(0, 500),
      }));
    return { ok: true, answer: data?.answer || undefined, results };
  } catch {
    return { ok: false, results: [], error: "TAVILY_FAILED" };
  }
}

/** تحويل النتيجة لكتلة تُحقن في system prompt — null لو مفيش حاجة مفيدة. */
export function formatWebSearchBlock(outcome: WebSearchOutcome): string | null {
  if (!outcome.ok) return null;
  const lines: string[] = [];
  if (outcome.answer) lines.push(`ملخص سريع من البحث: ${outcome.answer}`);
  if (outcome.results.length > 0) {
    lines.push("مصادر:");
    for (const r of outcome.results) {
      lines.push(`- ${r.title || r.url} — ${r.url}`);
      if (r.snippet) lines.push(`  ${r.snippet}`);
    }
  }
  if (lines.length === 0) return null;
  return lines.join("\n");
}
