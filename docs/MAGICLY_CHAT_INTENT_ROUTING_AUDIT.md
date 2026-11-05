# Magicly Chat — Intent Routing & Source Separation Audit

Audit and plan only. No code changes, no SQL, no commit/push/deploy.

## 1. Root cause

The chat path treats any authenticated message as a reason to resolve a workspace source.

In `app/api/unified-ai/route.ts`, the block labeled "Batch 4D.2: Workspace source resolution" always runs when `userId && supabase && !isAnonymous`:

- It calls `buildWorkspaceSourceContext({ supabase, userId, message: prompt })`.
- If resolution is `not_found`, it immediately returns:
  `لم أجد مصدرًا مطابقًا في مساحة عملك. جرّب تحديد الاسم أو الرقم.`
- It refunds the reserved credit and never reaches the model.

Therefore an ordinary question such as "اشرحلي SQL Joins" is converted into a source lookup. If no source matches, the student receives a source-not-found message instead of an answer.

A secondary trigger exists in `app/api/chat/route.ts`:

- It always calls `getStudyToolFacts(...)`.
- `getStudyToolFacts` calls `searchUserFiles(supabase, userId, latestMessage)` when a study config exists.
- `searchUserFiles` runs an ILIKE search over `materials` and injects snippets as `toolFacts`.
- `parseMode` also sets mode to `file` when the message contains words such as `محاضرة`, `ملف`, `pdf`, or `صورة`.

So even the older chat route can inject file snippets into ordinary questions when a config is present.

## 2. Current message flow

### `/api/unified-ai`
1. Authenticate and reserve credit.
2. Build student context and Magicly system prompt.
3. Run workspace source resolution unconditionally.
4. On `not_found`, `ambiguous`, `empty_source`, or `error`, return a canned answer and refund credit.
5. Only on `resolved` or no resolution failure does it call the model.

### `/api/chat`
1. Authenticate, quota, model routing.
2. Build student context and tool facts.
3. `getStudyToolFacts` searches user files when `configId` exists.
4. Injects snippets into the system prompt.
5. Calls the model.

### Resolver behavior
`resolveWorkspaceSource` in `lib/ai/workspace-source-resolver.ts`:

- Detects family from keywords such as `محاضرة`, `ملف`, `pdf`.
- Fetches the user's lectures and materials.
- Filters by title/filename/content.
- Returns `not_found` when no match is found.

This resolver is useful when the student explicitly asks for a source, but it is currently invoked for every message.

## 3. Proposed intent router

Use one chat interface with a server-side intent classifier before retrieval.

### GENERAL_CHAT
Trigger: ordinary questions, greetings, explanations, study help, or follow-up discussion.

Behavior:
- Call the model directly.
- No workspace search.
- No source-not-found message.
- Use conversation history, student memory, and current subject/lesson context when relevant.

### WORKSPACE_SEARCH
Trigger: explicit request to search files, materials, uploaded lectures, or workspace content.

Behavior:
- Resolve only workspace sources.
- Inject the selected source context.
- Cite the source when available.
- If no source is found, explain that and ask for clarification or upload.

### RECORDED_LECTURES_SEARCH
Trigger: explicit request to search recorded lectures, audio transcripts, or a named recording.

Behavior:
- Search recorded lecture transcripts only.
- Do not search normal workspace materials instead.
- Show recording/lecture name and timestamp when available.
- If no result is found, explain without blocking the conversation.

### CLARIFICATION
Trigger: ambiguous source request where the intended source cannot be determined.

Behavior:
- Ask one short clarifying question.
- Do not search both sources automatically.
## 4. Required routing rules

1. Presence of workspace files is not enough to trigger RAG.
2. A study question is not automatically a file search.
3. General questions must be answered even when the workspace is empty.
4. Explicit source requests must target only the requested source.
5. Retrieval failure must not become a chat failure.
6. Retrieval failure must not trigger a duplicate model request or credit charge.
7. Preserve conversation history, memory, subject context, and Magic persona.
8. Keep existing RAG capabilities for explicit requests.
9. Use semantic intent plus clear fallback rules, not only simple keywords.
10. Preserve source context in follow-up questions unless the student changes the request.

## 5. Files likely to change

- `app/api/unified-ai/route.ts`: gate `buildWorkspaceSourceContext` behind an intent check; handle `not_found` as guidance, not a hard answer, when appropriate.
- `app/api/chat/route.ts`: gate `searchUserFiles` behind an intent check; avoid injecting file snippets for ordinary questions.
- `lib/magicly-ai.ts`: add intent classification or a helper that separates mode selection from source search.
- `lib/magic/persona-prompt.ts`: ensure persona rules do not force source lookup.
- `lib/ai/workspace-source-resolver.ts`: reuse as the retrieval engine only after intent routing selects WORKSPACE_SEARCH.
- `lib/ai/workspace-source-context.ts`: keep as bounded context builder for explicit source requests.
- Recorded lecture retrieval: add or reuse a separate resolver for transcripts; do not mix with materials.

## 6. Testing required

Cases to verify:

- "السلام عليكم" -> GENERAL_CHAT
- "اشرحلي SQL Joins" -> GENERAL_CHAT
- "اشرحلي الملف اللي رفعته" -> WORKSPACE_SEARCH
- "هات محاضرة الشبكات من ملفاتي" -> WORKSPACE_SEARCH
- "دور في تسجيل محاضرة الدكتور" -> RECORDED_LECTURES_SEARCH
- "الدكتور قال إيه عن Normalization في التسجيل؟" -> RECORDED_LECTURES_SEARCH
- "اشرحلي الموضوع ده" -> GENERAL_CHAT or context continuation
- "هاتلي المحاضرة" -> CLARIFICATION when source is unclear
- "اشرحلي المحاضرة دي من الملف المرفوع" -> WORKSPACE_SEARCH

Additional tests:

- Empty workspace + general question: Magic answers.
- Empty workspace + explicit file request: explains no source found.
- Files exist + general question: no automatic search.
- Recorded lecture request: does not search workspace materials.
- Follow-up after source retrieval: preserves source and context.
- Retrieval failure: does not block the answer and does not charge or retry.

## 7. Risks

- Intent classification may misclassify Arabic shorthand or mixed-language requests.
- Follow-up questions may lose source context if session state is not preserved.
- Recorded lecture and workspace sources may overlap if naming is ambiguous.
- Changing auto-search behavior may alter existing user expectations.
- Credit/refund flow must remain correct when retrieval is skipped or fails.

## 8. Phased implementation plan

Phase A: Add an intent classifier with tests, without changing routes.
Phase B: Gate workspace resolution in `/api/unified-ai` behind WORKSPACE_SEARCH.
Phase C: Gate `searchUserFiles` in `/api/chat` behind WORKSPACE_SEARCH.
Phase D: Add RECORDED_LECTURES_SEARCH handling and separate transcript retrieval.
Phase E: Add CLARIFICATION handling for ambiguous requests.
Phase F: Preserve source context for follow-up questions.
Phase G: Run full chat and credit tests before deployment.

No implementation should begin until this plan is reviewed.
