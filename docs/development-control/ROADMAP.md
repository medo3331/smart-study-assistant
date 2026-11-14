# ROADMAP — خريطة التغطية (AREA) + مراحل التطوير (DEV)

> **Part 1 = نطاقات منتج (تغطية).** **Part 2 = وحدات شغل قابلة للإغلاق.**
> الحالات الحقيقية من التدقيق (2026-11-14) — **موثّقة بالأدلة path:line**.

---

# Part 1 — خريطة التغطية المنتجية (AREA-01..10)

| AREA | النطاق | الحالة | الدليل (أهم ما وجد) | الفجوة الحقيقية |
|---|---|---|---|---|
| **AREA-01** | Worship & Quran | 🟢 مبني | `app/worship/*` (5 صفحات: adhkar / prayer-times / quran / settings / main) · `components/worship/` ×16 · `lib/islamic/*` · `db/worship.sql` (`worship_progress` + `award_coins` worship sources) · Quran API: `lib/islamic/quran.ts` → alquran.cloud | **لا يوجد أي toggle/flag** — العبادة **دايماً ظاهره** (`nav-config.ts` · `nav-icons.ts` · `app/dashboard/page.tsx:1945`). **الخصوصية بالتصميم:** صفر استنتاج لديانة الطالب، والعلم لن يظهر للآخرين (**D-DEV-003**) |
| **AREA-02** | Student Dashboard | 🟢 مبني | `app/dashboard/page.tsx` (~2100 سطر) · 40 كومبوننت · `components/{HeroCard,TodayMissionsCard,EconomyVisibility,SubscriptionQuotaCard}.tsx` · `app/dashboard/balance/page.tsx` · `/api/me/plan-quota` · `db/gamification.sql` (`daily_missions`) | (1) **صورة الطالب = localStorage فقط** — مصدر الحقيقة الصحيح `profiles.avatar_url` موجود لكنه غير موصول بالداشبورد (**D-DEV-004**) · (2) **المهام اليومية = قواعد ثابتة** (study/goal/riddle/game) — **مش مرتبطة بالتقدم التعليمي الفعلي** (قرار **D-DEV-014**) |
| **AREA-03** | Magic Personas | 🟡 جزئي | `lib/user-persona.ts` (3 personas: student/grad/freelancer) · `lib/magic/persona-prompt.ts` (هوية Magic) · `lib/ai/agents/registry.ts` (12 agent، **كلهم `status: "stub"`**رغم وجود الملفات) · `components/{StudyTutorWidget,AIStudyCoach,PersonalAssistant}` — 4 أسطح بلا registry | **لا يوجد 4-persona registry** (guide/tutor/personal/coach) · حدود الأدوار غير موثّقة في مكان واحد · `components/MagicAssistantChat.tsx` = **dead code** · Personas الحالية = 3 (**D-DEV-016**) → التوحيد بدل التكرار |
| **AREA-04** | Learning Engine | 🟡 جزئي | **Upload:** `/api/upload` · `components/workspace/*` · **Analyze:** `lib/extract-text.ts` · **Diagnose:** `lib/diagnostic-mastery.ts` + `diagnostic_sessions` · **Plan:** `lib/exam-plan-replanner.ts` · **Study:** `/lesson/[dayId]` + `lib/lesson/citations.ts` | **"Retest" غير موجودة** — مفيش إعادة اختبار لنقاط الضعف (`lesson_quiz_cache` موجودة بس الـroute لا يقرأها) · **ذاكرة التعلم لا تصل للشات** (`docs/Sprint2b2-P1-Architecture-Report.md:161`) — `user_weaknesses` يُقرأ في `getDetailedAIContext` فقط لا `getStudentContext` (**D-DEV-015**) |
| **AREA-05** | AI Infrastructure | 🟢 مبني | `lib/ai/routing.ts` (`TASK_MODEL_PREFERENCE` · `AI_PROVIDERS`) · `lib/ai/{health,errors,provider-retry,queue,streaming-fallback,media-router,model-access,ai-credit-guard,rate-limit,service-registry}.ts` · `MODEL_REGISTRY` (16 موديل) · `MAX_ATTEMPTS=3` | **RAG = schema فقط** — `match_knowledge` غير متنادى (**D-DEV-005**) · **OpenRouter رصيده 0** (**D-DEV-007**) · Gemini مستبعد من fallback (مفتاح باطل — `docs/TECH_DEBT.md` N-016) |
| **AREA-06** | Subscription & Credits | 🟢 مبني | `db/epic2-admin-rbac-audit-schema.sql` (`subscription_plans` + owner/trial seed) · `db/30-credit-grants.sql` (FEFO) · `db/31-credit-rpcs.sql` · `db/economy-phase-{d,e,f,g,bc-rate-limits,h-rate-limit,h2-window-limits}.sql` (reserve/confirm/refund) · `has_entitlement()` | **التسمية "Magic Credits" غير موجودة** — 3 عملات الفعلية: XP/Coins/AI Credits و`CURRENCY_META` **قديم** (**D-DEV-001**) · **تعارض trial 7/30** (**D-DEV-002**) · **ليس هناك TS واحد مصدر** لـ`has_entitlement` (~12 call site) |
| **AREA-07** | Gamification | ✅ مكتمل | `db/shop.sql` (coin_source_rules + daily_cap + is_live) · `db/43/44/45-retention-*.sql` (streak server-authoritative + `protect_profiles_streak`) · `db/gamification.sql` (missions) · `db/45-retention-phase-3-achievements.sql` · `lib/shop/economy.ts` (XP/level/league) | — |
| **AREA-08** | Magicly Store | 🟢 مبني كـ`/shop` | `app/shop/page.tsx` (24KB) · `db/shop.sql` (catalog/products/boxes/wheel/inventory/equipped/refunds) · `lib/shop/catalog.ts` (themes/avatars/frames/titles/companions) · `app/inventory/page.tsx` | **`/store` = stub** (17 سطر "قيد الإعداد") (**D-DEV-008**) · **لا توجد صفحة تاريخ مشتريات** (التاريخ = سطور inventory + `/rewards`) |
| **AREA-09** | Community | 🔴 جزئي | `app/community/page.tsx` (leaderboard + مسابقة أسبوعية: `community_quiz_scores`) · `app/university/*` (Hub كامل: curriculum/GPA/spaced-repetition/library) · `db/community.sql` | **posts/comments/reactions/moderation غائبة تماماً** — مفيش `posts`/`comments`/`reactions` ولا جدولهم · **لا moderation** (report/flag/block) · `community_questions`/`community_answers` **غير معرّفة** في `db/` + الكومponentات **dead code** · **الهوية العامة للطالب** لازم تكون اختيائية (**D-DEV-017**) · Study Rooms مؤجلة |
| **AREA-10** | Admin Control Center | ✅ مكتمل | `app/admin/*` (25 صفحة) · `app/admin/actions/*` (24 server action) · RBAC: `lib/auth-roles.ts` (16 صلاحية) · `lib/policy.ts` · `proxy.ts:93` · AI monitoring: `ai_usage_events` · `/admin/ai-usage` · `app/admin/users/analytics` · audit | — |

---

# Part 2 — مراحل التطوير (DEV-01..NN)

## الحالة الحالية
| DEV | المرحلة | الحالة |
|---|---|---|
| **DEV-01** | صفحة الدرس — مصدر حقيقة + Citations مُتحقَّق منها | 🔄 جارية — **Stage F** (بانتظار اعتماد المالك) |
| **DEV-02** | الاختبارات (Exams) — تمديد المحرّك الموجود بواجهة + إجابات الطالب | 🔒 **EXTERNALLY OWNED — PROTECTED — OUT OF SCOPE** (قرار المالك 2026-11-14 18:15) |

## الفهرس المرجعي (بالترتيب المقترح)
| DEV | الاسم | يدمج AREA | الاعتماد |
|---|---|---|---|
| **DEV-01** | صفحة الدرس (Phase 1.1–1.3) | AREA-04 | **جارية** |
| **DEV-02** | الاختبارات AI على `exam_sessions` (تمديد المحرّك) + تخزين إجابات الطالب | AREA-04 | DEV-01 |
| **DEV-03** | تجربة العبادة الاختيارية — `profiles.worship_enabled` + إخفاء المسارات + إخفاء الروابط | AREA-01 | DEV-01 |
| **DEV-04** | Dashboard: مصدر الحقيقة للصورة (Supabase) + المهام اليومية مرتبطة بالتقدم الفعلي | AREA-02 | DEV-03 |
| **DEV-05** | AI Infra: خريطة كاملة لـ`ai_operations` → نقل `daily_limit` لـ`ai_usage_events` → ضبط `CURRENCY_META` + `CURRENCY_META` vs `AI_CREDITS` | AREA-05 · AREA-06 | DEV-01 |
| **DEV-06** | Credits: توحيد `trial` لـ7 أيام + تسمية Magic Credits عبر الكود + شاشة استخدام شفافة للطالب | AREA-06 | DEV-05 |
| **DEV-07** | Learning Engine: حلقة `Retest` + تغذية ذاكرـة الطالب للشات (`user_weaknesses` → `getStudentContext`) | AREA-04 | DEV-05 |
| **DEV-08** | Community DEV เล็ก — بناءاً على قرار التقسيم (**D-DEV-010**): (أ) هوية عامة اختيارية · (ب) posts/reactions · (ج) moderation · (د) specialized communities · (Study Rooms مؤجلة) | AREA-09 | DEV-01 |
| **DEV-09** | Store: قرار `/store` مقابل `/shop` (**D-DEV-008**) + صفحة تاريخ مشتريات | AREA-08 | DEV-06 |
| **DEV-10** | Personas: توحيد الشخصيات 4-persona registry موثّق من Personas الحالية (**D-DEV-016**) | AREA-03 | DEV-05 |

## قواعد التنفيذ
1. **واحدة فقط مطبقة في أي وقت** — الـPhase Lock.
2. **كل DEV لها ملف** في `phases/` — قبل البدء بـ Audit (Stage B) — وخلصت بتقرير (Stage F).
3. **ORDER** هو **اقتراح** (مبني على الاعتماديات + الأولوية) — المالك بيغيّره لو عايز.
4. أي DEV يبدأ **بقرار** (`DECISIONS.md`) — لو افتقر قرار، يتحط في `BLOCKERS.md` أولاً.

## الموروث المرجعي (من الـaudits السابقة — للاستخدام السريع)
- **`LESSON_PAGE_PHASE1_AUDIT.md`** (2026-11-13) — تدقيق درس DEV-01.
- **`EXAMS_PHASE1_AUDIT.md`** (2026-11-14) — تدقيق الامتحانات DEV-02.
- **`EXAMS_PHASE2_PROPOSAL.md`** (2026-11-14، untracked) — مقترح DEV-02 — 6 قرارات.
- **`docs/TECH_DEBT.md`** — N-001..N-022 + TD-001..003 — ديون موثّقة.
- **`docs/MAGICLLY_STATUS.md`** — P0 tracker (September 2026 — تاريخي).
- **`workspace/ROADMAP.md`** — EPIC 1–10 (سبتمبر 2026 — تاريخي).
