# TASKS — مهام المرحلة الجارية (`DEV-01` — صفحة الدرس)

> المرحلة: `DEV-01` · المعرّفات `T1..Tn` خاصة بوثيقة Git/`phases/dev-01-*.md`.
> **⚠️ ملاحظة (2026-11-14 18:15):** `DEV-02` محمي — **EXTERNALLY OWNED · PROTECTED · TEMPORARILY OUT OF SCOPE** (قرار المالك). لا قراءة ولا تحليل ولا لمس لأي ملف امتحانات. لا SQL/Migration بدون موافقة صريحة.
> الحالة: ✅ مقفل · ⏳ مطلوب · ⬜ لم يبدأ · ⚠️ محظور (معطّل في `BLOCKERS.md`)

| ID | المهمة | الحالة | الدليل | قبول |
|---|---|---|---|---|
| **T1** | Phase 1.1 — الشكل: split-screen · إصلاح `lesson` context bug · قرار الشات الواحد | ✅ مقفل | `commit cb504351` (fix shortText) · `commit b05a5bb3` | الصفحة تقرا الـlesson · الشات الوحيد (UnifiedChat) بدون «درس غير محدد» |
| **T2** | Phase 1.2 — مصدر الحقيقة: جدول `lesson_content` + حفظ الشرح + مسارات single chat | ✅ مقفل | `commit 23a7ee00` · `db/46-lesson-content.sql` | الـ`lesson_content` فيه الشرح/المصادر/الكلمات الخاصة بالدرس |
| **T3** | Phase 1.3 — Transcript + Citations المُتحقَّق منها | 🔄 جارية → رفع للمراجعة | `commit b2ed5606` · `lib/lesson/citations.ts` · `components/lesson/LessonCitations.tsx` · `components/lesson/LectureLinkModal.tsx` · `app/api/lesson-content/route.ts` | citations بتشير لـ`lesson_content.transcript.segments` · اقتباس حرفي + تحقق ≥0.6 |
| **T4** | **تنفيذ `db/46` ثم `db/47` على الإنتاج (SQL Editor)** | ⏳ المالك | `db/46-lesson-content.sql` · `db/47-lesson-content-citations.sql` | الاستعلام الإثباتي رجّع `cited_explanation` بناءً على `pg_attribute` |
| **T5** | تشغيل `npm run test:all` (الكامل) | ⏳ | غير مشغَّل — `npm run typecheck` ✅ PASS · `vitest lib/lesson lib/ai/__tests__` ✅ 630/630 PASS | 103 ملفاً يمرّون (أو معطّلات موثّقة معلَّقة) |
| **T6** | تشغيل `npm run build` | ⏳ | غير مشغَّل | build أخضر على `b2ed5606` |
| **T7** | تقرير الإغلاق في `phases/dev-01-lesson-page-phase1.md` | ⏳ | `phases/dev-01-*.md` (موجود كـstub) | يغطي: المتطلبات الأصلية · المنفذ · الملفات · الاختبارات · المخاطر · القيود · التوصية |
| **T8** | اعتماد المالك (Stage G) | ⏳ | — | لا تُغلق المرحلة قبله |
| — | **خارج النطاق** | | | |
| X1 | `script-src` لـYouTube (لا — قرار **D-DEV-006**) | ✅ مقفل | `next.config.ts` | Checkpoints تُبنى على transcript + `&t=` |
| X2 | `match_knowledge` (لا — **D-DEV-005**) | ✅ مقفل | `db/knowledge-base.sql` | RAG يظل مؤجلاً حتى إثبات الجودة |
| X3 | تغيير CSP تاني | ✅ مقفل | — | لا تعديل إلا بموافقة المالك |

---

## تبعيات صارمة

```
T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8
                 ↑                            ↑
             المالك (SQL action)          المالك (اعتماد)
```

## تصريح "نصف مكتمل" — ما يساويش إغلاق
- الكود مكتوب محلياً ≠ ✅ مقفل (بدون T4/T5/T6).
- بناء أخضر ≠ ✅ مقفل (بدون T7/T8).
- صفحة تشتغل مرة ≠ ✅ مقفل (بدون T8).

## كل مرة تُضاف مهمة
- سجل `T` جديدة هنا + حالتها + دليلها.
- لو المهمة خارج `DEV-01` → أضفها لـ`ROADMAP.md` Part 2 كـDEV مستقبلي أو `BLOCKERS.md`.
