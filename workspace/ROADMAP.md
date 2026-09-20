# Roadmap — Final (post-decisions 2026-09-14)

Status: VERIFIED (assessment file intact: 49205 bytes, no broken JSX/CSS).
All 6 gaps (A-F) closed. Ready for execution order.

---

## EPIC 1 — Profiles (MVP — High impact / Low cost)
- Schema: profiles (persona, student_level, education_stage/grade/track, active)
- Multi-profile logic: max 3/account; 1 Active profile
- Active profile = AI context + DB write source (prevent confusion)
- Personas: student | teacher | graduate | freelancer | parent
- Existing users: default 1 profile (student or persona-based)

## EPIC 2 — File Upload Organization (MVP)
- Endpoint: upload with classification (stage/grade/track/subject)
- Link: profile_id
- Size limits: Free 20MB / Pro 100-200MB / Ultra 1GB
- Storage quota: Ultra 20GB (total)
- Daily uploads: Free 5 / Pro 30 / Ultra 60
- User can: edit file name / replace (versioning) / delete
- Existing uploads: unassigned default OR batch-assign to default profile

## EPIC 3 — Subscription + Limits Framework (MVP)
- Plans: Free / Pro / Ultra
- Message limits (per 2h, user-request only): 20 / 100 / 500
- Trial: 1 month; admin-activated (manual, not automatic)
- DB/config: plan tiers + quota tracking (count + size + storage)

## EPIC 4 — Admin Page Core (MVP partial)
- Roles: Owner (all) / Admin / Support (RBAC with permission keys)
- Sections: Users, Subscriptions (manual activation), AI Models, Audit Log
- Subscriptions via WhatsApp (Vodafone Cash / Fawry / InstaPay) + User Code lookup
- Trial activation/deactivation/revoke controls
- Audit log: actor / action / target / timestamp

---

## EPIC 5 — Queue + Rate Limits + Security (v1)
- Queue table: processing_jobs (priority: Ultra > Pro > Free)
- Rate limits per user/IP (prevent spam/drop)
- Concurrency limits (platform protection under load)
- Priority scheduling for heavy jobs (transcription/video analysis)

## EPIC 6 — Migration + Data Mapping (v1)
- Default profile assignment script (existing users/files)
- Backfill profile_id on existing uploads
- Migration: study_configs → profile-linked records

## EPIC 7 — User Code + QR + Activation Flow (v1)
- User Code format: MAG-XXXX (6-10 chars, non-guessable)
- QR: `app://user/<code>` or web link `/u/<code>`
- WhatsApp activation flow: receipt screenshot → Admin activates

## EPIC 8 — Rewards + Weekly Gifts (v1)
- Rules: activity/streak/achievement-based
- Grants: temporary limit increase / trial week / upload credits
- Winners page (public verification)

## EPIC 9 — Admin Full Scope (v1)
- User management: read/edit/ban/unban/profile selection
- File moderation: delete/reclassify/rename
- Quota override per user (exceptions)
- Admin roles management (add/remove/support)

## EPIC 10 — Ultra Pipeline (v1 — Future)
- Video/audio upload + analysis pipeline (chunked/resumable upload; 1GB/file)
- Transcription → summary → outline → questions
- Ultra priority in queue + faster response
- Higher model access linked to Ultra plan
- Storage quota enforcement (20GB total)
- Real tutor session scheduling (credits system — future)

---

## Gaps Status (A-F)
A. Admin scope: CLOSED (roles + sections defined)
B. Quotas: CLOSED (per-day uploads + per-file size + Ultra storage 20GB)
C. File rules: CLOSED (edit/replace/versioning allowed)
D. Migration: CLOSED (default profile assignment logic defined)
E. Payment: CLOSED (WhatsApp manual, no Stripe in-platform)
F. User identification: CLOSED (User Code + QR MAG-XXXX)

---

## File References
- Assessment UI modifications: app/assessment/page.tsx (current version: 49205 bytes)
- Skills/project skills trusted: .hermes/skills/ (magiclly-* skills for this repo)
