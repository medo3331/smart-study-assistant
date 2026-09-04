=== 1.2C.5 — QUESTION INGESTION AGENT PIPELINE (reuse-first) ===
NOT a single monolithic agent — stages separated for audit/debugging.
Uses existing: AgentRouter, AI Router (optional — only for parsing/normalization per instruction), web_search, browser_exec, vision_analyze (with fallback note), admin/DB via site_admins, existing auth.

STAGES (each callable independently; idempotent per document):
1. source_discovery({country, stage?, grade?, track?, subject}) -> sources (DB + web + user-provided)
2. document_fetch(source_url) -> document_path / content
3. extract_text(document) -> raw_text (PDF text / image OCR / vision / fallback: manual review)
4. parse_questions(raw_text, source_reference) -> candidate list (question_text, options_json, source_ref, document_id)
5. extract_answers(candidate, source_reference, answer_key_ref) -> correct_option_index + verification_evidence
6. classify_taxonomy(candidate, country, stage, grade, track?, subject) -> unit_id/topic_id (optional; NULL if unverified)
7. validate(candidate) -> status: extracted / verified / draft / rejected + reason
8. deduplicate(candidate, fingerprint) -> skip if duplicate (normalized text + taxonomy + source)
9. import_batch(candidate[] with status='verified') -> DB insert with provenance
10. verify_post_import() -> SELECT counts / duplicates / missing answers / source coverage
11. coverage_report() -> per stage/grade/subject counts (data-driven query)

SECURITY:
- All writes server-side (admin/service_role)
- Anonymous cannot run ingestion
- RLS on diagnostic_question_bank prevents unauthorized insert
- No service_role exposure to client
- Source trace preserved (source_reference + document_id)

NO AI as source of truth. AI only for parsing/normalization if available — not for answer determination.
AI provider: uses existing AI Router (not new provider).

TAXONOMY DATA-DRIVEN (not hard-coded):
- education_stages, education_grades, education_tracks linked to curricula
- country from countries; subject from subjects; curriculum from curricula
- diagnostic_units / diagnostic_topics linked via verified mapping

FAILURE HANDLING:
- PDF image-based (no text layer): use vision/OCR; if fails → document gap; do NOT invent
- Source unreachable: document gap; do not fabricate questions
- Answer ambiguous: status='draft' / rejected; do not guess
- Duplicate: skip with provenance note (not duplicate row)
