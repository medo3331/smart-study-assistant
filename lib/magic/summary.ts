// lib/magic/summary.ts
//
// Pure helper functions for conversation summary lifecycle.
// Extracted for testability (Sprint 2b.1.2 / 2b.1.3).

export interface SummaryCoverage {
  lastCovered: number;
  hasPrefix: boolean;
}

/** What the summary block should do for this request. */
export type SummaryAction =
  | "none" // nothing to do
  | "generate" // first summary (needs AI)
  | "refresh" // 5+ new messages since last coverage (needs AI)
  | "stamp"; // legacy summary: add [covered:N] via CAS — NO AI call

/**
 * Parse the [covered:N] prefix from a summary string.
 * Returns { lastCovered, hasPrefix }.
 * If no valid prefix, lastCovered = 0 and hasPrefix = false.
 */
export function parseCoverage(summary: string | null): SummaryCoverage {
  if (!summary) return { lastCovered: 0, hasPrefix: false };
  const m = summary.match(/^\[covered:(\d+)\]/);
  if (m) return { lastCovered: parseInt(m[1], 10) || 0, hasPrefix: true };
  return { lastCovered: 0, hasPrefix: false };
}

/** True only when the summary carries a VALID `[covered:<digits>]` prefix. */
export function hasValidCoveragePrefix(summary: string | null): boolean {
  return parseCoverage(summary).hasPrefix;
}

/**
 * Decide the action for this request — deliberately classifying every shape:
 *
 * - < 10 messages                    → "none"
 * - no summary / whitespace-only     → "generate" (AI, initial rules)
 * - valid [covered:N] prefix         → "refresh" at >= N+5, else "none"
 * - MALFORMED prefix ([covered:...]  → "stamp" if there is text after it,
 *   that does not parse)               else "generate" (nothing worth keeping)
 * - legacy plain text (no valid      → "stamp" (CAS, no AI — the previous
 *   prefix, no malformed prefix)        fallback pinned coverage to totalMsgs,
 *                                       which made the summary never refresh;
 *                                       stamping once enters the normal
 *                                       5-message schedule permanently)
 */
export function getSummaryAction(totalMsgs: number, summary: string | null): SummaryAction {
  if (totalMsgs < 10) return "none";
  if (!summary || summary.trim().length === 0) return "generate";
  if (hasValidCoveragePrefix(summary)) {
    const { lastCovered } = parseCoverage(summary);
    // Refresh after at least 5 new messages since last coverage.
    return totalMsgs >= lastCovered + 5 ? "refresh" : "none";
  }
  // Deliberate malformed-metadata handling: NOT silently "valid legacy".
  if (/^\[covered:/.test(summary)) {
    const remainder = summary.replace(/^\[covered:[^\]]*\]\s*/, "").trim();
    return remainder.length > 0 ? "stamp" : "generate";
  }
  return "stamp";
}

/**
 * Legacy + malformed-prefix summaries must NOT block forever (old fallback)
 * and must NOT trigger an AI call just to add metadata. Stamp the CURRENT
 * message count onto the stored text once via CAS:
 *
 * - The summary text is preserved exactly (no truncation, no reformulation).
 * - A malformed `[covered:...]` prefix is replaced by a valid one; plain
 *   legacy text is wrapped as-is.
 * - After stamping, `getSummaryAction` parses the prefix normally and the
 *   standard 5-message refresh schedule applies from now on.
 */
export function stampLegacyCoverage(summary: string, totalMsgs: number): string {
  const trimmed = summary.trim();
  if (!trimmed) return "";
  const text = trimmed.replace(/^\[covered:[^\]]*\]\s*/, "").trim();
  if (!text) return "";
  return `[covered:${totalMsgs}] ${text}`;
}

/**
 * True only when an AI summarization call is warranted (generate or refresh).
 */
export function shouldRefreshSummary(totalMsgs: number, summary: string | null): boolean {
  const action = getSummaryAction(totalMsgs, summary);
  return action === "generate" || action === "refresh";
}

/**
 * Build the input text for summary generation.
 * Includes previous summary (stripped of prefix), recent history, and current prompt.
 * Avoids duplicating the current prompt if it already exists in history.
 *
 * @param previousSummary - the existing summary (with or without [covered:N] prefix)
 * @param history - recent conversation history (last N messages)
 * @param currentPrompt - the current user message
 * @returns the combined input text for the summarization LLM
 */
export function buildSummaryInput(
  previousSummary: string | null,
  history: Array<{ role: string; content: string }>,
  currentPrompt: string
): string {
  const parts: string[] = [];
  // Include previous summary (stripped of [covered:N] prefix).
  if (previousSummary && previousSummary.trim().length > 0) {
    const stripped = previousSummary.replace(/^\[covered:\d+\]\s*/, "").trim();
    if (stripped.length > 0) {
      parts.push(`ملخص سابق: ${stripped}`);
    }
  }
  // Include recent history (avoid duplicating current prompt).
  const promptTrimmed = currentPrompt.trim();
  for (const m of history) {
    const content = String(m.content ?? "").trim();
    if (content.length === 0) continue;
    // Skip if this message is the current prompt (already included).
    if (m.role === "user" && content === promptTrimmed) continue;
    parts.push(`${m.role}: ${content.slice(0, 500)}`);
  }
  // Include current prompt once.
  if (promptTrimmed.length > 0) {
    parts.push(`user: ${promptTrimmed.slice(0, 500)}`);
  }
  return parts.join("\n");
}

/**
 * Prefix a NEW (AI-generated) summary with the coverage marker.
 */
export function addCoveragePrefix(summary: string, totalMsgs: number): string {
  const trimmed = summary.trim();
  if (trimmed.length === 0) return "";
  return `[covered:${totalMsgs}] ${trimmed}`.slice(0, 1500);
}
