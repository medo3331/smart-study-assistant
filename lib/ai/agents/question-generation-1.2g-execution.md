=== 1.2G — GENERATION EXECUTION DESIGN ===
Agent: quiz_generator (AgentId)
Router: AgentRouter / AI Router (existing — reuse, not direct provider)
Provider: configured provider (not new)
Batch size: 20 questions (5 batches for 100; resumable; idempotent; retryable for rate limits)
Status flow per batch: in_progress -> extracted (after generation) -> verified (after validation) -> published (after admin approval)
Not auto-published. Not official. Not mock.

VERIFICATION (before DB insert of any AI-generated batch):
- question_text: non-empty
- 4 options present and non-empty
- correct_option_index: integer 0-3 (verified by structured agent output; not user-guessed)
- explanation: non-empty
- difficulty: easy/medium/hard (controlled)
- subject: Mathematics (verified taxonomy reference — 6d91c3bb... or whatever DB returns for Math)
- grade/stage: verified taxonomy reference (1.2F)
- No exact duplicate fingerprint match with verified/published questions
- Batch tracked: batch_id, source_type='ai_generated', source_name='agent_quiz_generator_1.2g', source_reference='agent_batch_...'

If agent/router/network unavailable: generation blocked (documented honestly) — same as DB execution gate.
Not fabricated. Not hidden.
