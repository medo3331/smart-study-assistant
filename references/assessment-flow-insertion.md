---
name: assessment-flow-insertion-pattern
description: "Session-specific reference (2026-09-04 UX Phase) — inserting education/role context into existing Assessment page, DB taxonomy reads, profile-save extension, build/TS verified. Not a skill edit (agent-system-audit protected)."
---

# Assessment-Page Flow Insertion (UX Phase — 2026-09-04)

Trigger: flow must live in Assessment (not /onboarding); DB taxonomy exists; profile fields (education_stage/grade/track) added by prior migration; must reuse auth/save/scoring.

Rules captured: audit real page first; don't break identity/subject/quiz/building/result; load taxonomy live (`education_stages`→`grades`→`tracks`); show stage/grade/track only for student; track only when stage.code === "BACCALAUREATE"; extend `saveEverything` (not replace); server-validate relationships; build/TS verified; preview file rebuilt; report unverified (live DB insert needs applied migration); do NOT stop for approval when user forbids gate.

Verification sequence: `pwd` confirm repo; read page; check DB fields (auth-phase1 + onboarding-migration + taxonomy-seed); insert state/effects/UI; extend save; `npm run build` + `npx tsc --noEmit`; report changed+untouched+unverified.

Session result: `app/assessment/page.tsx` +103/-5; migration SQL exists; onboarding untouched; assessment scoring untouched; preview rebuilt; build/TS PASS.

Pitfalls: working-dir may differ from user's intended repo (`smart-study-assistant` vs `magicly`); report explicitly; consolidate when memory near full; direct execution when gate removed; never claim PASS from code alone for DB save (verify with SQL / auth session).
