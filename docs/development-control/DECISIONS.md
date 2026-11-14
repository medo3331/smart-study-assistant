# DECISIONS — سجل قرارات Magicly

سجل مرجعي واحد لكل قرارات المنتج والتقنية. **أي session جديدة تقرا ده بدل ما تسأل تاني.**

> - الصيغة: `D-DEV-###`
> - `AREA-##` = نطاق منتج · `DEV-##` = مرحلة تطوير · `P0-*` = محجوز لـ`docs/MAGICLLY_STATUS.md`
> - **الحالات:** `مقفل` · `مفتوح` · `معلّق على تحقق تقني`
> - **قرار تقني ≠ اعتماد منتج.** كل قرار هنا إما مقفل (اتنفذ) أو معلّق (محتاج تحقق).

---

## 0. القاعدة الذهبية (موروثة)

> `D-REAL-008` — **كل ما لم يُتحقق = UNKNOWN.** لا نفترض.
> `D-REAL-009` — التواصل بالعربي المصري. المصطلحات التقنية بالإنجليزي.
> `D-REAL-001` — **لا نعيد البناء من الصفر.** نطوّر المنتج القائم ونكمله.

المصدر الكامل: `DECISIONS_REAL.md` + `CURRENT_STATE_REAL.md` + `ARCHITECTURE_REAL.md` + `EDUCATION_SYSTEM_REAL.md` + `AI_SYSTEM_REAL.md` + `DATABASE_REAL.md`.
> ⚠️ **أي قرار جديد لازم يُراجَع مقابل الـ6 ملفات دي.** لو تعارض → يُرفض أو يُعدَّل.

---

## 1. قرارات المالك المعتمدة — 2026-11-14

المرجع: مراجعة المالك لتقرير التدقيق (2026-11-14). **11/11 محسومة.**

### D-DEV-001 — Magic Credits هو اسم المنتج
**قرار:** اسم عملة الاستخدام بالذكاء الاصطناعي في المنتج هو **Magic Credits**.
**الحالة:** `مقفل` (منتج) · `معلّق` (تسميات الكود)
**النطاق:** AI Credits / `ai_credit_ledger` / `credit_grants` / `reserve_ai_credit` / `refund_ai_credit`.
**قيود:**
- يظل **منفصلاً تماماً** عن `Coins` (عملة المكافآت والمتجر — `coin_ledger` / `coin_balance()`).
- XP = تقدّم فقط (`profiles.xp`).
- التسمية في الكود: `AI Credits` (تقني) / `Magic Credits` (واجهة المستخدم).

> **معلّق تقنياً:** `lib/shop/economy.ts:271-277` — `CURRENCY_META` بيسمّي `AI_CREDITS` و`ENTITLEMENT` و`SUBSCRIPTION` بـ`NOT IMPLEMENTED / FUTURE` — **وهم**، لأن `ai_credit_ledger` و`entitlements` و`credit_grants` **موجودة ومربوطة فعلاً**. التصحيح مطلوب (انظر `DEV-06`).

---

### D-DEV-002 — Trial = 7 أيام كاملة المزايا
**قرار:** الفترة التجريبية **7 أيام** بالمزايا الكاملة.
**الحالة:** `مقفل` · **تعارض قائم لازم يتوحّد** → `BLOCKERS.md` B-09
**الدليل:** `db/economy-phase-0-5-trial-atomic.sql` → `claim_premium_trial()` = `entitlements(kind='plan', value='premium')` ينتهي `now() + interval '7 days'` + حارس `premium_trial_consumed` (مرة واحدة).
**التعارض:** `db/epic2-admin-rbac-audit-schema.sql:159` — `subscription_plans.trial_days` لبرو = **30**.
**ال(required) توحيد:** كل المصادر تقول 7. يُصحَّح الـseed + أي UI يعرض المدة.

---

### D-DEV-003 — `profiles.worship_enabled` (تجربة العبادة اختيارية)
**قرار:** تجربة العبادة **اختيارية بالكامل**. العلم في `profiles.worship_enabled`.
**الحالة:** `مقفل` (منتج) · `معلّق` (التنفيذ — كشف schema/RLS ✅، متبقّ المخطط)
**قيود الخصوصية (ملزمة):**
1. القيمة الافتراضية `false` **للحسابات الجديدة**.
2. **الطالب هو الوحيد اللي يفعّلها بنفسه.** لا تفعيل تلقائي ولا إداري.
3. **عدم استنتاج ديانة الطالب** من اسمه أو بياناته أو سلوكه.
4. **عدم إظهار الاختيار للآخرين** ولا استخدامه في التصنيف أو التخصيص.
5. **إخفاء الصفحات والروابط كاملة** عند عدم التفعيل — مش إخفاء زر واحد.

**تحقق تقني (Audit 2026-11-14):**
- `profiles` RLS مفعّل. الـSELECT policy الوحيد: `"profiles: owner read"` (`db/2026-11-security-rls-hardening.sql:37`) ⇒ **الطالب ما يشوفش علم غيره أصلاً**. ✅
- الـUPDATE policy الوحيد: `"profiles: owner updates (xp protected)"` (`db/economy-phase-b.sql:80`) بـ`with check (auth.uid() = id and xp = (select p.xp ...))` ⇒ **أي عمود غير `xp` قابل للتحديث من العميل** ✅.
- Trigger `protect_profiles_streak` (`db/43-retention-p0-streak.sql`) بيرفع استثناء **بس** لما `streak` أو `last_study_day` يتغير ⇒ **مش بيمنع** `worship_enabled` ✅.
- `protect_profiles_xp` (`db/economy-phase-b.sql`) بيحمي `xp` فقط ✅.
- ⚠️ **شرط الخصوصية الإضافي:** `public_profiles` view (اللي متاح لـ anon + authenticated) بيصدّر `id, display_name, xp, streak, public_user_code, persona, role, created_at` — **`worship_enabled` مش فيها** وده **شرط**. أي إضافة ليها = كسر الخصوصية.
- precedent موجود: `db/worship.sql:87` ضاف `profiles.worship_settings jsonb` بنفس النمط.

---

### D-DEV-004 — Supabase للصورة، localStorage كـ Cache
**قرار:** `profiles.avatar_url` + bucket `avatars` = **مصدر الحقيقة**. `localStorage` = cache فقط.
**الحالة:** `مقفل`
**الوضع الحالي:** `components/ProfileAvatar.tsx` = localStorage بس (`STORAGE_KEY="magicly_avatar"`) — وهو **المعروض في الداشبورد** (`app/dashboard/page.tsx:1525`). الـSupabase avatar موجود بس في `/dashboard/profile`.
**المطلوب (في `DEV-04`):** قراءة `profiles.avatar_url` كـ source of truth + كتابة الـcache.

---

### D-DEV-005 — تأجيل توصيل `match_knowledge` (RAG)
**قرار:** **لا** توصيل `match_knowledge` حالياً.
**الحالة:** `مقفل`
**الأدلة:** الـRPC موجود في `db/knowledge-base.sql` + `db/fix-match-knowledge.sql`، و125 صف كلهم `source_type='sample'` (ويكيبيديا + ملف عيّنة)، و**مش متنادى من أي مكان** في `app/`/`lib/`/`components/`.
**الشرط لو اتفتح لاحقاً:** إثبات جودة الـembeddings على محتوى حقيقي أول — مش على seed.

---

### D-DEV-006 — لا توسّع `script-src` لـ YouTube
**قرار:** **لا** نضيف `https://www.youtube-nocookie.com` لـ`script-src`.
**الحالة:** `مقفل` · كافٍ لإغلاق سؤال `LESSON_PAGE_PHASE1_AUDIT.md` §5/1.
**النتيجة:** نقاط الفحص (Checkpoints) تُقاد من الـtranscript + رابط `&t=` بدل `getCurrentTime()`/`seekTo()` التلقائي. صفر توسّع في سطح الهجوم.
**مرجع:** `next.config.ts` (الـCSP) · `LESSON_PAGE_PHASE1_AUDIT.md` §1 (التحفّظ) و§3.4.

---

### D-DEV-007 — OpenRouter: حالة تشغيلية محدودة (مؤقت)
**قرار:** نستمر على OpenRouter لحين تغيير، **مع توثيق محدودية الخدمة**. لا ندّعي أن جودة/توفّر الصور مكتمل.
**الحالة:** `مقفل` (تشغيلي مؤقت)
**الواقع:** رصيد OpenRouter = 0 ⇒ `402 Insufficient credits` ⇒ السلسلة بتكمّل لـPollinations المجاني اللي محدود معدّله (`503 The Classic API is at its limit right now`).
**المطلوب:** توثيق صريح في `STATUS.md` + صفحة صور say-so. شحن الرصيد إجراء يدوي من المالك (`BLOCKERS.md` B-11).
**مرجع:** `docs/TECH_DEBT.md` N-020.

---

### D-DEV-008 — `/store`: فحص قبل أي قرار
**قرار:** **لا نحذف** `/store` ولا نعيد بناءه قبل مقارنة وظيفته بالـ`/shop` الموجود.
**الحالة:** `مقفل`
**الواقع:** `app/shop/page.tsx` (24KB) = المتجر الحقيقي. `app/store/page.tsx` = stub من 17 سطر ("قيد الإعداد" — باقات AI Credits). `lib/shop/useful.ts` فيه `USEFUL_ITEMS` (Study Booster 2200 / AI Starter 650 / AI Power 2400) = باقات credits بـ Coins.
**⇒ قرار مختلف ليس "نحذف" ولا "نبني":** نقرّر في `DEV-08` هل `/store` = صفحة باقات Credits منفصلة، ولا ندمجها في `/shop`، ولا نحذفها.

---

### D-DEV-009 — `ai_usage_events` هو سجل الحقيقة **للاستخدام**
**قرار:** `ai_usage_events` = سجل الحقيقة لعمليات ومحاولات الـAI. **لا نحذف `ai_operations` الآن.**
**الحالة:** `مقفل`
**التفسيم المعتمد:**

| الجدول | الدور | مسار الكتابة | مسار القراءة |
|---|---|---|---|
| `ai_usage_events` | سجل محاولات AI: feature/provider/model/status/tokens/latency | service_role فقط (upsert) — **بلا insert policy بالتصميم** | `/admin/ai-usage` · `/admin/ai-telemetry` · `/api/admin/alerts/evaluate` |
| `ai_credit_ledger` | **مصدر الحقيقة لرصيد Magic Credits**: حجز/خصم/استرداد/منح | **RPC فقط** (بلا write policies — مسقطة عمداً) | `/api/me/plan-quota` · `rate-limit.ts` · `/admin/ai-overview` |
| `ai_operations` | **نظام قديم/موازٍ** — تحتاج مراجعة كل استخداماته | session client (owner-scoped) | 4 مسار قراءة حي (تحتها) |

**قيد معماري (مقفل):** `ai_operations` **مش بيتشال** قبل ما تتعمل خريطة كاملة لكل قارئ وكاتب. الخريطة اتعملت 2026-11-14 → `BLOCKERS.md` B-06 + `DEV-05`.

**قراءة `ai_operations` الحيّة (4 مسارات) — أي إيقاف يكسرها:**
1. `lib/ai/model-state.ts:68-73` → ** enforcement `ai_models.daily_limit`** (`usedToday` → `isModelRuntimeEnabled` → `lib/ai/routing.ts:304` + `app/api/unified-ai/route.ts:321`). ⚠️ لو الجدول فاضي ⇒ `usedToday=0` ⇒ الحد **مش بيتفعّل أصلاً**.
2. `app/admin/users/analytics/page.tsx:41-49` و`:99-103` — أعمدة "عدد عمليات AI".
3. `lib/admin/overview.ts:80-83` — fallback لـ`messagesToday` في `/admin`.
4. `app/admin/page.tsx:29` و `app/admin/analytics/page.tsx:10` — يستخدموه كـfallback.

**قراءة `ai_operations` غير موجودة:** `estimated_cost` و`token_usage` = **write-only** (DDL + كتابة فقط — مفيش UI ولا query بيقراهم). `logAiTelemetry` = **export ميت** (صفر callers).
**الكتابة:** 17 call site في 12 route، كلها `void recordAiOperation(...)` = fire-and-forget بـ`catch` بيبلع الخطأ.
**⚠️ UNKNOWN:** `latency_ms` / `fallback_attempts` — **مفيش migration في `db/`** لهم. لو الأعمدة مش موجودة بالproduction، كل insert بيرجع لـ`baseRow` للقيم دي.

---

### D-DEV-010 — Community يُقسَّم إلى DEV صغيرة
**قرار:** بناء المجتمع على مراحل صغيرة، **مش** دفعة واحدة.
**الحالة:** `مقفل` (تقسيم) — **التفصيل في `DEV-08`**
**الموروث (لا يتعارض):** مجتمع عام + مجتمعات متخصصة · الطالب يختار هويته العامة · **غرف المذاكرة مؤجلة**.
**الواقع الحالي:** `app/community` = leaderboard + مسابقة أسبوعية فقط. **مفيش** `posts` / `comments` / `reactions` ولا جدولهم في `db/`. مفيش moderation (report/flag/block).
**⚠️ فخ موروث:** `community_questions` / `community_answers` — الكومponentات موجودة (`components/CommunityQA.tsx`, `components/AskClassmatesButton.tsx`) بس **مش مستوردة في أي مكان** (dead code) **ومش معرّفة في أي migration**.

---

### D-DEV-011 — فرع نشط واحد + DEV واحدة مفتوحة
**قرار:** **فرع تطوير نشط واحد** + **مرحلة DEV واحدة مفتوحة** في أي وقت.
**الحالة:** `مقفل`
**⚠️ لا يعني:** حذف الفروع القديمة أو الـworktrees. القاعدة تشغيلية للمضي قدماً فقط.
**الفرع النشط الحالي:** `feat/lesson-content` (انظر `ACTIVE_PHASE.md`).
**الفرص/الآثار:** ~190 فرع محلي + ~110 remote + 64 worktree (2 `prunable`). **مفيش قرار حذف** → `BLOCKERS.md` B-04.

---

## 2. قرارات سابقة سارية (موروثة — لا تُعدَّل)

| ID | القرار | الحالة | مرجع |
|---|---|---|---|
| `D-DEV-012` | **تجربة العبادة اختيارية بالكامل، ولا نفترض ديانة الطالب** | مقفل | `D-DEV-003` (قيود الخصوصية) |
| `D-DEV-013` | **Coins = عملة المكافآت والمتجر، منفصلة عن Magic Credits** | مقفل | `lib/shop/economy.ts` + `db/shop.sql` |
| `D-DEV-014` | **المهام اليومية على الداشبورد ترتبط بالتقدم التعليمي الفعلي** | مقفل | `db/gamification.sql` `daily_missions()` (حالياً قواعد ثابتة — الفجوة في `DEV-04`) |
| `D-DEV-015` | **حلقة التعلّم: Upload → Analysis → Diagnostic → Weak Topics → Study Plan → Study → Retest** | مقفل | الفجوة: "Retest" غير موجود (`DEV-07`) |
| `D-DEV-016` | **Magic Personas: الحفاظ على الشخصيات الحالية وتوحيدها، مش بناء شخصيات مكررة** | مقفل | `DEV-05` |
| `D-DEV-017` | **Community: عام + متخصص، الهوية العامة اختيارية** | مقفل | `DEV-08` |
| `D-DEV-018` | **Study Rooms مؤجلة** | مؤجل | مش في أي DEV حالي |
| `D-DEV-019` | **العملية: Audit → خطة → تنفيذ بموافقة المالك** | مقفل | `README.md` §3 |

---

## 3. قرارات تقنية مشتقة من التحقق (Audit 2026-11-14)

### D-DEV-020 — `ai_usage_events` يكتب عن طريق service_role فقط
**الحالة:** `مقفل` — سلوك مقصود: `db/16-ai-usage-events.sql:154-157` **بلا insert/update/delete policy** (المكتوب: *"الكتابة عبر service_role فقط"*).
**الأثر:** `recordAiUsage` (`lib/ai/usage-accounting.ts:330`) = upsert بـ`ignoreDuplicates` على `(user_id, idempotency_key, attempt_no)` + `try/catch` كامل ⇒ **لا مسار AI يفشل بسبب التسجيل**.
**قاعدة:** أي feature قياس جديد يقرأ `ai_usage_events` ولا يكتب فيه.

### D-DEV-021 — `ai_credit_ledger` مالوش write path من العميل
**الحالة:** `مقفل` — `db/economy-phase-d.sql:185-188` **يسقط صراحةً** policies الكتابة (`owner writes` / `owner updates` / `owner deletes` / `users manage their own ai credits`).
**الأثر:** كل الكتابة عبر RPC: `reserve_ai_credit` · `refund_ai_credit` · `grant_ai_credits` · `grant_credits` · `update_ai_ledger_metadata` · `purchase_item`.
**⚠️ RPCs بلا caller:** `consume_ai_credits` · `confirm_ai_credit` · `ai_credit_balance` ⇒ ميتة فعلياً.
**⚠️ UNKNOWN:** فيه **5 تعريفات مت competing** لـ`reserve_ai_credit` في `db/` (`economy-phase-f` · `bc-rate-limits` · `h-rate-limit` · `h2-window-limits` · `credit-pricing-reserve`) — أي واحد هو الحيّ **غير معروف من المستودع**.

### D-DEV-022 — `ai_models.daily_limit` مربوط بـ`ai_operations` لا `ai_usage_events`
**الحالة:** `معلّق` — لازم ينتقل العدّاد لـ`ai_usage_events` (المصدر الصح) قبل/at إيقاف `ai_operations`.
**الآلية الحالية:** `lib/ai/model-state.ts:68-81` يعدّ صفوف `ai_operations` بـ`status='completed'` منذ منتصف ليل UTC → `usedToday` → `isModelRuntimeEnabled` (`:122`) → الفلترة في `lib/ai/routing.ts:304` + `app/api/unified-ai/route.ts:321`.
**الخطورة:** لو `ai_operations` فاضي ⇒ `usedToday=0` ⇒ **الحد اليومي للموديلات ما بيتفعّلش أصلاً** — بصمت.
**الـcache** بيتحدّث من 4 مواضع: `unified-ai/route.ts:300` · `chat/route.ts:55` · `ai/generate/route.ts:38` · `admin/models/page.tsx:50`.

### D-DEV-023 — DEV-02 / Exams = EXTERNALLY OWNED · PROTECTED · OUT OF SCOPE
**قرار:** `DEV-02` محمي بالكامل — **خارج نطاق أي عمل أو مراجعة من جلسة التطوير الحالية** — لأن تطوير صفحة الامتحانات يتم بجلسة وموديل آخر.
**الحالة:** `مقفل` (تشغيلي) · **يصدر من المالك 2026-11-14 (18:15).**
**القيود الملزمة (من المالك):**
1. **ممنوع لمس** أي ملف متعلق بنظام Exams / Exam Sessions / Exam Generator.
2. **ممنوع قراءة أو تحليل أو مراجعة أو تعديل أو حذف أو نقل** ملفات DEV-02، ومنها: `lib/ai/exam-review.ts` · `lib/ai/__tests__/exam-review.test.ts` · `app/api/exam-sessions/**` · `db/48-exam-generator.sql` · `EXAMS_PHASE1_AUDIT.md` · `EXAMS_PHASE2_PROPOSAL.md` · أي ملفات أخرى مرتبطة بصفحة الامتحانات.
3. **ممنوع `git stash` أو `git reset` أو `git checkout`** أو أي إجراء قد يؤثر على التعديلات الجارية للجلسة الأخرى.
4. **لا تعتبر كود DEV-02 مكتملًا أو معتمدًا أو متاحًا للدمج.**
5. **السجل:** `EXTERNALLY OWNED — PROTECTED — TEMPORARILY OUT OF SCOPE`.
6. **لا يُستأنف العمل على DEV-02** إلا بموافقة صريحة من المالك + إبلاغ بانتهاء الجلسة الأخرى.

**إدارة المرحلة الحالية:**
- `DEV-01` تظل **المرحلة النشطة** في نظام التطوير.
- `DEV-02` لا تدخل في نطاق التنفيذ أو المراجعة حاليًا.
- **لا تنفيذ `db/46` أو `db/47` ولا أي SQL أو Migration دون موافقة صريحة.**
- **لا Commit أو Push أو Merge أو Deploy.**
- **لا أعمال تنظيف أو نقل ملفات** تؤثر على العمل الجاري.

**على التوثيق:** محدّث دون تعارض مع الجلسة الأخرى. أي تعارض في ملفات `docs/development-control/` ⇒ التوقف والإبلاغ للمالك (لم يُسجّل تعارض لغاية الآن — انظر `STATUS.md`).

**الأثر على B-12:** مُحسوم تشغيليًا — انظر `BLOCKERS.md` B-12.

---

## 4. قرارات مفتوحة (تُنقل لـ`BLOCKERS.md`)

`B-01` · `B-02` · `B-03` · `B-04` — شوف `BLOCKERS.md` §1.

---

## 5. قالب القرار الجديد

```markdown
### D-DEV-0XX — <العنوان>
**قرار:** <جملة واحدة>
**الحالة:** مقفل | مفتوح | معلّق على تحقق تقني
**النطاق:** <الملفات/الجداول/الواجهات>
**قيود:** <ما لا يجوز انتهاكه>
**الدليل:** <file:line أو commit>
**المرجع:** <من أين جاء>
```
