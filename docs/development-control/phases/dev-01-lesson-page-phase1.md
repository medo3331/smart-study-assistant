# DEV-01 — صفحة الدرس (`/lesson/[dayId]`)

| | |
|---|---|
| **DEV** | DEV-01 |
| **الحالة** | 🔄 Stage F — جاهز للمراجعة والاعتماد |
| **الفرع / HEAD** | `feat/lesson-content` / `b2ed5606` |
| **آخر تدقيق** | 2026-11-13 (`LESSON_PAGE_PHASE1_AUDIT.md`) |

## 1. المتطلبات الأصلية
- صفحة الدرس تقاعد: مصدر حقيقة واحد · شات واحد · citations مُتحقَّق منها على الشرح
- كل حاجة تتبنى `lesson_content` (set/learn/save) بدل توليد لحظي متضاعف
- نقل نمط الـcitations من المحاضرات (التحقق الجزئي) بدل اختراع نظام جديد

## 2. الـAudit (الأدلة الكاملة)
الملف المرجعي: `LESSON_PAGE_PHASE1_AUDIT.md` (2026-11-13 — في مكانه، لم يُنقل)
**أهم النتائج:** الفيديو/CSP · bug الشات (lesson object vs string) · مفيش شرح مخزّن · مفيش transcript للدرس · لا RAG · نظام citations في المحاضرات **شغّال وموجود**.

## 3. المهام
| ID | الاسم | الحالة |
|---|---|---|
| T1 | الشكل + إصلاح bug | ✅ مقفل |
| T2 | مصدر الحقيقة | ✅ مقفل |
| T3 | Transcript + Citations | ✅ مقفل (كود) — **بانتظار الإنتاج** |
| T4 | تنفيذ db/46 + db/47 | ⏳ مالك |
| T5 | test:all | ⏳ |
| T6 | build | ⏳ |
| T7 | تقرير الإغلاق | ⏳ |
| T8 | اعتماد المالك | ⏳ |

## 4. التنفيذ الفعلي
| Step | commit | الملفات الرئيسية |
|---|---|---|
| CSP hotfix | `db584902` | `next.config.ts` |
| 1.1 + Bugs fix | `cb504351` | `lib/magicly-ai.ts` · `components/unified-ai/UnifiedChat.tsx` |
| 1.2 | `23a7ee00` · `b05a5bb3` | `app/lesson/[dayId]/page.tsx` · `db/46` · `lesson_content` · single chat |
| 1.3 | `b2ed5606` | `lib/lesson/citations.ts` · `components/lesson/LessonCitations.tsx` · `components/lesson/LectureLinkModal.tsx` · `lib/lesson/__tests__/citations.test.ts` · `db/47` |

## 5. التحقق (جدول Stage E)
| الفحص | الحالة | النتيجة |
|---|---|---|
| `npm run typecheck` | ✅ PASS | موجود فعلاً (2026-11-14 17:22) |
| `npx vitest run lib/lesson lib/ai/__tests__` | ✅ PASS | **630/630 · 43 ملف** (citations: 9/9) |
| `npm run test:all` | ⬜ NOT RUN | الفرع كامل لم يُشغّل |
| `npm run build` | ⬜ NOT RUN | الفرع كامل لم يُشغّل |
| تنفيذ `db/46` (الإنتاج) | ⬜ NOT RUN | SQL Editor مطلوب من المالك |
| تنفيذ `db/47` (الإنتاج) | ⬜ NOT RUN | بعد `db/46` |
| RLS / Authorization على `lesson_content` | ⬜ NOT RUN | يفترض: `owner-only read` + write عبر RPC/service-role |
| Regression (صفحة المحاضرات) | ⬜ NOT RUN | نتيجة غير معروفة |

## 6. القيود والمخاطر
1. **التلازم غير مكتمل** حتى يُشغّل `db/46` و`db/47` ويُتحقق منهما — آخر خطوة بالProduction تتوثق فقط بعد الـSQL Editor.
2. **Checkpoints التلقائية غير مبنية** (قرار **D-DEV-006** — لا `script-src`) — نقاط الفحص = قائمة transcript + رابط `&t=` فقط.
3. **لا RAG** في نطاق DEV-01 (**D-DEV-005**).
4. **استهلاك الرصيد غير موثّق** من قبل ما الـsource-of-truth يعمل — بعد التخزين، التوليد مرة واحدة وقابلة لإعادة الاستخدام.

## 7. التوصية
- **DEV-01 تقفل** عند اعتماد المالك بعد تنفيذ الـSQL والتحقق.
- قبل فتح DEV-02: التأكد من `T4 → T8`.
