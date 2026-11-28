-- ============================================================================
-- 121 — YOUTH VIBES ⚽ كورة & شباب + STORE ASSETS BUCKET (DEV-M3 جزء ٤)
-- التاريخ: ٢٨ نوفمبر ٢٠٢٦
--
-- ١) Collection جديدة: كورة والترفيه اللي بيحبه الشباب (posters/titles/avatars)
--    كلها metadata.custom=true + collection='youth-vibes' — قابلة للتعديل
--    من /admin/store-items زي باقي العناصر المخصصة.
-- ٢) Bucket للتخزين (store-assets) — المالك يرفع تصميمات البوسترز منه،
--    والقراءة عامة والكتابة service-role فقط (مفيش سياسات كتابة للعملاء).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) عناصر كورة & شباب
-- ----------------------------------------------------------------------------
insert into public.shop_catalog (id, slot, price, credits_price, unlock, rarity, metadata) values
  -- كورة — Posters
  ('poster.football-dm',          null,  800, null, null, 'uncommon',  jsonb_build_object('custom', true, 'poster', true, 'name', 'الكورة في دمنا ⚽',       'desc', 'بوستر كورة', 'value', 'الكورة في دمنا',                        'collection', 'youth-vibes')),
  ('poster.football-goal',        null,  500, null, null, 'common',    jsonb_build_object('custom', true, 'poster', true, 'name', 'جول ولا لأ؟ ⚽',           'desc', 'بوستر كورة', 'value', 'جول ولا لأ؟',                           'collection', 'youth-vibes')),
  ('poster.football-90min',       null,  800, null, null, 'uncommon',  jsonb_build_object('custom', true, 'poster', true, 'name', '٩٠ دقيقة ⏱️',             'desc', 'بوستر كورة', 'value', '٩٠ دقيقة وبعدها الدنيا تحلى',           'collection', 'youth-vibes')),
  ('poster.football-liona',       null, 1200, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'قلب الليونة 🎩',          'desc', 'بوستر كورة', 'value', 'قلب الليونة',                           'collection', 'youth-vibes')),
  ('poster.football-match-night', null, 1000, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'ليلة الماتش 🏟️',          'desc', 'بوستر كورة', 'value', 'ماتش الليلة أهم من أي حاجة',            'collection', 'youth-vibes')),
  ('poster.football-ahly',        null, 1000, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'أهلاوي 🔴',               'desc', 'بوستر تشجيع', 'value', 'أهلاوي حتى النخاع 🔴',                  'collection', 'youth-vibes')),
  ('poster.football-zamalek',     null, 1000, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'زملكاوي ⚪',              'desc', 'بوستر تشجيع', 'value', 'زملكاوي صرف ⚪',                        'collection', 'youth-vibes')),
  ('poster.football-ucl',         null, 1200, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'دوري الأبطال 🏆',         'desc', 'بوستر كورة', 'value', 'ليلة دوري الأبطال مش بتتنسي',           'collection', 'youth-vibes')),
  -- جيمينج ومزاج الشباب — Posters
  ('poster.gaming-one-match',     null,  800, null, null, 'uncommon',  jsonb_build_object('custom', true, 'poster', true, 'name', 'ماتش واحد وبنم 🎮',       'desc', 'بوستر جيمينج', 'value', 'ماتش واحد وبنم… وأخرة فجر',            'collection', 'youth-vibes')),
  ('poster.gaming-rank',          null, 1000, null, null, 'rare',      jsonb_build_object('custom', true, 'poster', true, 'name', 'الليلة نطلع رانك 🎮',     'desc', 'بوستر جيمينج', 'value', 'الليلة نطلع رانك',                     'collection', 'youth-vibes')),
  ('poster.coffee-kora-code',     null,  900, null, null, 'uncommon',  jsonb_build_object('custom', true, 'poster', true, 'name', 'قهوة + كورة + كود ☕⚽',   'desc', 'بوستر مزاج', 'value', 'قهوة + كورة + كود',                    'collection', 'youth-vibes')),
  -- كورة — Titles
  ('title.football-capten',       'title', 2500, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'الكابتن 🧢',          'desc', 'ليدرك في الملعب وفي المذاكرة',  'value', 'الكابتن 🧢',        'collection', 'youth-vibes')),
  ('title.football-hadaf',        'title', 2000, null, null, 'epic',      jsonb_build_object('custom', true, 'name', 'هداف الموسم ⚽',      'desc', 'بيجيب في كل حاجة',             'value', 'هداف الموسم ⚽',     'collection', 'youth-vibes')),
  ('title.football-liona',        'title', 2500, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'قلب الليونة 🎩',      'desc', 'مهارات تجيب الجنون',           'value', 'قلب الليونة 🎩',    'collection', 'youth-vibes')),
  ('title.football-no10',         'title', 3000, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'رقم ١٠ 👑',           'desc', 'صانع الألعاب',                 'value', 'رقم ١٠ 👑',         'collection', 'youth-vibes')),
  ('title.football-keeper',       'title', 1500, null, null, 'rare',      jsonb_build_object('custom', true, 'name', 'الحارس المستحيل 🧤',  'desc', 'مستحيل تجيب فيه',              'value', 'الحارس المستحيل 🧤','collection', 'youth-vibes')),
  ('title.football-ostora',       'title', 3500, null, null, 'legendary', jsonb_build_object('custom', true, 'name', 'أسطورة الكورة 🔥',    'desc', 'اللقب الأغلى للعشاق',          'value', 'أسطورة الكورة 🔥',  'collection', 'youth-vibes')),
  -- جيمينج — Titles
  ('title.gaming-rank-killer',    'title', 1500, null, null, 'rare',      jsonb_build_object('custom', true, 'name', 'قاتل الرانك 🎮',      'desc', 'بتكسب كل يوم',                 'value', 'قاتل الرانك 🎮',    'collection', 'youth-vibes')),
  ('title.gaming-fifa-legend',    'title', 2000, null, null, 'epic',      jsonb_build_object('custom', true, 'name', 'أسطورة الفافا 🕹️',    'desc', 'مفيش حد بيكسبك أونلاين',       'value', 'أسطورة الفافا 🕹️',  'collection', 'youth-vibes')),
  -- Avatars
  ('avatar.football-ball',        'avatar',  800, null, null, 'rare',      jsonb_build_object('custom', true, 'name', 'الكورة ⚽',       'desc', 'كلاسيك مالوش حل',  'value', '⚽', 'collection', 'youth-vibes')),
  ('avatar.football-trophy',      'avatar', 1500, null, null, 'epic',      jsonb_build_object('custom', true, 'name', 'الكأس 🏆',        'desc', 'للمتصدرين بس',     'value', '🏆', 'collection', 'youth-vibes')),
  ('avatar.gaming-pad',           'avatar',  800, null, null, 'rare',      jsonb_build_object('custom', true, 'name', 'يد الجيمينج 🎮',  'desc', 'عاشق اللعب',       'value', '🎮', 'collection', 'youth-vibes'))
on conflict (id) do update set
  price = excluded.price,
  credits_price = excluded.credits_price,
  unlock = excluded.unlock,
  rarity = excluded.rarity,
  metadata = excluded.metadata,
  slot = excluded.slot;

-- ----------------------------------------------------------------------------
-- ٢) Bucket لتصاميم البوسترز — قراءة عامة، كتابة service-role فقط
--    (الرفع بيتم من server action بأدمن Owner — مفيش صلاحيات كتابة للعملاء)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('store-assets', 'store-assets', true)
on conflict (id) do update set public = true;

SELECT
  count(*) FILTER (WHERE metadata->>'collection' = 'youth-vibes') AS youth_items,
  count(*) FILTER (WHERE metadata->>'collection' = 'youth-vibes' AND metadata->>'poster' = 'true') AS youth_posters
FROM public.shop_catalog;

COMMIT;
