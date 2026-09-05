=== 1.2G GENERATION VERIFICATION PIPELINE ===
Before any DB insert (status='extracted'), validate each question:
1. question_text: non-empty; relevant to Mathematics (Secondary)
2. options_json: array of exactly 4 non-empty strings (A/B/C/D format implied)
3. correct_option_index: integer 0-3 (deterministic — verified by agent output; not invented by user)
4. explanation: non-empty string
5. difficulty: 'easy' | 'medium' | 'hard' (controlled)
6. subject: Mathematics (verified DB reference)
7. grade/stage: Secondary / Grade 3 (verified taxonomy — not invented)
8. question_type: 'mcq' (only supported type for this batch)
9. No exact duplicate of existing verified/published question in bank (fingerprint check)
10. Structured output matches requested format (JSON array)

REJECT (do not save to DB as verified):
- Any malformed structure
- Ambiguous/invalid correct_option_index
- Empty/missing options or explanation
- Unrelated subject/content
- Exact duplicate of existing verified/published question

Only questions passing all 10 checks progress to status='extracted' (then admin verifies -> 'verified' -> 'published').
AI-generation is clearly separated from official/verified content in DB (source_type='ai_generated').
