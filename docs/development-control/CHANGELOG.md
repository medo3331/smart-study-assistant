# CHANGELOG — سجل التغييرات الموثّقة

> **قاعدة:** كل بند هنا مربوط بـ commit على فرع معيّن. مفيش "اتعمل" من غير commit — أو اتعمل-log يدوي في BLOCKERS/DEV.
> الفرع: `feat/lesson-content` — 8 commits ahead of `origin/main` (`137ec041`).

---

## 2026-11-14 18:15 — قرار المالك: DEV-02 EXTERNALLY OWNED · PROTECTED · OUT OF SCOPE
قرر المالك حماية `DEV-02` (الامتحانات) بالكامل — التعديل يجري بجلسة/موديل آخر. ممنوع لمس/قراءة/تحليل/مراجعة/تعديل/حذف/نقل أي ملف امتحانات · ممنوع stash/reset/checkout · لا commit/merge · `DEV-01` تظل النشطة لكن دون SQL/Migration دون موافقة صريحة. مسجل في `DECISIONS.md` D-DEV-023 · `BLOCKERS.md` B-12 · `ACTIVE_PHASE.md` · `phases/dev-02-exams-phase1.md`.

## 2026-11-14 17:55 — كود DEV-02 بدأ يتنفذ في نفس الفرع (غير معتمد)
**Session موازية** بدأت تنفيذ `DEV-02` (الامتحانات) بينما `DEV-01` مفتوحة — التعديلات في ملفات `exam-sessions` ومجلّد `answers/` وmigration جديدة — **كله untracked/معدّل · لا commit · لم يُنفّذ على الإنتاج.**

## 2026-11-14 — تهيئة نظام التحكم في التطوير
أُنشئ `docs/development-control/` (README · STATUS · ROADMAP · DECISIONS · ACTIVE_PHASE · TASKS · BLOCKERS · CHANGELOG · phases/): يفصل `AREA` عن `DEV`، يحدد `DEV-01` كمرحلة نشطة، يسجّل قرارات المالك الـ11 (D-DEV-001..011) + قرارات موروثة + قرارات تحقّق تقنية.

## 2026-11-14 — `b2ed5606` — feat(lesson): link lessons to lectures + transcript-grounded cited explanations
**DEV-01 · Step 1.3**

**الملفات (من `git diff --stat`):**
`app/api/lesson-content/route.ts` (±516) · `app/lesson/[dayId]/page.tsx` (466) · `app/dashboard/workspace/page.tsx` (112) · `components/lesson/{LectureLinkModal.tsx, LessonCitations.tsx}` (196/273) · `db/46-lesson-content.sql` · `db/47-lesson-content-citations.sql` (35) · `lib/lesson/citations.ts` (272) · `lib/lesson/__tests__/citations.test.ts` (150) · `lib/magic/__tests__/memory.test.ts` (18) · `lib/magicly-ai.ts` (42) · `next.config.ts` (9)

**التحقق (اتشغّل فعلاً):**
`npm run typecheck` ✅ PASS · `npx vitest run lib/lesson lib/ai/__tests__` ✅ **630/630** (منهم citations 9/9)

**القيود/المخاطر:** `db/46` و `db/47` **غير منفَّذين على الإنتاج** (SQL Editor يدوي مطلوب) · Checkpoints التلقائية **غير مبنية** (D-DEV-006 — transcript `&t=` فقط)

## 2026-11-14 — `b05a5bb3` — feat(lesson): source of truth + single chat + bug fixes
**DEV-01 · Step 1.2** — `lesson_content` كـsource of truth + شات واحد (UnifiedChat lesson-scoped) + إصلاح bug الـ`shortText(lesson)`.

## 2026-11-14 — `23a7ee00` / `cb504351` — feat(lesson): single chat + lesson_content
**DEV-01 · Step 1.2 (start)** + **إصلاح bug «درس غير محدد»**: `UnifiedChat` يبعت `lesson` كـobject بينما `shortText()` بيقبل strings ⇒ كان بيسقط على fallback. `cb504351` يقرأ الـlesson object بدل الـfallback.

## 2026-11-13 — `5f967a10` — docs(audit): Phase 1 audit + proposal for the lesson page
تدقيق صفحة الدرس (`LESSON_PAGE_PHASE1_AUDIT.md`): الفيديو/CSP · bug الشات · مفيش storage للشرح · مفيش transcript · لا RAG · خطة 1.1/1.2/1.3.

## 2026-11-13 — `db584902` — fix(csp): allow YouTube embeds + ytimg thumbnails
**Hotfix DEV-01 (قبل التطوير):** `frame-src` + `img-src` لدعم يوتيوب. بناءً على دليل من CSP header + grep (مش تخمين). حرق صريح لـYouTube بس.

## 2026-11-13 — `27b73475` — feat(retention): motivational nudges + how-to-win guide + mission hints
## 2026-11-13 — `ab693c68` — feat(retention): phase 2 missions card, streak tiers, cron push
## 2026-11-11 — `5b130831` — fix(retention): P0 streak server-side, timezone unification, leaderboard fix
## 2026-11-11 — `9fbc157c` — Merge pull request #101 from medo3331/feat/ui-polish-citations

---

## القواعد
- أي مغلق (DONE) في DEV لازمCommit مرتبط.
- لو الشغل مش متحرَّط → ما ينفعش يتحط هنا ك"تم" — اتحط في `TASKS.md` بـ⏳.
- أضف التاريخ بالصيغة `YYYY-MM-DD — <sha7> — <subject>`.
