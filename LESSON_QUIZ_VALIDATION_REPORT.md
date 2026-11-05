# Magicly — Lesson Quiz Fix: Validation Report

## 1. Environment / safety
- Branch: feat/demo-three-trials, HEAD: 20906856f10409da9c0e7312919652a6545d7725 (unchanged).
- Working tree preserved; no commits, pushes, merges, deploys, or remote SQL.
- Pre-existing modifications left untouched.

## 2. Code review — verified by inspection
### app/api/lesson-quiz/route.ts
- Auth: `requireUser("message")` → 401 on failure (matches convention).
- Rate limit: `checkRateLimit("lesson-quiz:" + user.id, 6, 60_000, "message")` per user.
- Entitlement/model access: `routeCandidates("chat")` + `filterAccessibleModels` + 403 MODEL_ACCESS_REQUIRED (matches agents route).
- Credit: `guardAiAccessAndReserve` before call; `refundAiCreditIfNeeded` on provider error, invalid output. Single refund path per failure branch.
- Usage accounting: `recordAiOperation` only on success (void, fire-and-forget).
- JSON extraction: strips ```json/``` fences, then falls back to first `[` ... last `]`. Ambiguous/multi-array content fails JSON.parse → null → refund + 502. Does not silently accept.
- Validation: every question needs nonempty string question, exactly 4 nonempty string options, integer correctIndex in [0,3]. Empty array rejected.
- Provider errors: 429→429, 503→503, else 502, with credit refund.
- Malformed body: 400. Missing topic: 400.

### app/lesson/[dayId]/page.tsx (handleStartQuiz)
- Calls /api/lesson-quiz with topic/subject/description/count.
- On !response.ok throws; catch sets quiz empty + alert. Progress/answers not touched (quiz state only set after valid parse).
- `setQuizLoading` toggled in finally.

### db/lesson-quiz-cache.sql
- Prepared only; not applied. RLS per-user. Not wired into route.

## 3. Automated tests
- NOT RUN. node_modules was corrupted (no .bin, no typescript/vitest). Attempted `npm ci --offline`; timed out / produced no output (likely no network and incomplete cache). Per instructions, stopped rather than claiming success.
- node_modules renamed to node_modules.bak to allow retry; original corrupted state retained.

## 4. Remaining risks / defects
- No tests executed; typecheck/lint not run.
- Cache not active; concurrency dedup not implemented (per-user rate limit is the only guard). Under load, duplicate generation + duplicate credit consumption possible for same lesson.
- `recordAiOperation` is fire-and-forget (void); DB failure there won't surface to user but is acceptable.
- `count` validated to 1–10 but UI always sends 4.

## 5. Cache decision
- Current fix is architecturally sound and addresses the primary failure (prose/Markdown breaking JSON.parse).
- Caching recommended only after verification + load evidence. If pursued: wire lesson_quiz_cache with content-hash + prompt_version invalidation, per-user ownership, atomic upsert for concurrent dedup, and never share personalized quizzes across users.

## 6. Readiness
- NOT ready for Preview deployment until typecheck, lint, and tests pass. Dependency installation is the blocker.
