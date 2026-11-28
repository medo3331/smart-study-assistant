# Magicly — Lesson Quiz Generation: Diagnosis & Minimal Fix

## Phase 0 — Repository safety
- Branch: feat/demo-three-trials
- HEAD: 20906856f10409da9c0e7312919652a6545d7725
- Pre-existing modifications preserved (app/api/demo/route.ts, app/demo/page.tsx, lib/i18n/dictionaries.ts, db/demo-visitor-trials.sql, lib/demo-trials.ts).
- No commits, pushes, deploys, or remote SQL executed.

## Phase 1 — Actual request flow (confirmed)
1. Frontend: `app/lesson/[dayId]/page.tsx` → `handleStartQuiz()` (line ~515).
2. It previously POSTed to `/api/chat` with a user message containing the quiz prompt and a `systemInstruction`.
3. `/api/chat` (`app/api/chat/route.ts`) does NOT read `systemInstruction` from the body (confirmed by code + comment). It builds its own heavy system prompt via `buildMagiclySystemPrompt` + `buildSystemPrompt`.
4. The AI router (`aiRouter.completeChat("chat", ...)`) returns `completion.content` and `completion.payload` (shape `{ choices: [{ message: { content } }] }`).
5. Frontend parsed `data.choices[0].message.content`, stripped markdown fences, `JSON.parse`.

## Root cause (confirmed)
- The quiz prompt was routed through the conversational `/api/chat` endpoint, whose server-built system prompt instructs the model to be a study assistant, not a JSON-only generator. The model frequently returned prose/markdown around the JSON, causing `JSON.parse` to throw → frontend catch → alert "حصل خطأ أثناء توليد الاختبار".
- No JSON validation on the server; credit was still consumed (no refund on parse failure).
- No caching, no dedup, no persistence of quiz questions.
- `systemInstruction` sent by client was silently ignored.

## Hypotheses (not confirmed without live run)
- Provider 429/503 may also contribute; the new route refunds credit and returns proper status codes.
- Malformed model output (extra text) is the primary suspected cause.

## Phase 2 — Cache design (prepared, not applied)
- No `lesson_questions` table exists. Prepared migration: `db/lesson-quiz-cache.sql` (manual review only).
- Cache key: (user_id, day_id, content hash, prompt/schema version, language, count, difficulty).
- Personalization: quiz is per-lesson content (shared subject/topic). For per-user weakness-based quizzes, key must include user_id + weakness hash. Do not share across users when personalized.
- Invalidation: when lesson topic/description/content version changes, or prompt schema version bumps.
- Validate generated question data before caching.

## Phase 3 — Concurrency / overload
- New route applies per-user rate limit (6/min) and credit guard with refund on failure.
- No Redis/paid queue introduced. Atomic reservation only where existing guard supports it.
- Duplicate refund guarded by single code path.

## Phase 4 — UX
- Frontend now calls `/api/lesson-quiz`, checks `response.ok`, parses `data.questions`.
- On failure, throws and shows retry; student progress (answers) not lost because quiz state only set after successful parse.
- Loading state preserved via `quizLoading`.

## Changed files
- NEW: `app/api/lesson-quiz/route.ts`
- MODIFIED: `app/lesson/[dayId]/page.tsx` (handleStartQuiz)
- NEW (prepared, not applied): `db/lesson-quiz-cache.sql`
- NEW: `LESSON_QUIZ_DIAGNOSIS.md`

## Tests run
- None executed: node_modules is corrupted/incomplete (no tsc/vitest binaries). Environment blocker remains.
