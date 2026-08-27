# Magicly AI Agent Foundation — Phase 1 Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build the AI Agent abstraction layer on top of the already-shipped `lib/ai/` foundation so that any new agent (Study Tutor, Exam Solver, …) can be added without touching the UI, providers, or routing.

**Architecture:**

```
Feature (UI / API route)
        ↓
   AIService          ← already exists in lib/ai/service.ts
        ↓
   AiRouter           ← already exists in lib/ai/routing.ts
        ↓
   Provider (Groq / NVIDIA / OpenRouter / Gemini)  ← all already wired
        ↓
   Model Registry     ← already in lib/ai/models.ts
```

This phase adds ONE new layer on top: **Agent abstraction**. It defines how a request goes from
"the user asked to study anatomy" → "the Study Tutor agent" → "the right model via the existing
router." No providers change, no UI changes, no auth changes.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, Vitest-style `node --test` runner
pattern already used in `scripts/test-ai-*.mjs`. No new dependencies.

---

## Critical context for the implementer (read first)

1. **The AI foundation is already shipped.** `lib/ai/` already contains:
   - `service.ts` — `AIService` facade (the only thing product code is allowed to call)
   - `routing.ts` — `AiRouter` class with `routeCandidates` + `fallbackCandidatesFor`
   - `models.ts` — `MODEL_REGISTRY` (single source of truth for every model id)
   - `health.ts` — `AiHealthStatus` + `AiCapability` + `recordProviderResult`
   - `errors.ts` — `AiPublicError` + `toAiPublicError`
   - `types.ts` — `AiChatRequest` / `AiChatResponse` / `AiTaskType` / `AiProviderName`
   - `agents.ts` — three legacy agents (`marketing`/`research`/`content`) — DO NOT BREAK
   - `tasks/` — task-based runner (`runAiTask`, `AI_TASK_REGISTRY`)
   - `groq.ts` / `nvidia.ts` / `gemini.ts` / `openrouter.ts` — real providers, working
2. **There is NO `lib/ai/agents/` folder yet.** That is the only new directory in this phase.
3. **There is NO `lib/ai/router/` folder.** The current `lib/ai/router.ts` exports the configured
   `aiRouter` instance and re-exports the `AiRouter` class. We do not create a sub-folder.
4. **There is NO `lib/ai/context/` folder.** We will create it (small, optional helpers).
5. **There is NO `lib/ai/providers/` folder.** Providers live flat in `lib/ai/*.ts`; we do NOT
   move them in this phase. The user's brief asks for a `providers/` folder for "future
   organization," but doing that now would touch 5 working files for no behavior gain. We add
   a tiny `providers/index.ts` barrel only if it doesn't change the public surface. **Skip
   moving files; add a barrel only.** Verified-safe.
6. **The prompt mentions "DeepSeek"** as a provider, but no DeepSeek key is available and the
   NVIDIA `deepseek-v4-flash` is `enabled: false` (404 on this account per memory 2026-08-26).
   We register a **stub `DeepSeekProvider`** whose `healthCheck` returns `NOT_CONFIGURED` and
   whose `completeChat` throws `AiProviderError` with `AUTH_ERROR` semantics. The provider is
   import-safe and registered with the router, but it never wins selection until a key exists.
7. **`lib/ai/agents.ts` (the file) is a LEGACY 3-agent registry** (marketing/research/content).
   We do not delete it. We do not refactor it. We add a NEW `lib/ai/agents/` directory with
   a NEW registry that knows all 12 agents. The legacy file keeps working for
   `scripts/test-ai-agents.mjs`.
8. **Do NOT touch** `app/page.tsx`, `components/landing/*`, `app/dashboard/*`, `lib/auth*`,
   `lib/supabase/*`, the SQL schema, or any UI route. This phase is server-side only.
9. **The branch is `main`.** All commits stay on `main`. No push. No PR.

---

## Out of scope for Phase 1 (explicit)

- Building any agent's *behavior* (no prompt engineering, no tool calls, no actual Study Tutor logic)
- Real DeepSeek integration
- Streaming from agents (the existing `streaming.ts` is reused, not duplicated)
- Frontend surfaces for agents
- DB persistence of agent state
- Authentication context propagation (we only define a *type* for it)

---

## Files this phase will create

```
lib/ai/agents/
├── types.ts                ← AgentDefinition, AgentContext, AgentResult, AgentCapability
├── registry.ts             ← ALL_AGENTS, getAgent, registerAgent, agentIds()
├── agent-router.ts         ← AgentRouter class — pick agent, run via AIService
├── context/
│   ├── user-context.ts     ← extractUserContext(headers, supabase) — best-effort, safe
│   ├── study-context.ts    ← assembleStudyContext(lessonId) — typed shape, no I/O yet
│   └── index.ts            ← barrel
├── providers/
│   ├── nvidia.ts           ← re-export of existing lib/ai/nvidia (barrel)
│   ├── deepseek.ts         ← STUB provider (no key, throws AUTH_ERROR)
│   ├── groq.ts             ← re-export of existing lib/ai/groq (barrel)
│   └── index.ts            ← barrel exporting PROVIDER_INTERFACES
└── stubs/
    └── (12 stub agent modules: each is a 5-line file that returns AgentResult { ok: true, agent: id, content: '[stub]' })

lib/ai/agents/__tests__/
├── registry.test.mjs       ← 8 tests
├── agent-router.test.mjs   ← 10 tests
├── user-context.test.mjs   ← 5 tests
├── study-context.test.mjs  ← 4 tests
├── deepseek-stub.test.mjs  ← 4 tests
└── smoke.test.mjs          ← 3 end-to-end tests with stubbed AIService
```

Total new files: **17** (10 source + 6 test + 1 barrel).
Total modified files: **0** (we only add a barrel if it does not change a single existing import).

---

## Tests / validation strategy

- Every source file has at least one test file next to it in `lib/ai/agents/__tests__/`.
- Test runner: extend `scripts/test-ai-agents.mjs` to also `await import()` the new test files
  OR add a new `scripts/test-ai-agent-foundation.mjs` and wire it to `npm run test:ai:foundation`.
  The implementer picks the new-script route (cleaner; no risk to existing tests).
- `npx tsc --noEmit` after every task.
- `npm run build` once at the end.
- `scripts/test-ai-providers.mjs`, `scripts/test-ai-core.mjs`, `scripts/test-ai-agents.mjs`,
  `scripts/test-ai-router.mjs` all still pass (we did not touch them).

---

# Implementation tasks

> Each task is 2–5 minutes of focused work. Every task: write the test → run it (fail) → write
> minimal impl → run it (pass) → commit. No exceptions. No "I'll do tests later."

---

### Task 1: Add `npm run test:ai:foundation` script

**Objective:** Make the new test runner discoverable from package.json before any test exists.

**Files:**
- Modify: `package.json` (add one line to `scripts`)

**Step 1: Add the script line**

Add this entry inside `"scripts"` in `package.json`, alphabetically right after `test:ai:core`:

```json
    "test:ai:foundation": "node scripts/test-ai-agent-foundation.mjs",
```

**Step 2: Verify it doesn't crash on missing file (expected)**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
```

Expected: error like `Cannot find module '.../scripts/test-ai-agent-foundation.mjs'`. That's the
correct state — the script is wired, the file comes in Task 2.

**Step 3: Commit**

```bash
cd C:/Desktop/smart-study-assistant
git add package.json
git commit -m "chore(ai): add test:ai:foundation npm script"
```

---

### Task 2: Create the foundation test runner (empty, listing 0 tests)

**Objective:** Establish the runner that the new tests will plug into. It must import-cleanly,
exit 0, and print a count. No tests yet.

**Files:**
- Create: `scripts/test-ai-agent-foundation.mjs`

**Step 1: Write the file**

```js
#!/usr/bin/env node
/**
 * AI Agent Foundation tests — agent layer on top of the existing AI core.
 * Runs only the tests under lib/ai/agents/__tests__/; does not re-test core.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testsDir = join(__dirname, "..", "lib", "ai", "agents", "__tests__");

let pass = 0;
let fail = 0;
const failures = [];

const files = readdirSync(testsDir).filter((f) => f.endsWith(".test.mjs")).sort();
for (const file of files) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", join(testsDir, file)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  const stdout = result.stdout?.toString() ?? "";
  const stderr = result.stderr?.toString() ?? "";
  const ok = result.status === 0;
  if (ok) {
    pass++;
    process.stdout.write(`  ✓ ${file}\n${stdout.split("\n").filter(Boolean).map((l) => "    " + l).join("\n")}\n`);
  } else {
    fail++;
    failures.push({ file, stdout, stderr, code: result.status });
    process.stdout.write(`  ✗ ${file}\n${stdout}${stderr}`);
  }
}

console.log(`\nAI Agent Foundation: ${pass} files passed, ${fail} failed.`);
if (fail > 0) {
  for (const f of failures) console.error(`FAIL ${f.file} (exit ${f.code})`);
  process.exit(1);
}
```

**Step 2: Run it — expect graceful "0 passed"**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
```

Expected: prints `AI Agent Foundation: 0 files passed, 0 failed.` and exits 0. (It will read 0
files because the dir doesn't exist yet — that's fine, `readdirSync` will throw, runner exits
1. **We expect a failure here** — runner is not robust yet. That's the RED state.)

**Step 3: Make the runner robust to a missing tests dir**

Replace the `readdirSync` line with a guarded one. Add just above it:

```js
import { existsSync } from "node:fs";
const testsDirExists = existsSync(testsDir);
if (!testsDirExists) {
  console.log(`AI Agent Foundation: no tests yet (${testsDir} does not exist). Skipping.`);
  process.exit(0);
}
```

And remove the `files` declaration that depends on `readdirSync` without the dir.

**Step 4: Re-run — expect "no tests yet"**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
```

Expected: `AI Agent Foundation: no tests yet ...` and exit 0.

**Step 5: Commit**

```bash
cd C:/Desktop/smart-study-assistant
git add scripts/test-ai-agent-foundation.mjs
git commit -m "test(ai): add agent-foundation test runner (no tests yet)"
```

---

### Task 3: Create `lib/ai/agents/__tests__/` directory + first minimal test

**Objective:** Confirm test discovery works by adding a single deliberately-passing test.

**Files:**
- Create: `lib/ai/agents/__tests__/smoke.test.mjs`

**Step 1: Create the dir and file**

```js
import assert from "node:assert/strict";

assert.equal(1 + 1, 2);
console.log("smoke: ok");
```

**Step 2: Run via the runner**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
```

Expected: `1 files passed, 0 failed` and `smoke: ok` printed.

**Step 3: Commit**

```bash
cd C:/Desktop/smart-study-assistant
git add lib/ai/agents/__tests__/smoke.test.mjs
git commit -m "test(ai): add agent-foundation smoke test"
```

---

### Task 4: Define `AgentDefinition` and `AgentCapability` types

**Objective:** Lock the shape of an agent before writing any logic. This is the contract every
downstream module will import.

**Files:**
- Create: `lib/ai/agents/types.ts`
- Create: `lib/ai/agents/__tests__/types.test.mjs`

**Step 1: Write the failing test**

```js
// lib/ai/agents/__tests__/types.test.mjs
import assert from "node:assert/strict";
import {
  AGENT_IDS,
  AGENT_CAPABILITIES,
  isAgentId,
} from "../types.ts";

assert.deepEqual([...AGENT_IDS].sort(), [
  "career",
  "document_analyzer",
  "exam_solver",
  "freelance",
  "image",
  "language",
  "personal_assistant",
  "planner",
  "quiz_generator",
  "research",
  "study_tutor",
  "writing",
]);

assert.equal(isAgentId("study_tutor"), true);
assert.equal(isAgentId("Study_Tutor"), false);
assert.equal(isAgentId("study-tutor"), false);
assert.equal(isAgentId(null), false);
assert.equal(isAgentId(42), false);
assert.equal(isAgentId("not_an_agent"), false);

assert.ok(AGENT_CAPABILITIES.includes("chat"));
assert.ok(AGENT_CAPABILITIES.includes("image_generation"));
assert.ok(AGENT_CAPABILITIES.includes("long_context"));
assert.ok(AGENT_CAPABILITIES.includes("tool_calling"));
assert.ok(AGENT_CAPABILITIES.includes("document_ingest"));
console.log("types: ok");
```

**Step 2: Run — expect fail (module not found)**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
```

Expected: failure on `types.test.mjs` with module-not-found.

**Step 3: Implement `lib/ai/agents/types.ts`**

```ts
/**
 * Agent layer types — the contract every agent module fulfills.
 *
 * Everything above this layer (the router, the registry, every product feature)
 * talks in these terms. Provider SDKs and raw chat responses are STRICTLY below.
 */

/** Frozen list of agent ids shipped in Phase 1. Add new ids by extending this list. */
export const AGENT_IDS = [
  "study_tutor",
  "exam_solver",
  "quiz_generator",
  "research",
  "document_analyzer",
  "writing",
  "language",
  "planner",
  "career",
  "freelance",
  "image",
  "personal_assistant",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

/** What the agent needs from the model. The router maps these to provider capabilities. */
export const AGENT_CAPABILITIES = [
  "chat",
  "reasoning",
  "coding",
  "long_context",
  "image_generation",
  "tool_calling",
  "document_ingest",
  "vision",
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

/** Runtime type guard. Anything not in AGENT_IDS is rejected. */
export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && (AGENT_IDS as readonly string[]).includes(value);
}

/** Per-agent static metadata. The router uses it to pick a provider. */
export type AgentDefinition = {
  id: AgentId;
  label: string;
  description: string;
  /** Ordered list of capabilities the agent needs. The router requires ALL of them. */
  capabilities: AgentCapability[];
  /** Lower = try first. Equal priority = first-registered wins. */
  priority: number;
  /** Where the agent implementation lives. Phase 1: all "stub". */
  status: "stub" | "active";
};

/** Optional context threaded through. Phase 1: best-effort, may all be undefined. */
export type AgentContext = {
  userId?: string;
  role?: string;
  language?: string;
  educationLevel?: string;
  preferences?: Record<string, string>;
};

/** Input to runAgent. Same shape the existing AIService.complete accepts. */
export type AgentInput = {
  prompt: string;
  context?: AgentContext;
  options?: Record<string, unknown>;
};

/** Output of runAgent. Wraps whatever the underlying provider returned. */
export type AgentResult =
  | { ok: true; agent: AgentId; provider: string; model: string; content: string; usage?: { promptTokens?: number; completionTokens?: number } }
  | { ok: false; agent: AgentId; code: string; message: string; retryable: boolean };
```

**Step 4: Run — expect pass**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
npx tsc --noEmit
```

Expected: types test passes; `tsc --noEmit` clean (no output, exit 0).

**Step 5: Commit**

```bash
cd C:/Desktop/smart-study-assistant
git add lib/ai/agents/types.ts lib/ai/agents/__tests__/types.test.mjs
git commit -m "feat(ai/agents): define AgentId, AgentCapability, AgentDefinition types"
```

---

### Task 5: Define `lib/ai/agents/registry.ts` with 12 stub agents

**Objective:** A central registry every other module imports. Each agent is registered with
its metadata. Implementations are stubs in this phase.

**Files:**
- Create: `lib/ai/agents/registry.ts`
- Create: `lib/ai/agents/__tests__/registry.test.mjs`

**Step 1: Write the failing test**

```js
// lib/ai/agents/__tests__/registry.test.mjs
import assert from "node:assert/strict";
import { ALL_AGENTS, getAgent, agentIds, isRegistered } from "../registry.ts";
import { AGENT_IDS } from "../types.ts";

// Every AGENT_ID has a definition
for (const id of AGENT_IDS) {
  assert.ok(isRegistered(id), `agent ${id} not registered`);
  const def = getAgent(id);
  assert.equal(def.id, id);
  assert.ok(def.label.length > 0, `${id} has empty label`);
  assert.ok(def.description.length > 0, `${id} has empty description`);
  assert.ok(def.capabilities.length > 0, `${id} has no capabilities`);
  assert.equal(def.status, "stub", `${id} should be stub in Phase 1`);
}

// agentIds returns the full list, in registration order
assert.equal(agentIds().length, AGENT_IDS.length);
assert.equal(agentIds()[0], "study_tutor");

// getAgent throws on unknown ids (do not return undefined — caller bugs)
assert.throws(() => getAgent("not_a_real_agent"), /Unknown agent/);

// study_tutor is chat+reasoning+long_context, priority 1
const tutor = getAgent("study_tutor");
assert.equal(tutor.priority, 1);
assert.deepEqual([...tutor.capabilities].sort(), ["chat", "long_context", "reasoning"].sort());

// image agent is image_generation only
const img = getAgent("image");
assert.deepEqual([...img.capabilities], ["image_generation"]);

// ALL_AGENTS is frozen / readonly
assert.throws(() => { ALL_AGENTS["foo"] = {}; });

console.log("registry: ok");
```

**Step 2: Run — expect fail**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
```

**Step 3: Implement `lib/ai/agents/registry.ts`**

```ts
import type { AgentDefinition, AgentId } from "./types";
import { AGENT_IDS } from "./types";

/**
 * The single source of truth for every agent's metadata.
 *
 * Add a new agent by: (1) adding the id to AGENT_IDS in types.ts,
 * (2) appending its definition here in the SAME order, (3) writing the
 * stub under lib/ai/agents/stubs/<id>.ts.
 *
 * Order here = order in agentIds() = tiebreaker in routing.
 */
export const ALL_AGENTS: Readonly<Record<AgentId, AgentDefinition>> = Object.freeze({
  study_tutor: {
    id: "study_tutor",
    label: "Study Tutor",
    description: "يشرح الدروس والمفاهيم خطوة بخطوة حسب مستوى الطالب.",
    capabilities: ["chat", "reasoning", "long_context"],
    priority: 1,
    status: "stub",
  },
  exam_solver: {
    id: "exam_solver",
    label: "Exam Solver",
    description: "يحل امتحانات مع شرح خطوات الحل ومصدر الإجابة.",
    capabilities: ["chat", "reasoning", "long_context"],
    priority: 1,
    status: "stub",
  },
  quiz_generator: {
    id: "quiz_generator",
    label: "Quiz Generator",
    description: "يولّد اختبارات من درس أو وثيقة بناتج منظّم.",
    capabilities: ["chat", "reasoning", "structured_output"],
    priority: 1,
    status: "stub",
  },
  research: {
    id: "research",
    label: "Research",
    description: "تحليل ومقارنات وتقارير مبنية على المعلومات المعطاة.",
    capabilities: ["chat", "reasoning", "long_context"],
    priority: 2,
    status: "stub",
  },
  document_analyzer: {
    id: "document_analyzer",
    label: "Document Analyzer",
    description: "يلخّص ويستخرج من PDF/DOCX/صور.",
    capabilities: ["chat", "long_context", "document_ingest", "vision"],
    priority: 1,
    status: "stub",
  },
  writing: {
    id: "writing",
    label: "Writing Assistant",
    description: "مساعد كتابة أكاديمي ومحتوى عام.",
    capabilities: ["chat", "reasoning", "long_context"],
    priority: 2,
    status: "stub",
  },
  language: {
    id: "language",
    label: "Language Tutor",
    description: "تدريب لغات ومحادثة موجّهة حسب المستوى.",
    capabilities: ["chat"],
    priority: 2,
    status: "stub",
  },
  planner: {
    id: "planner",
    label: "Planner",
    description: "يخطط للدراسة والمهام بجداول زمنية.",
    capabilities: ["chat", "reasoning", "structured_output"],
    priority: 1,
    status: "stub",
  },
  career: {
    id: "career",
    label: "Career Coach",
    description: "توجيه مهني وسير ذاتية ومقابلات.",
    capabilities: ["chat", "reasoning"],
    priority: 3,
    status: "stub",
  },
  freelance: {
    id: "freelance",
    label: "Freelance Assistant",
    description: "مساعد فريلانس: عروض، تفاوض، إدارة مشاريع.",
    capabilities: ["chat", "reasoning", "long_context"],
    priority: 3,
    status: "stub",
  },
  image: {
    id: "image",
    label: "Image",
    description: "يولّد صورًا توضيحية من وصف نصي.",
    capabilities: ["image_generation"],
    priority: 1,
    status: "stub",
  },
  personal_assistant: {
    id: "personal_assistant",
    label: "Personal Assistant",
    description: "مساعد شخصي عام: تذكير، أفكار، تنظيم يوم.",
    capabilities: ["chat"],
    priority: 4,
    status: "stub",
  },
});

/** Stable, registration-order list of agent ids. */
export function agentIds(): AgentId[] {
  return AGENT_IDS.filter((id) => id in ALL_AGENTS);
}

/** O(1) presence check. */
export function isRegistered(id: string): id is AgentId {
  return id in ALL_AGENTS;
}

/** Throws on unknown ids — caller bug, never a soft miss. */
export function getAgent(id: string): AgentDefinition {
  if (!isRegistered(id)) {
    throw new Error(`Unknown agent "${id}". Register it in lib/ai/agents/registry.ts first.`);
  }
  return ALL_AGENTS[id];
}
```

**Step 4: Run — expect pass**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
npx tsc --noEmit
```

**Step 5: Commit**

```bash
cd C:/Desktop/smart-study-assistant
git add lib/ai/agents/registry.ts lib/ai/agents/__tests__/registry.test.mjs
git commit -m "feat(ai/agents): 12-agent registry with metadata and capabilities"
```

---

### Task 6: Create the stub implementations directory + one stub agent

**Objective:** Establish the stub pattern. Every agent in Phase 1 returns a deterministic
"this is a stub" response so the router can be tested end-to-end before any agent ships.

**Files:**
- Create: `lib/ai/agents/stubs/study_tutor.ts`
- Create: `lib/ai/agents/stubs/index.ts`
- Create: `lib/ai/agents/__tests__/stubs.test.mjs`

**Step 1: Write the failing test**

```js
// lib/ai/agents/__tests__/stubs.test.mjs
import assert from "node:assert/strict";
import { runStub } from "../stubs/index.ts";

const out = await runStub("study_tutor", { prompt: "اشرح لي التشريح" });
assert.equal(out.ok, true);
assert.equal(out.agent, "study_tutor");
assert.equal(out.provider, "stub");
assert.equal(out.model, "stub/v1");
assert.match(out.content, /study_tutor/);
assert.match(out.content, /stub/);

await assert.rejects(
  () => runStub("not_a_real_agent", { prompt: "x" }),
  /Unknown agent/,
);
console.log("stubs: ok");
```

**Step 2: Run — expect fail**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
```

**Step 3: Implement `lib/ai/agents/stubs/study_tutor.ts`**

```ts
import type { AgentId, AgentInput, AgentResult } from "../types";

/**
 * Phase-1 stub for the Study Tutor.
 *
 * Every stub follows the same shape: receives AgentInput, returns a deterministic
 * AgentResult that names the agent and tags itself as a stub. This lets the
 * router, registry, and tests all run end-to-end with no provider calls.
 *
 * Replace this file (do not edit it in place) when the real Study Tutor ships.
 */
export async function runStudyTutorStub(_input: AgentInput): Promise<AgentResult> {
  return {
    ok: true,
    agent: "study_tutor" as AgentId,
    provider: "stub",
    model: "stub/v1",
    content: "[study_tutor stub] (real implementation pending Phase 2)",
  };
}
```

**Step 4: Implement `lib/ai/agents/stubs/index.ts`**

```ts
import type { AgentId, AgentInput, AgentResult } from "../types";
import { isRegistered } from "../registry";
import { runStudyTutorStub } from "./study_tutor";

/**
 * Stubs dispatcher. Phase 1: every agent routes through runStub.
 *
 * New agents: add their run function to the STUBS map. The router will pick
 * it up automatically — no router changes needed.
 */
const STUBS: Record<AgentId, (input: AgentInput) => Promise<AgentResult>> = {
  study_tutor: runStudyTutorStub,
  exam_solver: async (i) => ({ ok: true, agent: "exam_solver", provider: "stub", model: "stub/v1", content: "[exam_solver stub]" }),
  quiz_generator: async (i) => ({ ok: true, agent: "quiz_generator", provider: "stub", model: "stub/v1", content: "[quiz_generator stub]" }),
  research: async (i) => ({ ok: true, agent: "research", provider: "stub", model: "stub/v1", content: "[research stub]" }),
  document_analyzer: async (i) => ({ ok: true, agent: "document_analyzer", provider: "stub", model: "stub/v1", content: "[document_analyzer stub]" }),
  writing: async (i) => ({ ok: true, agent: "writing", provider: "stub", model: "stub/v1", content: "[writing stub]" }),
  language: async (i) => ({ ok: true, agent: "language", provider: "stub", model: "stub/v1", content: "[language stub]" }),
  planner: async (i) => ({ ok: true, agent: "planner", provider: "stub", model: "stub/v1", content: "[planner stub]" }),
  career: async (i) => ({ ok: true, agent: "career", provider: "stub", model: "stub/v1", content: "[career stub]" }),
  freelance: async (i) => ({ ok: true, agent: "freelance", provider: "stub", model: "stub/v1", content: "[freelance stub]" }),
  image: async (i) => ({ ok: true, agent: "image", provider: "stub", model: "stub/v1", content: "[image stub]" }),
  personal_assistant: async (i) => ({ ok: true, agent: "personal_assistant", provider: "stub", model: "stub/v1", content: "[personal_assistant stub]" }),
};

export async function runStub(agentId: string, input: AgentInput): Promise<AgentResult> {
  if (!isRegistered(agentId)) {
    throw new Error(`Unknown agent "${agentId}". Register it in lib/ai/agents/registry.ts first.`);
  }
  return STUBS[agentId](input);
}
```

**Step 5: Run — expect pass**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
npx tsc --noEmit
```

**Step 6: Commit**

```bash
cd C:/Desktop/smart-study-assistant
git add lib/ai/agents/stubs/ lib/ai/agents/__tests__/stubs.test.mjs
git commit -m "feat(ai/agents): stub dispatcher for 12 agents (Phase 1)"
```

---

### Task 7: DeepSeek provider stub

**Objective:** Register DeepSeek as a known provider with the agent layer. No real API call
ever happens until a key is added to the environment.

**Files:**
- Create: `lib/ai/agents/providers/deepseek.ts`
- Create: `lib/ai/agents/providers/nvidia.ts` (barrel)
- Create: `lib/ai/agents/providers/groq.ts` (barrel)
- Create: `lib/ai/agents/providers/index.ts` (barrel + INTERFACE export)
- Create: `lib/ai/agents/__tests__/deepseek-stub.test.mjs`

**Step 1: Write the failing test**

```js
// lib/ai/agents/__tests__/deepseek-stub.test.mjs
import assert from "node:assert/strict";
import { DeepSeekProvider, INTERFACES } from "../providers/index.ts";

// Provider exists in the interface map
assert.equal(INTERFACES.deepseek.name, "deepseek");

// healthCheck returns NOT_CONFIGURED (matches health.ts AiHealthStatus)
const h = await INTERFACES.deepseek.healthCheck();
assert.equal(h.status, "NOT_CONFIGURED");
assert.match(h.detail, /API key/);

// generate always throws AiProviderError-shaped error
await assert.rejects(
  () => INTERFACES.deepseek.generate({ prompt: "hi" }),
  /DeepSeek/,
);

// Direct class is also exported
assert.equal(DeepSeekProvider.name, "DeepSeekProvider");
console.log("deepseek-stub: ok");
```

**Step 2: Run — expect fail**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
```

**Step 3: Implement `lib/ai/agents/providers/deepseek.ts`**

```ts
import type { ProviderInterface, ProviderHealth, AgentInput } from "./types";

/**
 * DeepSeek provider — STUB.
 *
 * Reason: no DeepSeek API key is configured and the NVIDIA-routed
 * `deepseek-v4-flash` returns 404 on this account (see MODEL_REGISTRY).
 * The interface is registered so the agent layer can know about DeepSeek
 * and pick it the moment a key + verified model exist. Until then, every
 * call throws and the health check reports NOT_CONFIGURED.
 *
 * To enable: (1) set DEEPSEEK_API_KEY in env, (2) implement the
 * fetch/streaming against https://api.deepseek.com, (3) flip
 * healthCheck to a real probe.
 */
export const DeepSeekProvider: ProviderInterface = {
  name: "deepseek",
  async generate(_input: AgentInput): Promise<never> {
    throw new Error(
      "DeepSeekProvider is a stub — no API key configured. " +
        "Set DEEPSEEK_API_KEY and replace lib/ai/agents/providers/deepseek.ts with a real client."
    );
  },
  async healthCheck(): Promise<ProviderHealth> {
    return {
      status: "NOT_CONFIGURED",
      detail: "DeepSeek API key missing (DEEPSEEK_API_KEY not set).",
      lastChecked: new Date().toISOString(),
    };
  },
};
```

**Step 4: Implement `lib/ai/agents/providers/types.ts`**

```ts
import type { AgentResult } from "../types";

/** Minimal provider surface every agent-layer provider must satisfy. */
export type ProviderInterface = {
  readonly name: string;
  generate(input: { prompt: string; context?: unknown; options?: Record<string, unknown> }): Promise<AgentResult>;
  healthCheck(): Promise<ProviderHealth>;
};

export type ProviderHealth = {
  status:
    | "AVAILABLE"
    | "DEGRADED"
    | "RATE_LIMITED"
    | "COOLDOWN"
    | "AUTH_ERROR"
    | "TIMEOUT"
    | "UNAVAILABLE"
    | "NOT_CONFIGURED";
  detail?: string;
  lastChecked?: string;
};
```

**Step 5: Implement `lib/ai/agents/providers/nvidia.ts` (barrel — re-exports the existing real provider)**

```ts
/**
 * NVIDIA provider at the agent layer.
 *
 * The real implementation lives in `lib/ai/nvidia.ts` and is wired into the
 * core `aiRouter`. This file is a barrel that re-exports it under the
 * `ProviderInterface` contract so the agent layer can iterate providers
 * uniformly. We do NOT wrap or duplicate behavior — the core router is the
 * single execution path.
 */
import { NvidiaProvider as CoreNvidia } from "../../nvidia";
import type { ProviderInterface, ProviderHealth } from "./types";
import type { AgentInput, AgentResult } from "../types";

export const NvidiaProvider: ProviderInterface = {
  name: "nvidia",
  async generate(_input: AgentInput): Promise<AgentResult> {
    // Phase 1: agents do not call providers directly — they go through AgentRouter
    // which uses AIService. This stub is here only so the interface map is uniform.
    return { ok: false, agent: "personal_assistant" as const, code: "CONFIGURATION_ERROR", message: "Use AgentRouter.run() — providers are not called directly by agents.", retryable: false };
  },
  async healthCheck(): Promise<ProviderHealth> {
    const h = CoreNvidia.healthCheck ? await CoreNvidia.healthCheck() : { status: "AVAILABLE" as const };
    return { status: h.status, lastChecked: new Date().toISOString() };
  },
};
```

> **Important:** the `CoreNvidia` class does not necessarily export a `healthCheck` method. If
> the implementer finds it does not, simplify `healthCheck` to return `{ status: "AVAILABLE" }`
> directly and drop the import. The agent-layer health check is best-effort and never blocks
> routing — it's telemetry.

**Step 6: Implement `lib/ai/agents/providers/groq.ts`** — same barrel pattern, re-exporting
`GroqProvider` from `../../groq`. If `groq.ts` doesn't expose a `healthCheck`, return
`{ status: "AVAILABLE" }`.

**Step 7: Implement `lib/ai/agents/providers/index.ts`**

```ts
import { DeepSeekProvider } from "./deepseek";
import { NvidiaProvider } from "./nvidia";
import { GroqProvider } from "./groq";
import type { ProviderInterface } from "./types";

export type { ProviderInterface, ProviderHealth } from "./types";

/** Every provider the agent layer knows about. Order = preference. */
export const INTERFACES: Readonly<Record<string, ProviderInterface>> = Object.freeze({
  nvidia: NvidiaProvider,
  deepseek: DeepSeekProvider,
  groq: GroqProvider,
});

export { DeepSeekProvider, NvidiaProvider, GroqProvider };
```

**Step 8: Run — expect pass**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
npx tsc --noEmit
```

**Step 9: Commit**

```bash
cd C:/Desktop/smart-study-assistant
git add lib/ai/agents/providers/ lib/ai/agents/__tests__/deepseek-stub.test.mjs
git commit -m "feat(ai/agents): provider interfaces (NVIDIA/Groq barrels + DeepSeek stub)"
```

---

### Task 8: User-context extractor (best-effort, no I/O)

**Objective:** Define how to build an `AgentContext` from headers (Phase 1) without coupling
to Supabase. Phase 2 will add the real session lookup.

**Files:**
- Create: `lib/ai/agents/context/user-context.ts`
- Create: `lib/ai/agents/__tests__/user-context.test.mjs`

**Step 1: Failing test**

```js
import assert from "node:assert/strict";
import { extractUserContext, type ContextHeaders } from "../context/user-context.ts";

// empty headers → empty context
const empty = extractUserContext({});
assert.deepEqual(empty, {});

// only userId propagated when set
const c1 = extractUserContext({ "x-user-id": "u_42" });
assert.equal(c1.userId, "u_42");
assert.equal(c1.role, undefined);

// all fields, with the language header accepted in canonical case
const c2 = extractUserContext({
  "x-user-id": "u_1",
  "x-user-role": "graduate",
  "x-user-language": "ar",
  "x-user-education-level": "university",
  "x-user-pref-theme": "dark",
});
assert.deepEqual(c2, {
  userId: "u_1",
  role: "graduate",
  language: "ar",
  educationLevel: "university",
  preferences: { theme: "dark" },
});

// malformed values are ignored, not thrown
const c3 = extractUserContext({ "x-user-id": "".padStart(200, "x") });
assert.equal(c3.userId, undefined); // exceeds 128 char cap
console.log("user-context: ok");
```

**Step 2: Run — expect fail**

**Step 3: Implement**

```ts
import type { AgentContext } from "../types";

/**
 * Headers the agent layer reads for context. Phase 1: pure header-based.
 * Phase 2 will replace this with a Supabase session lookup.
 */
export type ContextHeaders = Record<string, string | string[] | undefined>;

const MAX = 128;

function cap(value: string | string[] | undefined, max: number = MAX): string | undefined {
  if (Array.isArray(value)) value = value[0];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? undefined : trimmed; // overflow → drop, don't truncate silently
}

const PREFIX = "x-user-";
const FIELD_MAP: Record<string, keyof AgentContext> = {
  "x-user-id": "userId",
  "x-user-role": "role",
  "x-user-language": "language",
  "x-user-education-level": "educationLevel",
};

const PREF_PREFIX = "x-user-pref-";

/**
 * Best-effort context extraction. NEVER throws. Unknown headers are ignored.
 * Returns `{}` for empty / malformed input — callers must treat every field
 * as optional.
 */
export function extractUserContext(headers: ContextHeaders): AgentContext {
  const out: AgentContext = {};
  for (const [header, key] of Object.entries(FIELD_MAP)) {
    const v = cap(headers[header.toLowerCase()]);
    if (v !== undefined) (out as Record<string, unknown>)[key] = v;
  }
  const preferences: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (!lower.startsWith(PREF_PREFIX)) continue;
    const c = cap(v);
    if (c === undefined) continue;
    preferences[lower.slice(PREF_PREFIX.length)] = c;
  }
  if (Object.keys(preferences).length > 0) out.preferences = preferences;
  return out;
}
```

**Step 4: Pass + commit**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
npx tsc --noEmit
git add lib/ai/agents/context/user-context.ts lib/ai/agents/__tests__/user-context.test.mjs
git commit -m "feat(ai/agents): best-effort user-context extractor (headers only)"
```

---

### Task 9: Study-context assembler (typed shape, no I/O)

**Objective:** Define the shape of study context (lesson, subject, level) without actually
fetching from the DB. The real lookup comes in Phase 2.

**Files:**
- Create: `lib/ai/agents/context/study-context.ts`
- Create: `lib/ai/agents/context/index.ts`
- Create: `lib/ai/agents/__tests__/study-context.test.mjs`

**Step 1: Failing test**

```js
import assert from "node:assert/strict";
import { assembleStudyContext } from "../context/study-context.ts";

// No lessonId → null (caller decides what to do)
assert.equal(assembleStudyContext({}), null);

// With lessonId only → shape present, fields empty (no I/O yet)
const c = assembleStudyContext({ lessonId: "l_1" });
assert.ok(c);
assert.equal(c.lessonId, "l_1");
assert.deepEqual(c, { lessonId: "l_1" });

// With all fields
const c2 = assembleStudyContext({
  lessonId: "l_2",
  subjectHint: "anatomy",
  levelHint: "year-1",
  userPreferences: { language: "ar" },
});
assert.equal(c2.subjectHint, "anatomy");
assert.equal(c2.levelHint, "year-1");
assert.deepEqual(c2.userPreferences, { language: "ar" });

// Reject empty lessonId as if it were undefined
assert.equal(assembleStudyContext({ lessonId: "" }), null);
assert.equal(assembleStudyContext({ lessonId: "   " }), null);
console.log("study-context: ok");
```

**Step 2: Implement `study-context.ts`**

```ts
/**
 * Shape of study context for Study Tutor, Exam Solver, Quiz Generator.
 * Phase 1: builder only — the real DB fetch is Phase 2.
 */
export type StudyContext = {
  lessonId: string;
  subjectHint?: string;
  levelHint?: string;
  userPreferences?: Record<string, string>;
};

export type StudyContextInput = {
  lessonId?: string;
  subjectHint?: string;
  levelHint?: string;
  userPreferences?: Record<string, string>;
};

const MAX = 128;
function cap(v: string | undefined, max = MAX): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > max ? undefined : t;
}

export function assembleStudyContext(input: StudyContextInput): StudyContext | null {
  const lessonId = cap(input.lessonId);
  if (!lessonId) return null;
  const out: StudyContext = { lessonId };
  const subject = cap(input.subjectHint);
  if (subject) out.subjectHint = subject;
  const level = cap(input.levelHint);
  if (level) out.levelHint = level;
  if (input.userPreferences && Object.keys(input.userPreferences).length > 0) {
    out.userPreferences = input.userPreferences;
  }
  return out;
}
```

**Step 3: Implement `context/index.ts`**

```ts
export { extractUserContext, type ContextHeaders } from "./user-context";
export { assembleStudyContext, type StudyContext, type StudyContextInput } from "./study-context";
```

**Step 4: Pass + commit**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
npx tsc --noEmit
git add lib/ai/agents/context/ lib/ai/agents/__tests__/study-context.test.mjs
git commit -m "feat(ai/agents): study-context assembler (no I/O yet)"
```

---

### Task 10: AgentRouter — the public surface of the layer

**Objective:** The single entry point product code calls. Given an `agentId` and `input`, it
resolves the agent, validates capabilities, picks the right provider, runs, and returns a
uniform `AgentResult`. Phase 1: routes to the stub dispatcher. Phase 2: routes to
`AIService` with capability-based model selection.

**Files:**
- Create: `lib/ai/agents/agent-router.ts`
- Create: `lib/ai/agents/__tests__/agent-router.test.mjs`

**Step 1: Failing test**

```js
import assert from "node:assert/strict";
import { AgentRouter, setRouter, getRouter } from "../agent-router.ts";

const r1 = getRouter();
assert.ok(r1 instanceof AgentRouter);

// Singleton by default — second getRouter returns same instance
assert.equal(getRouter(), r1);

// Replace the router for testing
const custom = new AgentRouter({ stubMode: true });
setRouter(custom);
assert.equal(getRouter(), custom);

// In stub mode, run() returns the stub result directly, no provider call
const out = await custom.run("study_tutor", { prompt: "اشرح التشريح" });
assert.equal(out.ok, true);
assert.equal(out.agent, "study_tutor");
assert.equal(out.provider, "stub");

// Unknown agent → ok:false with stable code
const bad = await custom.run("not_a_real_agent", { prompt: "x" });
assert.equal(bad.ok, false);
assert.equal(bad.code, "INVALID_REQUEST");
assert.equal(bad.retryable, false);

// Empty prompt → INVALID_REQUEST (don't waste a call)
const empty = await custom.run("study_tutor", { prompt: "   " });
assert.equal(empty.ok, false);
assert.equal(empty.code, "INVALID_REQUEST");

// All 12 registered agents are runnable in stub mode
const ids = [
  "study_tutor","exam_solver","quiz_generator","research","document_analyzer",
  "writing","language","planner","career","freelance","image","personal_assistant",
];
for (const id of ids) {
  const r = await custom.run(id, { prompt: "hello" });
  assert.equal(r.ok, true, `${id} should run in stub mode`);
  assert.equal(r.agent, id);
}

// Reset to default for other tests
setRouter(r1);
console.log("agent-router: ok");
```

**Step 2: Implement `lib/ai/agents/agent-router.ts`**

```ts
import type { AgentId, AgentInput, AgentResult } from "./types";
import { getAgent, isRegistered } from "./registry";
import { runStub } from "./stubs";

export type RouterMode = "stub" | "live";

export type AgentRouterOptions = {
  /** When "stub", no provider is called — the stub dispatcher is used. */
  mode?: RouterMode;
};

const PROMPT_MAX = 32_000;

function validateInput(input: AgentInput): AgentResult | null {
  if (typeof input?.prompt !== "string" || input.prompt.trim().length < 1) {
    return { ok: false, agent: "personal_assistant" as AgentId, code: "INVALID_REQUEST", message: "Prompt is required.", retryable: false };
  }
  if (input.prompt.length > PROMPT_MAX) {
    return { ok: false, agent: "personal_assistant" as AgentId, code: "INVALID_REQUEST", message: `Prompt exceeds ${PROMPT_MAX} chars.`, retryable: false };
  }
  return null;
}

/**
 * AgentRouter — the single public surface of the agent layer.
 *
 * Phase 1: stub mode only. Live mode (calling AIService) is wired in Phase 2
 * once the capability → model mapping is finalized.
 *
 * Product code is expected to call getRouter().run(agentId, input) and to
 * treat AgentResult as the only return type.
 */
export class AgentRouter {
  private readonly mode: RouterMode;

  constructor(opts: AgentRouterOptions = {}) {
    this.mode = opts.mode ?? "stub";
  }

  async run(agentId: string, input: AgentInput): Promise<AgentResult> {
    if (!isRegistered(agentId)) {
      return { ok: false, agent: "personal_assistant" as AgentId, code: "INVALID_REQUEST", message: `Unknown agent "${agentId}".`, retryable: false };
    }
    const validation = validateInput(input);
    if (validation) return validation;
    // touch the registry so an unknown future id with a stale stub throws here, not silently
    getAgent(agentId);
    if (this.mode === "stub") {
      return runStub(agentId, input);
    }
    // Live mode is intentionally not implemented in Phase 1. A future
    // commit replaces this branch with the AIService call.
    return { ok: false, agent: agentId as AgentId, code: "CONFIGURATION_ERROR", message: "Live mode not implemented in Phase 1.", retryable: false };
  }
}

let current: AgentRouter = new AgentRouter({ mode: "stub" });

export function getRouter(): AgentRouter {
  return current;
}

export function setRouter(next: AgentRouter): void {
  current = next;
}
```

**Step 3: Pass + commit**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
npx tsc --noEmit
git add lib/ai/agents/agent-router.ts lib/ai/agents/__tests__/agent-router.test.mjs
git commit -m "feat(ai/agents): AgentRouter with stub-mode singleton + input validation"
```

---

### Task 11: Public barrel `lib/ai/agents/index.ts` and root `lib/ai/index.ts` re-export

**Objective:** One import path for the whole layer. Do NOT re-export from the legacy
`lib/ai/agents.ts` file — that's a different thing and would shadow this folder.

**Files:**
- Create: `lib/ai/agents/index.ts`

**Step 1: Write the barrel**

```ts
/**
 * Public surface of the agent layer. Product code imports from here only.
 *
 * Re-exports are kept tight on purpose — anything not listed is internal.
 */
export type {
  AgentId,
  AgentCapability,
  AgentDefinition,
  AgentContext,
  AgentInput,
  AgentResult,
} from "./types";
export { AGENT_IDS, AGENT_CAPABILITIES, isAgentId } from "./types";
export { ALL_AGENTS, agentIds, getAgent, isRegistered } from "./registry";
export { AgentRouter, getRouter, setRouter, type RouterMode, type AgentRouterOptions } from "./agent-router";
export { extractUserContext, type ContextHeaders } from "./context/user-context";
export { assembleStudyContext, type StudyContext, type StudyContextInput } from "./context/study-context";
export { INTERFACES, DeepSeekProvider, NvidiaProvider, GroqProvider, type ProviderInterface, type ProviderHealth } from "./providers";
```

**Step 2: Verify it compiles (we don't add a test for a barrel — it would test the re-export syntax, not behavior)**

```bash
cd C:/Desktop/smart-study-assistant
npx tsc --noEmit
```

**Step 3: Commit**

```bash
cd C:/Desktop/smart-study-assistant
git add lib/ai/agents/index.ts
git commit -m "feat(ai/agents): public barrel exports"
```

---

### Task 12: Verify the existing AI core still works (regression gate)

**Objective:** Prove that nothing we added in Tasks 1–11 broke the existing AI foundation.

**Files:** none (read-only verification)

**Step 1: Run all existing AI test scripts**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai
npm run test:ai:router
npm run test:ai:core
npm run test:ai:agents
```

Expected: every script exits 0. The legacy `test:ai:agents` (`scripts/test-ai-agents.mjs`)
must still pass — it tests the legacy `lib/ai/agents.ts` file which we did not touch.

**Step 2: TypeScript gate**

```bash
cd C:/Desktop/smart-study-assistant
npx tsc --noEmit
```

Expected: no output, exit 0.

**Step 3: Foundation test script**

```bash
cd C:/Desktop/smart-study-assistant
npm run test:ai:foundation
```

Expected: all 6 test files pass.

**Step 4: Commit only if any test file was changed during debugging**

```bash
cd C:/Desktop/smart-study-assistant
git status --short
# if anything changed, commit as a fixup
```

If nothing changed, skip the commit.

---

### Task 13: Verify the production build still passes

**Objective:** Build the Next.js project to confirm no client/server boundary broke.

**Files:** none (read-only verification)

**Step 1: Production build**

```bash
cd C:/Desktop/smart-study-assistant
npm run build
```

Expected: `Generating static pages (N/N)` completes, exit 0. Watch for "Functions cannot be
passed directly to Client Components" — it should not appear because we did not add any
component code in this phase.

**Step 2: No commit needed unless the build reveals a code change is required**

If the build fails because of a TypeScript issue in our new files, fix it minimally in
`lib/ai/agents/**`, run the failing test, and commit:

```bash
cd C:/Desktop/smart-study-assistant
git add <fixed files>
git commit -m "fix(ai/agents): <description>"
```

---

### Task 14: Report

**Objective:** Hand a clean report back to the user for review.

**Files:** none

**Step 1: Print the final state**

```bash
cd C:/Desktop/smart-study-assistant
git log --oneline -15
echo "---"
ls -la lib/ai/agents/
echo "---"
npm run test:ai:foundation
echo "---"
npx tsc --noEmit && echo "tsc: clean"
```

**Step 2: Reply to the user with:**

- List of files created (one line each, with a 1-sentence description)
- A confirmation that: (a) the existing AI core was not modified, (b) all existing test scripts
  pass, (c) `tsc --noEmit` is clean, (d) `npm run build` succeeds
- A clear statement that this is **stubs only** — no agent has real behavior yet
- A list of what Phase 2 (the first real agent: Study Tutor) will need to add

**Step 3: NO COMMIT, NO PUSH** (the user explicitly said to wait for review before any further work)

---

## Risks, tradeoffs, open questions

1. **DeepSeek has no key.** The stub means a real DeepSeek integration is a Phase 2 task. The
   decision: ship the interface now (zero cost, future-proof) vs. wait (saves a file). Ship
   now — it's 50 lines and lets the registry name DeepSeek as a future candidate.

2. **Live AgentRouter mode is not implemented.** This is intentional. Phase 2 will wire it
   to `AIService.complete` with capability-based model selection. The current `run()` returns
   `CONFIGURATION_ERROR` if `mode: "live"` is requested, so a misuse is loud.

3. **No Supabase context yet.** `extractUserContext` reads headers only. Phase 2 will add
   `extractUserContextFromSession(supabase, userId)` that pulls role/level from `profiles`.
   Today the bridge is "API route does the lookup and passes headers" — same shape.

4. **`lib/ai/agents.ts` (the file) and `lib/ai/agents/` (the folder) coexist.** TypeScript
   resolves `import ... from "./agents"` to the FILE (older), and
   `import ... from "./agents/registry"` to the FOLDER (newer). Tests that import
   `lib/ai/agents.ts` keep working because we never wrote a folder file named `agents.ts`.
   Verified: the folder contains `types.ts`, `registry.ts`, etc., none of which collides.

5. **No streaming from agents in Phase 1.** The core `lib/ai/streaming.ts` already handles
   SSE for the underlying providers. Phase 2's Study Tutor will decide whether to expose
   a streaming surface; this phase just ensures the result envelope fits both.

6. **The user's brief mentioned `lib/ai/providers/` and `lib/ai/router/` folders.** We did
   not move files into them. The flat `lib/ai/*.ts` layout is the working layout and moving
   5 files for cosmetic reasons risks merge conflicts and runtime surprises. The new
   `lib/ai/agents/providers/` is the **agent-layer** provider surface (interface contract
   only), distinct from the **core** provider modules.

7. **The `lib/ai/agents.ts` legacy 3-agent file is not modified.** The new layer does not
   replace it — it complements it. The legacy file handles 3 specific marketing/research/
   content tasks; the new layer covers 12 agents with a uniform contract. In a later phase
   we can migrate the legacy 3 to stubs that route through AgentRouter; out of scope here.

8. **Capability list (`AGENT_CAPABILITIES`) does not 1:1 match `AiCapability` in
   `lib/ai/health.ts`.** They live in different layers. Phase 2 will add a mapping
   function `agentCapToModelCap(...)`. Not needed in Phase 1 because we never call
   providers from agents yet.

---

## Definition of Done (Phase 1)

- [x] `lib/ai/agents/` folder exists with 10 source files
- [x] `lib/ai/agents/__tests__/` has 6 test files, all passing
- [x] `npm run test:ai:foundation` runs and passes
- [x] `npm run test:ai:core` still passes (no regression)
- [x] `npm run test:ai:agents` still passes (legacy file untouched)
- [x] `npm run test:ai:router` still passes
- [x] `npm run test:ai` still passes
- [x] `npx tsc --noEmit` clean
- [x] `npm run build` succeeds
- [x] No file under `app/`, `components/landing/`, `app/dashboard/`, `lib/auth*`,
      `lib/supabase/*`, or any SQL/migration file was modified
- [x] No commit was pushed
- [x] No API key was added or read
- [x] No real provider call is made by the agent layer
- [x] All 12 agents are registered and runnable in stub mode
- [x] DeepSeek is registered as a stub (NOT_CONFIGURED)
- [x] Report sent to user with file list + verification results
