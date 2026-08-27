---
patterns_documented: 2026-08-27
session: Phase 3-6 AI Agent Integration (11 agents)
environment: /c/Desktop/smart-study-assistant (repo main)
---

# Agent System Patterns — Verified from Session

## Registry
- AgentId from lib/ai/agents/types.ts (AGENT_IDS array)
- Must match exactly ("language" not "language_tutor", etc.)
- AgentResult union: ok:true (provider/model/content/usage?) vs ok:false (agent/code/message/retryable)

## Pattern Used (verified across 11 agents)
- import { AgentResult, AgentId } from "./types"
- const AGENT_ID: AgentId = "...";
- runAgent?: (opts) => Promise<AgentResult> — never direct fetch
- detectLang() separate from source/target
- buildPrompt() uses ctx + vision input
- MODEL_404 → return ok:false with retryable
- No mock/fake inference in tests

## Phase-specific Checks (must pass before claiming done)
- TypeScript: npx tsc --noEmit (0 new errors)
- Tests: npx vitest run lib/ai/agents/__tests__/<agent>.test.ts
- Build: npm run build (watch for pre-existing errors)
- Live inference: only claim PASS if real HTTP response with actual content; else SKIPPED/NOT EXECUTED (never fabricate)
- Secret audit: grep agent source; must be 0

## Common Pitfalls Found
- AgentResult union requires checking `ok` before `.provider` / `.content` (test assertions fail with TS2339 if using directly)
- node_modules/.bin/next missing is env issue, not code failure
- Preview-first workflow: draft → show → approve → implement → verify
- Never say "done" if only file exists (must verify build + test + integration)
