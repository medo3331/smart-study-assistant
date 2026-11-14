# STATUS — الحالة الموثّقة للمشروع

> **مولّد من git.** أي رقم هنا لازم يكون مربوط بـ `(branch, HEAD, timestamp)`.
> آخر تحديث: **2026-11-14 17:25 (توقيت القاهرة)**

| | |
|---|---|
| **الفرع النشط** | `feat/lesson-content` |
| **HEAD** | `b2ed5606` — `feat(lesson): link lessons to lectures + transcript-grounded cited explanations` |
| **التقدّم على `origin/main`** | 8 commits (`origin/main` = `137ec041`) |
| **Working tree** | `M .worktrees/ui-quick-wins` (قديم) · `M app/api/exam-sessions/**` (3 ملفات) · `M lib/ai/exam-review.ts` · `M lib/ai/__tests__/exam-review.test.ts` · `?? app/api/exam-sessions/[id]/answers/` · `?? db/48-exam-generator.sql` · `?? EXAMS_PHASE1_AUDIT.md` · `?? EXAMS_PHASE2_PROPOSAL.md` · `?? docs/development-control/` |
| **المرحلة النشطة** | `DEV-01` — صفحة الدرس (`ACTIVE_PHASE.md`) |
| **⚠️ جلسة موازية** | كود `DEV-02` (Exams) **جاري التنفيذ في نفس الفرع** — +901 سطر معدّل + `db/48` + مجلد `answers/` |

---

## 1. نتائج التحقق الفعلية (مش كلام)

كل نتيجة هنا **اتشغّلت فعلاً** في الجلسة دي. أي حاجة مش متشغّلة مكتوبة `NOT RUN`.

> ⚠️ **ملاحظة مهمة (2026-11-14 17:55):** نتائج التحقق التاليّة اتعملت **قبل** ما جلسة موازية تعدّل ملفات `exam-sessions` و `exam-review.ts` (تعديلات الساعة 17:38–17:52). الـ**typecheck** و**630/630** كانا صحيحين **قبل التعديل** — ولا يجوز استخدامهما كدليل على حالة الفرع الحالية. لازم إعادة تشغيل بعد إغلاق DEV-02 أو التأكد من الحالة وقت الاعتماد.

| # | الفحص | الأمر | الحالة | النتيجة |
|---|---|---|---|---|
| 1 | TypeScript | `npm run typecheck` | ✅ **PASS** (قبل تعديلات الامتحانات) | مفيش output وقت التشغيل — يفضل إعادة التأكد بعد التعديلات الحالية |
| 2 | اختبارات AI + الدرس | `npx vitest run lib/lesson lib/ai/__tests__` | ✅ **PASS** (قبل تعديلات الامتحانات — 17:22) | **43 ملف · 630 اختبار · كلها passed** (منهم `lib/lesson/__tests__/citations.test.ts` = 9) · **stale بعد 17:38** |
| 3 | الاختبارات الكاملة | `npm run test:all` | ⬜ **NOT RUN** | النطاق الجزئي مرّ؛ الباقي (16 ملف في `tests/` + 56 ملف في `lib/**/__tests__` خارج النطاق) لم يُشغّل |
| 4 | Build | `npm run build` | ⬜ **NOT RUN** | لم يُشغّل (لأسباب زمنية + خطر تعارض مع session شغّال) |
| 5 | ESLint | — | ⚠️ **N/A** | **مفيش `lint` script في `package.json`** رغم وجود `eslint.config.mjs` — فجوة في بوابة التحقق (انظر `BLOCKERS.md` B-13) |
| 6 | SQL / Production | — | ⬜ **NOT RUN** | `db/46` و `db/47` **غير منفَّذين على الإنتاج** (يتطلبان SQL Editor يدوي) |
| 7 | RLS / Authorization | — | ⬜ **NOT RUN** | مفيش وصول للقاعدة من هذه الجلسة |
| 8 | Smoke test | `npm run test:smoke` | ⬜ **NOT RUN** | لم يُشغّل |

### 3 اختبارات متخطّاة موثّقة (لا تُحسب نجاح)
`docs/TECH_DEBT.md` يسجّل 3 اختبارات `it.skip` بـ TODO:
`TD-001` (NotificationBell auth) · `TD-002` (بوابة صلاحية `announcements.manage` — **أولوية عالية**) · `TD-003`.
⇒ أي تقرير "كل الاختبارات مرّت" لازم يقول: **"X passed / 3 skipped (documented debt)"**.

---

## 2. حالة الـAREAs (مختصر — التفصيل في `ROADMAP.md` Part 1)

| AREA | النطاق | الحالة | الفجوة الحقيقية |
|---|---|---|---|
| AREA-01 | Worship & Quran | 🟢 مبني | **لا يوجد toggle** — العبادة دايماً ظاهرة |
| AREA-02 | Dashboard | 🟢 مبني | الصورة localStorage فقط · المهام اليومية قواعد ثابتة مش مرتبطة بالتقدم |
| AREA-03 | Magic Personas | 🟡 جزئي | 3 personas + هوية واحدة + 12 agent · **لا registry لـ4 personas** |
| AREA-04 | Learning Engine | 🟡 جزئي | **`retest` غير موجود** · الذاكرة ما بتوصلش للشات |
| AREA-05 | AI Infrastructure | 🟢 مبني | RAG schema-only · OpenRouter رصيد 0 · fallback `MAX_ATTEMPTS=3` |
| AREA-06 | Subscription & Credits | 🟢 مبني | اسم "Magic Credits" غير موجود في الكود · `CURRENCY_META` قديم · تعارض trial 7/30 |
| AREA-07 | Gamification | ✅ مكتمل | anti-cheat server-authoritative قوي |
| AREA-08 | Store | 🟢 مبني كـ`/shop` | `/store` stub · مفيش صفحة تاريخ مشتريات |
| AREA-09 | Community | 🔴 جزئي | **posts/comments/reactions/moderation غايبين تماماً** · `community_questions` غير معرّف + components ميتة |
| AREA-10 | Admin Control Center | ✅ مكتمل | — |

---

## 3. حالات معروفة في الإنتاج (UNKNOWN — لا تُفترض)

| # | الـUNKNOWN | ليه مهم |
|---|---|---|
| U1 | `db/46-lesson-content.sql` و `db/47-lesson-content-citations.sql` منفَّذين على الإنتاج؟ | **DEV-01 مش متحقَّق منه** بدون ده |
| U2 | `db/41-ai-operations-insert-policy.sql` منفَّذ؟ | `ai_operations` ممكن يكون ميت (0 صفوف) |
| U3 | `ai_operations` فيها `latency_ms` / `fallback_attempts`؟ | مفيش migration لهم في `db/` |
| U4 | أي تعريف من الـ5 المتنافسة لـ`reserve_ai_credit` هو الحيّ؟ | كلهم `create or replace function` |
| U5 | `ai_operations` / `ai_usage_events` / `ai_credit_ledger` عدد صفوفهم الحالي؟ | يعتمد عليه قرار `DEV-05` |
| U6 | `community_questions` / `community_answers` موجودة في القاعدة؟ | مفيش `CREATE TABLE` في `db/` |
| U7 | `study_configs` / `study_days` / `profiles` معرّفين في أي migration؟ | أقدم من مجموعة الـmigrations |

> القاعدة `D-REAL-008`: **كل ما لم يُتحقق = UNKNOWN.** مش "على الأرجح".

---

## 4. 🔒 DEV-02 — EXTERNALLY OWNED · PROTECTED · OUT OF SCOPE (قرار المالك 2026-11-14 18:15)

**قرار المالك:** حماية `DEV-02` (الامتحانات) بالكامل — التعديل يجري في جلسة وموديل آخر:
- ممنوع لمس/قراءة/تحليل/مراجعة/تعديل/حذف/نقل أي ملف متعلق بـِ Exams.
- ممنوع `git stash` / `git reset` / `git checkout` أو أي إجراء يمسّ شغله.
- لا commit ولا دمج — كود DEV-02 **غير مكتمل ولا معتمد**.
- **DEV-01 تظل المرحلة النشطة** — لكن **لا SQL / Migration دون موافقة صريحة**.
- لا Commit / Push / Merge / Deploy ولا أعمال تنظيف أو نقل ملفات.

**توثيق المسار:** `DECISIONS.md` D-DEV-023 · `BLOCKERS.md` B-12 · `ACTIVE_PHASE.md` §4 · `phases/dev-02-exams-phase1.md` · `CHANGELOG.md` (2026-11-14 18:15).

**ملاحظة تحقق:** نتائج الفحص في §1 من هذا الملف (typecheck / 630 اختبار) نفّذت **قبل بدء شغل DEV-02** ولا تُعد دليلًا على حالة الفرع الحالية — لازم إعادة تشغيل بعد انتهاء الجلسة الموازية واعتماد المالك لمقدار التعديلات.

---

## 5. حالة المستودع (بدون قرار حذف)

| البند | العدد | ملاحظة |
|---|---|---|
| فروع محلية | ~190 | معظمها `cline/######` بأسماء عشوائية |
| فروع remote | ~110 | |
| Worktrees مسجّلة | 64 | 2 منها `prunable` |
| ملفات `.md` في جذر المستودع | 158 | 136 منها تقارير قديمة (أبريل–سبتمبر 2026) |
| Gitlink `.worktrees/ui-quick-wins` | 1 | متسجّل كـsubmodule وبفيه 21 ملف معدّل ⇒ ي-pollute `git status` |

⇒ **لا قرار حذف.** مراجعة مستقلة مطلوبة (`BLOCKERS.md` B-04).

---

## 6. كيف تتحقق من حداثة هذا الملف

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
git status --porcelain
```
لو اختلف أي واحد ⇒ الملف **قديم** ⇒ حدّثه قبل ما تاخد قرار.
