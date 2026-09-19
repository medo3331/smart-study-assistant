# MAGICLLY — خطة التطوير الكاملة (Development Master Plan)

**Repository:** medo3331/smart-study-assistant
**Branch الحالي:** epic-1-profiles (بعد الدمج → main)
**آخر تحديث:** 19 سبتمبر 2026
**الحالة:** خطة تنفيذ — جاهزة للبدء epic بعد epic

> ملاحظة: المستند ده منفصل عن `MAGICLLY_EDUCATION_OS_MASTER_PLAN.md` (الرؤية الاستراتيجية طويلة المدى). هيتم الرجوع لها رسميًا بعد ما الـMVP هنا يخلص.

---

## 0. الحالة الحالية

| Epic | الاسم | الحالة |
|---|---|---|
| P0-1 | — | BLOCKED (قديم، تم تجاوزه) |
| P0-2 | — | ✅ PASS |
| P0-3 | — | ✅ PASS (بعد تصحيح التوثيق) |
| P0-4 | — | ✅ PASS |
| EPIC-1 | Multi-Profile System (schema + state) | ✅ DONE |
| EPIC-2 | Admin Panel + Roles & Permissions | 🔄 جاري (تبدأ الآن — 2026-09-19) |
| EPIC-3 | Subscriptions, Plans & Quotas | ⏳ مخطط |
| EPIC-4 | File Management & Classification | ⏳ مخطط |
| EPIC-5 | AI Personality System (per-profile) | ⏳ مخطط |
| EPIC-6 | User Code + QR Activation Flow | ⏳ مخطط (مرتبط بـ EPIC-2) |
| — | Education OS Master Plan | 🔒 مؤجل لحد ما الـMVP يخلص |

**ترتيب التنفيذ المقترح:** EPIC-2 → EPIC-6 (مرتبطين) → EPIC-3 → EPIC-4 → EPIC-5

---

## 1. EPIC-2 — Admin Panel + Roles & Permissions

### 1.1 الهدف
لوحة تحكم داخلية بصلاحيات RBAC (مش roles ثابتة فقط)، مع Audit Log لأي عملية حساسة.

### 1.2 الأدوار (Roles)
- **Owner** — كل الصلاحيات + إدارة الأدوار + إعدادات حساسة
- **Admin** — إدارة مستخدمين/اشتراكات/مكافآت/محتوى (بدون حذف Owner أو تعديل إعدادات حساسة)
- **Support** — مشاهدة + تعديل محدود

### 1.3 Permission Keys (RBAC)
```
users.read / users.ban / users.unban / users.impersonate
plans.manage / trial.manage / models.manage / rewards.manage
admins.manage / files.moderate / audit.read
subscriptions.manage
```

### 1.4 شاشات الأدمن المطلوبة
1. **Dashboard** — أرقام أولوية: مستخدمين نشطين / طلبات AI / رفع ملفات / خطط أكثر استخدامًا
2. **Users** — بحث متقدم + صفحة تفاصيل لكل مستخدم
3. **Subscriptions** — تفعيل يدوي (User Code + خطة + مدة)
4. **AI Models Control** — إدارة النماذج
5. **Rewards / Weekly Gifts** — قواعد + إصدارات
6. **Admins & Roles** — إدارة الأدمن + RBAC

### 1.5 Audit Log (إلزامي)
`actor, action, resource, timestamp, result` — كل عملية حساسة.

---

## 2. EPIC-6 — User Code + QR Activation

### 2.1 الهدف
كل حساب له `public_user_code` (مثال: `MAG-8F3K2Q`) — يسهل التفعيل اليدوي عبر واتساب.

### 2.2 Flow التفعيل (يدوي عبر واتساب)
```
المستخدم يدفع (فودافون كاش / فوري / إنستاباي)
↓
يتواصل عبر واتساب مع الدعم + يبعت الكود بتاعه
↓
الأدمن يفتح Admin Panel → Subscriptions → يدخل الكود
↓
يختار الخطة + المدة → Activate
↓
تسجيل في Audit Log
```

---

## 3. EPIC-3 — Subscriptions, Plans & Quotas

### 3.1 الخطط النهائية

| الميزة | Free | Pro | Ultra |
|---|---|---|---|
| عدد البروفايلات | 1 | 3 | 5 |
| الرسائل (كل ساعتين) | 20 | 100 | 500 |
| رفع الملفات (يوميًا، Reset يومي) | 5 | 30 | 60 |
| حجم الملف الواحد | 20MB | 150MB | 1GB |
| أنواع الملفات | نص/PDF/صور | نص/PDF/صور | + فيديو وصوت (حصري) |
| تحليل فيديو/صوت | ❌ | ❌ | ✅ (pipeline) |
| Trial | — | شهر (أدمن فقط) | — |
| أولوية Queue | عادي | عادي | أعلى |

### 3.2 محاسبة معالجة الفيديو (Ultra فقط)
- **دقائق معالجة/شهر (300)** + **عدد ملفات/يوم (60)** — حماية مزدوجة
- Pipeline: `Extract audio → Transcribe → Summarize/Outline → (اختياري) PDF`
- Background job — مش لحظيًا

### 3.3 الدفع
- يدوي بالكامل (فودافون كاش / فوري / إنستاباي) عبر واتساب — **مفيش دفع جوه المنصة**
- التفعيل يتم من الأدمن (راجع EPIC-6)

---

## 4. EPIC-4 — File Management & Classification

- كل ملف يتصنّف بـ: Stage / Grade / Track / Subject
- الملف يرتبط بـ `profile_id`
- **تعديل التصنيف بعد الرفع** — متاح
- **Bulk edit** — تحديد كذا ملف وتغيير تصنيفهم مع بعض
- **Replace** — يحل محل نفس الـ record (لا يُحسب رفع جديد في الـ quota)
- **ترحيل البيانات:** لا يوجد — البيانات الحالية (ملفات + بروفايلات قديمة) هتتمسح؛ الحساب يفضل موجود؛ أول دخول = بروفايل جديد

---

## 5. EPIC-5 — AI Personality System (Per-Profile)

### 5.1 الشخصيات
| الشخصية | الوصف |
|---|---|
| جادة | رسمية، دقيقة، مركزة |
| مرحة | خفيفة دم، إيموجي وأمثلة |
| لطيفة | هادية، مشجعة، صبورة |

### 5.2 قاعدة الاقتراح التلقائي
| المرحلة | المقترحة |
|---|---|
| ابتدائي | لطيفة |
| إعدادي / ثانوي | مرحة |
| جامعة / خريج / فريلانسر | جادة |
| ولي أمر (Parent) | جادة |

- كل Profile له شخصية مختلفة (عمود `ai_personality` في نفس جدول profile)
- المستخدم يقدر يغيّر يدويًا في أي وقت

---

## 6. سؤال العمر في الـOnboarding
- المقترح: سؤال طبيعي "أنت في أنهي مرحلة دراسية؟" (يُستخدم لـ stage/grade)
- ممكن سؤال عمر تكميلي لو الدقة الإضافية مطلوبة للشخصية

---

## 7. تلخيص كل النقاط المفتوحة (Open Questions) — المراجعة السريعة

1. شكل الـDashboard بالظبط (أرقام أولوية)
2. Support role يشوف الـAudit Log ولا لأ
3. Export CSV من أول نسخة ولا يتأجل
4. رابط الـQR: صفحة عامة ولا كود عرض بس
5. سقف تخزين إجمالي لحساب Ultra (20GB مقترح)
6. توقيت الـReset اليومي (منتصف الليل مصر)
7. طريقة الـResumable upload التقنية (Supabase signed URLs)
8. Bulk edit: حقل واحد ولا أكتر من حقل مرة واحدة
9. Versioning للملفات عند الـReplace: من أول نسخة ولا يتأجل
10. Override مؤقت للشخصية (زي وقت الامتحانات): أول نسخة ولا يتأجل
11. سؤال العمر: إجباري/اختياري، ومكانه بالظبط في الـflow

---

## 8. علاقة الخطة بـ Education OS Master Plan

بمجرد ما EPIC-2 → EPIC-6 هنا يخلصوا ويستقروا، ده فعليًا **يعتبر الأساس** اللي الـP0 بتاع الـMaster Plan (Architecture & Safety) طالبه. هنرجع نفعّله رسميًا كخطوة منفصلة بعد كده.

---

## 9. افتراضات افتراضية للتنفيذ (النقاط غير المُجاب عليها — موثقة)

تم اتخاذ قرارات افتراضية للتنفيذ بناءً على أفضل الممارسات، مع توثيقها صراحة:

| # | النقطة | القرار الافتراضي | ملاحظة |
|---|---|---|---|
| 1 | Dashboard | أرقام أولية (مستخدمين نشطين / طلبات / رفع / خطط أكثر استخدامًا) | قابل للتعديل |
| 2 | Support + Audit | Support يشوف Audit Log | محافظ |
| 3 | CSV Export | من أول نسخة | مش مؤجل |
| 4 | Ultra storage cap | 20GB إجمالي + 1GB/ملف | واضح في الجدول |
| 5 | Daily reset | منتصف الليل (توقيت مصر) | EET |
| 6 | Resumable upload | Supabase signed URLs (chunked) | تقني |
| 7 | Bulk edit | أكتر من حقل مرة واحدة مسموح | مرن |
| 8 | File versioning | مؤجل للنسخ القادمة | واضح |
| 9 | Personality override (امتحان) | مؤجل لـ EPIC-5 | واضح |
| 10 | Override مؤقت | مؤجل للنسخ القادمة | واضح |
| 11 | سؤال العمر | اختياري، في onboarding لـ EPIC-5 | واضح |

---

*المستند ده محفوظ رسميًا — تم الرجوع إليه أثناء تنفيذ EPIC-2 (2026-09-19).*
