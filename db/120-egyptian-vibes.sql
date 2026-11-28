-- ============================================================================
-- 120 — EGYPTIAN VIBES 🇪🇬 (DEV-M3 جزء ٣)
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
-- القسم الجديد في المتجر: ألقاب مصرية + بوسترز افتتاحية (نصية) + أفاتار
--
-- ⚠️ كل العناصر دي **مخصصة** (metadata.custom=true) — بتتقرا في /shop و
--    /inventory من fetchCustomCatalogItems، والأدمن يقدر يعدّلها أو يحذفها
--    أو يخفيها من /admin/store-items بدون SQL.
-- البوسترز (metadata.poster=true) slot=null — مش بتتلبس، مقتنايات عرض،
-- والعناصر القادمة من التصاميم الجاهزة للمالك هتترفع بنفس المخطط.
-- append فقط: مايلمسش عناصر db/shop.sql ولا 118.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) الألقاب المصرية — slot='title'، قيمتها نص اللقب (بتتلبس وتظهر جنب الاسم)
-- ----------------------------------------------------------------------------
insert into public.shop_catalog (id, slot, price, credits_price, unlock, rarity, metadata) values
  -- الهيبة والسلطة 😂
  ('title.egyptian-king',              'title', 3000, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'الملك 👑',              'desc', 'هيبة بلا منازع',                     'value', 'الملك 👑',              'collection', 'egyptian-vibes')),
  ('title.egyptian-kbir-el-balad',     'title', 4000, null, null, 'mythic',    jsonb_build_object('custom', true, 'name', 'كبير البلد 🦅',       'desc', 'احترم نفسك إنت فين',                 'value', 'كبير البلد 🦅',         'collection', 'egyptian-vibes')),
  ('title.egyptian-ostura',            'title', 5000, null, null, 'mythic',    jsonb_build_object('custom', true, 'name', 'الأسطورة 🔥',          'desc', 'أغلى لقب في المتجر',                 'value', 'الأسطورة 🔥',           'collection', 'egyptian-vibes')),
  ('title.egyptian-zaeem',             'title', 3500, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'الزعيم ⚡',            'desc', 'الكلمة ليه كلمة',                    'value', 'الزعيم ⚡',             'collection', 'egyptian-vibes')),
  ('title.egyptian-boss',              'title', 3000, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'Boss الجامعة',         'desc', 'الجامعة كلها تعرفك',                 'value', 'Boss الجامعة',          'collection', 'egyptian-vibes')),
  ('title.egyptian-goat',              'title', 4000, null, null, 'mythic',    jsonb_build_object('custom', true, 'name', 'The GOAT 🐐',          'desc', 'أعظم على الإطلاق',                   'value', 'The GOAT 🐐',           'collection', 'egyptian-vibes')),
  ('title.egyptian-iconic',            'title', 2500, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'الأيقوني ✨',          'desc', 'وجودك بيبان',                        'value', 'الأيقوني ✨',           'collection', 'egyptian-vibes')),
  -- الدحيحة والعباقرة 🧠
  ('title.egyptian-dahih',             'title', 2000, null, null, 'epic',      jsonb_build_object('custom', true, 'name', 'الدحيح 🧠',            'desc', 'فاهم كل حاجة قبل الكل',              'value', 'الدحيح 🧠',             'collection', 'egyptian-vibes')),
  ('title.egyptian-professor',         'title', 3000, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'البروفيسور 🎓',        'desc', 'الدكاترة بيسألوا عليك',              'value', 'البروفيسور 🎓',         'collection', 'egyptian-vibes')),
  ('title.egyptian-future-engineer',   'title', 2000, null, null, 'epic',      jsonb_build_object('custom', true, 'name', 'مهندس المستقبل ⚙️',    'desc', 'بتصلّح كل حاجة',                     'value', 'مهندس المستقبل ⚙️',     'collection', 'egyptian-vibes')),
  ('title.egyptian-einstein',          'title', 2500, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'Einstein الجامعة',     'desc', 'النظرية عندك قبل النشر',             'value', 'Einstein الجامعة',      'collection', 'egyptian-vibes')),
  ('title.egyptian-gpa-enemy',         'title', 1500, null, null, 'rare',      jsonb_build_object('custom', true, 'name', 'عدو الـ GPA 📈',       'desc', 'ال GPA عارفك كويس',                  'value', 'عدو الـ GPA 📈',        'collection', 'egyptian-vibes')),
  ('title.egyptian-encyclopedia',      'title', 2000, null, null, 'epic',      jsonb_build_object('custom', true, 'name', 'موسوعة ماشية 📚',      'desc', 'تمشي وبيانات معاك',                  'value', 'موسوعة ماشية 📚',       'collection', 'egyptian-vibes')),
  ('title.egyptian-human-calculator',  'title', 2000, null, null, 'epic',      jsonb_build_object('custom', true, 'name', 'Calculator بشري',      'desc', 'من غير آلة حاسبة',                   'value', 'Calculator بشري',       'collection', 'egyptian-vibes')),
  -- الطالب المصري الحقيقي 🇪🇬
  ('title.egyptian-last-minute',       'title', 1000, null, null, 'uncommon',  jsonb_build_object('custom', true, 'name', 'آخر لحظة 🫡',          'desc', 'بتسلّم في اللحظة الأخيرة',           'value', 'آخر لحظة 🫡',           'collection', 'egyptian-vibes')),
  ('title.egyptian-henlem',            'title', 1000, null, null, 'uncommon',  jsonb_build_object('custom', true, 'name', 'هنلم المنهج',          'desc', 'الوعد الأزلي',                       'value', 'هنلم المنهج',           'collection', 'egyptian-vibes')),
  ('title.egyptian-rayek',             'title', 1500, null, null, 'rare',      jsonb_build_object('custom', true, 'name', 'رايق رغم التراكم ☕',   'desc', 'المزاج فوق التراكم',                 'value', 'رايق رغم التراكم ☕',    'collection', 'egyptian-vibes')),
  ('title.egyptian-final-survivor',    'title', 2000, null, null, 'epic',      jsonb_build_object('custom', true, 'name', 'ناجي من الفاينل',      'desc', 'طلعت منها بحسن نية',                 'value', 'ناجي من الفاينل',       'collection', 'egyptian-vibes')),
  ('title.egyptian-ibn-aliha',         'title', 1500, null, null, 'rare',      jsonb_build_object('custom', true, 'name', 'ابن اللائحة 💀',       'desc', 'تعرف اللائحة أحسن من نفسك',          'value', 'ابن اللائحة 💀',        'collection', 'egyptian-vibes')),
  ('title.egyptian-kaser-el-donya',    'title', 2500, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'كاسر الدنيا',          'desc', 'مش هتقف قدامك',                      'value', 'كاسر الدنيا',           'collection', 'egyptian-vibes')),
  ('title.egyptian-trying',            'title',  500, null, null, 'common',    jsonb_build_object('custom', true, 'name', 'بيحاول والله ❤️',      'desc', 'أصدق لقب في القايمة',                'value', 'بيحاول والله ❤️',       'collection', 'egyptian-vibes')),
  ('title.egyptian-deadline-fighter',  'title', 1500, null, null, 'rare',      jsonb_build_object('custom', true, 'name', 'مقاتل الـ Deadline 🔥','desc', 'بتحارب لحد ثانية التسليم',           'value', 'مقاتل الـ Deadline 🔥', 'collection', 'egyptian-vibes')),
  -- نادرة ومميزة (English)
  ('title.first-class',                'title', 1200, null, null, 'rare',      jsonb_build_object('custom', true, 'name', 'First Class',          'desc', 'المعدل بيتكلم',                      'value', 'First Class',           'collection', 'egyptian-vibes')),
  ('title.academic-weapon',            'title', 2000, null, null, 'epic',      jsonb_build_object('custom', true, 'name', 'Academic Weapon',      'desc', 'سلاح أكاديمي متحرك',                 'value', 'Academic Weapon',       'collection', 'egyptian-vibes')),
  ('title.certified-genius',           'title', 2200, null, null, 'epic',      jsonb_build_object('custom', true, 'name', 'Certified Genius',     'desc', 'عبقرية موثقة رسميًا',                'value', 'Certified Genius',      'collection', 'egyptian-vibes')),
  ('title.main-character',             'title', 2800, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'Main Character',       'desc', 'القصة حواليك إنت',                   'value', 'Main Character',        'collection', 'egyptian-vibes')),
  ('title.no-days-off',                'title', 2000, null, null, 'epic',      jsonb_build_object('custom', true, 'name', 'No Days Off',          'desc', 'مفيش يوم إجازة من الحلم',            'value', 'No Days Off',           'collection', 'egyptian-vibes')),
  ('title.silent-killer',              'title', 1500, null, null, 'rare',      jsonb_build_object('custom', true, 'name', 'Silent Killer',        'desc', 'بتسكت وبتقتل في الترتيب',            'value', 'Silent Killer',         'collection', 'egyptian-vibes')),
  ('title.final-boss',                 'title', 4000, null, null, 'mythic',    jsonb_build_object('custom', true, 'name', 'Final Boss',           'desc', 'أنت آخر تحدٍّ في المادة',            'value', 'Final Boss',            'collection', 'egyptian-vibes')),
  ('title.unstoppable',                'title', 2600, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'Unstoppable',          'desc', 'مفيش حاجة واقفة قدامك',              'value', 'Unstoppable',           'collection', 'egyptian-vibes'))
on conflict (id) do update set
  price = excluded.price,
  credits_price = excluded.credits_price,
  unlock = excluded.unlock,
  rarity = excluded.rarity,
  metadata = excluded.metadata,
  slot = excluded.slot;

-- ----------------------------------------------------------------------------
-- ٢) البوسترز الافتتاحية — نصية منمقة (metadata.poster=true, slot=null).
--    المالك هيستبدلها بتصاميمه من الأدمن (تعديل/رفع asset) أو يحذفها.
-- ----------------------------------------------------------------------------
insert into public.shop_catalog (id, slot, price, credits_price, unlock, rarity, metadata) values
  -- تحفيزية
  ('poster.egyptian-henlem',        null,  800, null, null, 'uncommon',  jsonb_build_object('custom', true, 'poster', true, 'name', 'هنلم المنهج 📚',              'desc', 'بوستر كوميدي — وعد كل ترم',        'value', 'هنلم المنهج بإذن الله',                     'collection', 'egyptian-vibes')),
  ('poster.lock-in',                null, 1000, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'Lock In 🔒',                  'desc', 'بوستر تحفيزي',                     'value', 'Lock In',                                   'collection', 'egyptian-vibes')),
  ('poster.grind-never-lies',       null, 1000, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'The Grind Never Lies 💪',     'desc', 'بوستر تحفيزي',                     'value', 'The Grind Never Lies',                      'collection', 'egyptian-vibes')),
  ('poster.no-excuses',             null, 1000, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'No Excuses 🚫',               'desc', 'بوستر تحفيزي',                     'value', 'No Excuses',                                'collection', 'egyptian-vibes')),
  ('poster.silent-progress',        null, 1000, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'Silent Progress 🌙',          'desc', 'بوستر تحفيزي',                     'value', 'Silent Progress',                           'collection', 'egyptian-vibes')),
  -- كوميدية مصرية
  ('poster.7ader-ya-doctor',        null,  500, null, null, 'common',    jsonb_build_object('custom', true, 'poster', true, 'name', 'حاضر يا دكتور ✋',            'desc', 'بوستر كوميدي',                     'value', 'حاضر يا دكتور ✋',                          'collection', 'egyptian-vibes')),
  ('poster.shocked-student',        null,  500, null, null, 'common',    jsonb_build_object('custom', true, 'poster', true, 'name', 'الطالب المصدوم 😵',           'desc', 'بوستر كوميدي',                     'value', 'أنا في أنهي Chapter؟! 😵',                  'collection', 'egyptian-vibes')),
  ('poster.deadline-toxic',         null,  900, null, null, 'uncommon',  jsonb_build_object('custom', true, 'poster', true, 'name', 'علاقة Toxic 💔',              'desc', 'بوستر كوميدي',                     'value', 'أنا والـ Deadline علاقة Toxic',             'collection', 'egyptian-vibes')),
  ('poster.exam-confidence',        null,  900, null, null, 'uncommon',  jsonb_build_object('custom', true, 'poster', true, 'name', 'بثقتي فقط 😤',                'desc', 'بوستر كوميدي',                     'value', 'داخل الامتحان بثقتي فقط',                   'collection', 'egyptian-vibes')),
  ('poster.egyptian-coffee',        null,  800, null, null, 'uncommon',  jsonb_build_object('custom', true, 'poster', true, 'name', 'قهوة وستر ربنا ☕',           'desc', 'بوستر كوميدي',                     'value', 'قهوة وستر ربنا',                            'collection', 'egyptian-vibes')),
  ('poster.egyptian-iconic',        null, 1500, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'الأيقوني ✨',                  'desc', 'بوستر هيبة',                       'value', 'الأيقوني ✨',                               'collection', 'egyptian-vibes')),
  -- هيبة وفخامة
  ('poster.built-different',        null, 1500, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'Built Different 🧱',          'desc', 'بوستر هيبة',                       'value', 'Built Different',                           'collection', 'egyptian-vibes')),
  ('poster.king-never-explains',    null, 1800, null, null, 'legendary', jsonb_build_object('custom', true, 'poster', true, 'name', 'The King Never Explains 👑',  'desc', 'بوستر هيبة',                       'value', 'The King Never Explains',                   'collection', 'egyptian-vibes')),
  ('poster.main-character-energy',  null, 1800, null, null, 'legendary', jsonb_build_object('custom', true, 'poster', true, 'name', 'Main Character Energy ⭐',    'desc', 'بوستر هيبة',                       'value', 'Main Character Energy',                     'collection', 'egyptian-vibes')),
  -- تخصصات
  ('poster.hack-the-future',        null, 1200, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'Cyber: Hack the Future 🖥️',  'desc', 'بوستر تخصص — أمن معلومات',         'value', 'Hack the Future',                           'collection', 'egyptian-vibes')),
  ('poster.intelligence-is-power',  null, 1200, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'AI: Intelligence Is Power 🤖','desc', 'بوستر تخصص — ذكاء اصطناعي',        'value', 'Intelligence Is Power',                     'collection', 'egyptian-vibes')),
  ('poster.designed-to-solve',      null, 1200, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'Engineering: Designed to Solve ⚙️','desc', 'بوستر تخصص — هندسة',        'value', 'Designed to Solve',                         'collection', 'egyptian-vibes')),
  ('poster.built-to-save',          null, 1200, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'Medicine: Built to Save 🩺',  'desc', 'بوستر تخصص — طب',                  'value', 'Built to Save',                             'collection', 'egyptian-vibes')),
  ('poster.built-to-lead',          null, 1200, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'Business: Built to Lead 💼',  'desc', 'بوستر تخصص — إدارة أعمال',         'value', 'Built to Lead',                             'collection', 'egyptian-vibes'))
on conflict (id) do update set
  price = excluded.price,
  credits_price = excluded.credits_price,
  unlock = excluded.unlock,
  rarity = excluded.rarity,
  metadata = excluded.metadata,
  slot = excluded.slot;

-- ----------------------------------------------------------------------------
-- ٣) أفاتار مصري — بداية Collection الشخصيات
-- ----------------------------------------------------------------------------
insert into public.shop_catalog (id, slot, price, credits_price, unlock, rarity, metadata) values
  ('avatar.egyptian-dahih', 'avatar', 2500, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'الدحيح 🧠', 'desc', 'الطالب العبقري اللي فاهم كل حاجة', 'value', '🧠', 'collection', 'egyptian-vibes'))
on conflict (id) do update set
  price = excluded.price,
  credits_price = excluded.credits_price,
  unlock = excluded.unlock,
  rarity = excluded.rarity,
  metadata = excluded.metadata,
  slot = excluded.slot;

SELECT
  count(*) FILTER (WHERE metadata->>'collection' = 'egyptian-vibes' AND slot = 'title')  AS egyptian_titles,
  count(*) FILTER (WHERE metadata->>'collection' = 'egyptian-vibes' AND metadata->>'poster' = 'true') AS egyptian_posters,
  count(*) FILTER (WHERE metadata->>'collection' = 'egyptian-vibes' AND slot = 'avatar') AS egyptian_avatars
FROM public.shop_catalog;

COMMIT;
