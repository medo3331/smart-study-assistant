# DEV-M3 — جزء ٣: Egyptian Vibes 🇪🇬 + بوسترز قابلة للتعديل

**التاريخ:** 2026-11-28 · **الفرع:** `feat/community-c1-discovery` · **الترحيل:** `db/120-egyptian-vibes.sql`

## المطلوب (من المالك)

1. قسم جديد **Egyptian Vibes 🇪🇬** في المتجر: ألقاب مصرية مسعّرة + Posters + شخصيات.
2. بوسترز بداية نصية يقدر المالك يعدّلها / يستبدلها بتصاميمه بعدين من الأدمن.
3. تطوير أدوات الأدمن: دعم نوع بوستر + **تعديل** أي عنصر مخصوص (اسم/وصف/محتوى/سعر/ندرة) + إخفاء وإظهار.

## ما تم تنفيذه

### ١) db/120 — Egyptian Vibes على الإنتاج
- **30 لقب مصري** (خانة `title`): الهيبة والسلطة (الملك 3,000 · كبير البلد 4,000 · الأسطورة 5,000 · الزعيم · Boss الجامعة · The GOAT · الأيقوني) · الدحيحة والعباقرة (الدحيح 🧠 · البروفيسور · مهندس المستقبل · عدو الـ GPA…) · الطالب المصري الحقيقي (هنلم المنهج · ناجي من الفاينل · ابن اللائحة 💀 · بيحاول والله 500…) · النادرة الإنجليزية (Main Character · Final Boss · Academic Weapon…).
- **19 بوستر افتتاحية** (`metadata.poster=true`, `slot=null`): تحفيزية (Lock In · No Excuses · Silent Progress…) · كوميدية مصرية (هنلم المنهج · قهوة وستر ربنا · حاضر يا دكتور · علاقة Toxic…) · هيبة (The King Never Explains · Built Different…) · تخصصات (Hack the Future · Intelligence Is Power · Designed to Solve · Built to Save · Built to Lead).
- **1 أفاتار**: الدحيح 🧠 (2,500).
- كل العناصر `metadata.custom=true` + `collection='egyptian-vibes'` — idempotent (on conflict do update) داخل معاملة واحدة.

### ٢) قسم Posters في المتجر
- `CATEGORIES` + `CATEGORY.posters` في `types.ts` — التبويب بيظهر تلقائي في `/shop` و`/inventory`.
- `customRowToItem` بيقبل صفوف البوسترز (slot=null + poster) → `category: "posters"`.
- `ItemVisual` بينور البوستر كاقتباس منمق على تدرّج لوني من لون الندرة.
- البوسترز **مقتنيات عرض** — مفيش تلبيس (slot=null)، والشرا من `purchase_item` العادية (ومش بتدخل عروض اليوم).

### ٣) Admin Store Builder — تطوير
- `createStoreItem` بيدعم **posters** (id `poster.custom-xxxx`).
- **`updateStoreItem` جديد**: تعديل اسم/وصف/محتوى/ندرة/سعر كوينز/سعر كريدت + **إخفاء/إظهار** (`metadata.active`) — الإخفاء بيبعد العنصر عن العملاء الجداد بدون حذف، واللي اشتراه فاضل معاه.
- `deleteStoreItem` بيتحقق من `custom` من الجدول نفسه (مش من شكل المعرّف) — فالألقاب المصرية من db/120 قابلة للإدارة بالكامل من اللوحة.
- واجهة `/admin/store-items`: زر **تعديل** (نموذج inline) + **إخفاء/إظهار** + حذف — والبوستر هو الاختيار الافتراضي في نموذج الإضافة.

## خطوة المالك الجاية
- تعديل أي بوستر من `/admin/store-items` (زر تعديل) — ولما تصميماته الجاهزة تبقى حاضرة نضيف **رفع صورة/Asset** (Supabase Storage) كنوع معاينة بدل النص.

## التحقق
- `db/120` على الإنتاج: 30 لقب + 19 بوستر + 1 أفاتار (تم التحقق بالعد).
- `npx tsc --noEmit` ✅ (باستثناء ملفات worship WIP لجلسة تانية).
- `npx vitest run` — 2,543 passing · منها `tests/egyptian-vibes-migration.test.ts` (12) — والفشل الوحيد (5) قديم من جلسات تانية (خطة Basic / community scan / model registry) ومش من هذا التغيير.
