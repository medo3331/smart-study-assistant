-- ============================================================================
-- P1-B2.2 — Smart Notes Feature Discovery
-- Date: 2026-11-20
-- Branch: feat/engagement-p1b2-discovery
--
-- GOAL (vertical slice #2):
--   بناء كتالوج مميزات مركزي + حالة اكتشاف لكل مستخدم، وربط Smart Notes
--   فيه كميزة **متاحة تحت التطوير المستمر** (قرار P1-A المُصحَّح).
--
--   دورة الاكتشاف:
--     undiscovered → introduced → tried → adopted
--     - introduced : عُرضت للمستخدم رسالة تعريف (حدث من السيرفر).
--     - tried      : نفّذ فعلًا حقيقيًا (حفظ نوتة) — مش مجرد فتح.
--     - adopted    : استخدمها بشكل متكرر على **أيام كايرو مختلفة** (مش تكرار
--                    الحدث الواحد).
--
-- ⚠️ ممنوع في هذه المرحلة: Coins، XP، Daily/Weekly Missions، Push
--    Notifications، أو أي تعديل على نظام المكافآت. هذا الملف جدول حالة
--    واكتشاف فقط.
--
-- ⚠️ **مستوى الثقة**:
--   - `tried` مش متطلّع من العميل مباشرة: الـDB يشتقّه من وجود حدث
--     موثّق (`notes_saved`) في `engagement_events` — وده حدث client_reported،
--     فالتشديد بيحصل في الطبقة الأعلى (P1-C): إثبات المكافأة بيتقبل من
--     server_verified بس.
--   - `adopted` محسوب من **أيام كايرو مختلفة** ⇒ تكرار الحدث الواحد مايعدّش
--     استخدام متكرر.
--
-- ── ROLLBACK ──────────────────────────────────────────────────────────────
--   drop table if exists public.user_feature_discovery;
--   drop table if exists public.feature_catalog;
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- ١) كتالوج المميزات
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_catalog (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  route text,
  icon text,
  -- available            : متاحة بالكامل
  -- under_development    : متاحة للمستخدم، لكن لسه في تطوير مستمر
  -- unavailable          : غير متاحة (Community Groups)
  -- planned / future     : مستقبلية (Rewarded Ads)
  availability text NOT NULL DEFAULT 'available',
  -- هل تدخل في دورة Discovery (متاح للظهور)؟
  is_discoverable boolean NOT NULL DEFAULT false,
  -- نص التعريف اللي بيظهر للمستخدم (مختصر، بدون وعود بغير موجود)
  discovery_copy text,
  -- نص التلميح بعد ما المستخدم جرّب الميزة (Adopted)
  tip_copy text,
  -- عتبة التبنّي: عدد أيام كايرو المختلفة اللي بتعتبر “استخدام متكرر”
  adoption_min_days int NOT NULL DEFAULT 3,
  min_plan text,
  priority int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT feature_catalog_availability_check CHECK (
    availability IN ('available', 'under_development', 'unavailable', 'planned')
  ),
  CONSTRAINT feature_catalog_adoption_min_days_check CHECK (
    adoption_min_days BETWEEN 1 AND 30
  ),
  CONSTRAINT feature_catalog_label_check CHECK (
    char_length(trim(label)) > 0 AND char_length(label) <= 120
  )
);

COMMENT ON TABLE public.feature_catalog IS
  'Central feature catalog for the Engagement Engine. availability reflects reality; discoverable features can appear in discovery surfaces.';

COMMENT ON COLUMN public.feature_catalog.availability IS
  'available | under_development (usable, still evolving) | unavailable | planned.';

COMMENT ON COLUMN public.feature_catalog.adoption_min_days IS
  'How many distinct Cairo days of real usage count as adoption (not repeated events).';

ALTER TABLE public.feature_catalog ENABLE ROW LEVEL SECURITY;

-- الكتالوج قراءة فقط للعميل، والكتابة للمالك فقط (service/definer).
REVOKE ALL ON TABLE public.feature_catalog FROM anon;
REVOKE ALL ON TABLE public.feature_catalog FROM authenticated;

DROP POLICY IF EXISTS feature_catalog_authenticated_read ON public.feature_catalog;
CREATE POLICY feature_catalog_authenticated_read
  ON public.feature_catalog
  FOR SELECT
  TO authenticated
  USING (is_active = true);

GRANT SELECT ON TABLE public.feature_catalog TO authenticated;

-- ----------------------------------------------------------------------------
-- ٢) حالة اكتشاف كل مستخدم
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_feature_discovery (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.feature_catalog(key) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'undiscovered',
  introduced_at timestamptz,
  tried_at timestamptz,
  adopted_at timestamptz,
  last_seen_at timestamptz,
  -- عدد مرات تجاهل المستخدم للتعريف (3 ⇒ وقف إزعاج)
  dismiss_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_feature_discovery_state_check CHECK (
    state IN ('undiscovered', 'introduced', 'tried', 'adopted')
  ),
  CONSTRAINT user_feature_discovery_dismiss_count_check CHECK (
    dismiss_count >= 0
  ),
  CONSTRAINT user_feature_discovery_pk PRIMARY KEY (user_id, feature_key)
);

COMMENT ON TABLE public.user_feature_discovery IS
  'Per-user Feature Discovery state. Rows are written only by definer functions; the client can read its own rows.';

CREATE INDEX IF NOT EXISTS idx_user_feature_discovery_user
  ON public.user_feature_discovery (user_id);

CREATE INDEX IF NOT EXISTS idx_user_feature_discovery_feature_state
  ON public.user_feature_discovery (feature_key, state);

ALTER TABLE public.user_feature_discovery ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_feature_discovery FROM anon;
REVOKE ALL ON TABLE public.user_feature_discovery FROM authenticated;

-- صاحب السطر يقدر يقرأ حالته بس (مش يعدّل).
DROP POLICY IF EXISTS user_feature_discovery_owner_read ON public.user_feature_discovery;
CREATE POLICY user_feature_discovery_owner_read
  ON public.user_feature_discovery
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON TABLE public.user_feature_discovery TO authenticated;

-- ----------------------------------------------------------------------------
-- ٣) دوال مشتقّة (definer) — كل الكتابة عن طريقها
-- ----------------------------------------------------------------------------

-- ٣.١) تسجيل ظهور التعريف (introduced).
--     الدالة دي هي اللي بتسمح بالتحوّل undisclosed → introduced، وبتقيّد
--     إن الميزة موجودة في الكتالوج且 قابلة للاكتشاف.
CREATE OR REPLACE FUNCTION public.record_feature_introduction(
  p_user_id uuid,
  p_feature_key text,
  p_surface text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.user_feature_discovery%ROWTYPE;
  v_state text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'record_feature_introduction: p_user_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.feature_catalog f
     WHERE f.key = p_feature_key
       AND f.is_active
       AND f.is_discoverable
  ) THEN
    RAISE EXCEPTION 'record_feature_introduction: feature "%" is not discoverable', p_feature_key;
  END IF;

  INSERT INTO public.user_feature_discovery (user_id, feature_key, state, last_seen_at)
  VALUES (p_user_id, p_feature_key, 'introduced', now())
  ON CONFLICT (user_id, feature_key) DO NOTHING;

  -- ماينزلش(state) — التقديم بس. لو المستخدم وصل لـtried/adopted نكتفي.
  UPDATE public.user_feature_discovery
     SET state = CASE
                   WHEN state = 'undiscovered' THEN 'introduced'
                   ELSE state
                 END,
         introduced_at = COALESCE(introduced_at, now()),
         last_seen_at = now(),
         updated_at = now()
   WHERE user_id = p_user_id
     AND feature_key = p_feature_key
  RETURNING * INTO v_row;

  v_state := COALESCE(v_row.state, 'introduced');

  RETURN jsonb_build_object(
    'state', v_state,
    'introduced', true,
    'introduced_at', v_row.introduced_at
  );
END;
$$;

COMMENT ON FUNCTION public.record_feature_introduction(uuid, text, text) IS
  'Marks a feature as introduced for a user. Never downgrades a state. service_role only.';

REVOKE ALL ON FUNCTION public.record_feature_introduction(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_feature_introduction(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_feature_introduction(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_feature_introduction(uuid, text, text) TO service_role;

-- ٣.٢) اشتقاق حالة الاكتشاف من الأحداث الموثّقة.
--     - tried   : فيه حدث "تجربة" واحد على الأقل (feature_trial_event).
--     - adopted : فيه استخدام على adoption_min_days يوم كايرو مختلف على الأقل.
--     الدالة **بتشتق** من `engagement_events` — مش من طلب العميل.
CREATE OR REPLACE FUNCTION public.refresh_feature_discovery_state(
  p_user_id uuid,
  p_feature_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_feature public.feature_catalog%ROWTYPE;
  v_trial_events text[];
  v_use_events text[];
  v_trial_count int := 0;
  v_days int := 0;
  v_state text := 'undiscovered';
  v_introduced_at timestamptz;
  v_existing public.user_feature_discovery%ROWTYPE;
  v_new_state text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'refresh_feature_discovery_state: p_user_id is required';
  END IF;

  SELECT * INTO v_feature
    FROM public.feature_catalog f
   WHERE f.key = p_feature_key
     AND f.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refresh_feature_discovery_state: unknown feature "%"', p_feature_key;
  END IF;

  -- الأحداث اللي بتعتبر “تجربة” واللي بتعتبر “استخدام متكرر”.
  -- ملاحظة: مصدر واحد بس في P1-B2.2 — Smart Notes.
  v_trial_events := CASE WHEN p_feature_key = 'smart_notes'
    THEN ARRAY['notes_saved', 'feature_tried']::text[]
    ELSE ARRAY[]::text[]
  END;

  v_use_events := CASE WHEN p_feature_key = 'smart_notes'
    THEN ARRAY['notes_saved']::text[]
    ELSE ARRAY[]::text[]
  END;

  IF cardinality(v_trial_events) > 0 THEN
    SELECT count(*)::int INTO v_trial_count
      FROM public.engagement_events e
     WHERE e.user_id = p_user_id
       AND e.event_type = ANY (v_trial_events);

    SELECT count(DISTINCT (e.occurred_at AT TIME ZONE 'Africa/Cairo')::date)::int INTO v_days
      FROM public.engagement_events e
     WHERE e.user_id = p_user_id
       AND e.event_type = ANY (v_use_events);
  END IF;

  -- ترتيب الحالات: adopted > tried > introduced > undiscovered.
  IF v_days >= v_feature.adoption_min_days THEN
    v_state := 'adopted';
  ELSIF v_trial_count > 0 THEN
    v_state := 'tried';
  END IF;

  SELECT * INTO v_existing
    FROM public.user_feature_discovery d
   WHERE d.user_id = p_user_id
     AND d.feature_key = p_feature_key;

  v_introduced_at := v_existing.introduced_at;

  IF v_state = 'undiscovered' THEN
    IF v_existing.state IS NULL THEN
      RETURN jsonb_build_object('state', 'undiscovered', 'changed', false, 'trial_events', v_trial_count, 'active_days', v_days);
    END IF;
    v_state := v_existing.state;   -- ماينزلش من حالة أعلى
  ELSIF v_existing.state IS NULL OR v_existing.state = 'undiscovered' THEN
    -- أول استخدام: نبدأ من حالة "introduced" زمنيًا
    v_introduced_at := COALESCE(v_introduced_at, now());
  END IF;

  -- ترتيب الأسبقية عشان نمنع التراجع.
  v_new_state := CASE
    WHEN v_state = 'adopted' THEN 'adopted'
    WHEN v_state = 'tried' THEN 'tried'
    WHEN v_existing.state = 'adopted' THEN 'adopted'
    WHEN v_existing.state = 'tried' THEN 'tried'
    WHEN v_state = 'introduced' THEN 'introduced'
    WHEN v_existing.state = 'introduced' THEN 'introduced'
    ELSE 'undiscovered'
  END;

  INSERT INTO public.user_feature_discovery (
    user_id, feature_key, state, introduced_at, tried_at, adopted_at, last_seen_at, updated_at
  )
  VALUES (
    p_user_id,
    p_feature_key,
    v_new_state,
    v_introduced_at,
    CASE WHEN v_new_state IN ('tried','adopted') THEN COALESCE(v_existing.tried_at, now()) ELSE v_existing.tried_at END,
    CASE WHEN v_new_state = 'adopted' THEN COALESCE(v_existing.adopted_at, now()) ELSE v_existing.adopted_at END,
    now(),
    now()
  )
  ON CONFLICT (user_id, feature_key) DO UPDATE SET
    state = EXCLUDED.state,
    introduced_at = COALESCE(user_feature_discovery.introduced_at, EXCLUDED.introduced_at),
    tried_at = COALESCE(user_feature_discovery.tried_at, EXCLUDED.tried_at),
    adopted_at = COALESCE(user_feature_discovery.adopted_at, EXCLUDED.adopted_at),
    last_seen_at = now(),
    updated_at = now();

  RETURN jsonb_build_object(
    'state', v_new_state,
    'changed', v_new_state IS DISTINCT FROM v_existing.state,
    'trial_events', v_trial_count,
    'active_days', v_days,
    'adoption_min_days', v_feature.adoption_min_days
  );
END;
$$;

COMMENT ON FUNCTION public.refresh_feature_discovery_state(uuid, text) IS
  'Derives a user feature-discovery state from verified engagement events. Never downgrades. service_role only.';

REVOKE ALL ON FUNCTION public.refresh_feature_discovery_state(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_feature_discovery_state(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_feature_discovery_state(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_feature_discovery_state(uuid, text) TO service_role;

-- ٣.٣) قراءة الحالة (للتطبيق) — owner read.
CREATE OR REPLACE FUNCTION public.get_feature_discovery_state(
  p_user_id uuid,
  p_feature_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.user_feature_discovery%ROWTYPE;
  v_feature public.feature_catalog%ROWTYPE;
BEGIN
  SELECT * INTO v_feature
    FROM public.feature_catalog f
   WHERE f.key = p_feature_key AND f.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'get_feature_discovery_state: unknown feature "%"', p_feature_key;
  END IF;

  SELECT * INTO v_row
    FROM public.user_feature_discovery d
   WHERE d.user_id = p_user_id
     AND d.feature_key = p_feature_key;

  RETURN jsonb_build_object(
    'feature_key', p_feature_key,
    'availability', v_feature.availability,
    'label', v_feature.label,
    'route', v_feature.route,
    'is_discoverable', v_feature.is_discoverable,
    'discovery_copy', v_feature.discovery_copy,
    'tip_copy', v_feature.tip_copy,
    'state', COALESCE(v_row.state, 'undiscovered'),
    'introduced_at', v_row.introduced_at,
    'tried_at', v_row.tried_at,
    'adopted_at', v_row.adopted_at,
    'dismiss_count', COALESCE(v_row.dismiss_count, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_feature_discovery_state(uuid, text) IS
  'Returns the discovery state of one feature for one user. Read-only.';

REVOKE ALL ON FUNCTION public.get_feature_discovery_state(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_feature_discovery_state(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_feature_discovery_state(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_feature_discovery_state(uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- ٤) بذر الكتالوج
--    ⚠️ Smart Notes: **متاحة تحت التطوير المستمر** (قرار P1-A المُصحَّح).
--       بن promoting الوظائف الموجودة فعلًا بس.
-- ----------------------------------------------------------------------------
INSERT INTO public.feature_catalog
  (key, label, description, route, icon, availability, is_discoverable,
   discovery_copy, tip_copy, adoption_min_days, priority, is_active)
VALUES
  ('smart_notes', 'النوتس الذكية', 'Smart Notes — النوتس الذكية',
   '/notes', 'notebook-pen', 'under_development', true,
   'تعرف إنك تقدر تكتب وترسم وتجمع صور محاضرتك في نوتة واحدة؟',
   'جرّب تتبّع نقطة ضعف واحدة في نوتة، واربطها بالمحاضرة نفسها.',
   3, 10, true),
  ('smart_exam', 'الامتحانات الذكية', 'Smartly — محرك الامتحانات الذكي',
   '/exams', 'file-check-2', 'available', false,
   NULL, NULL, 3, 20, true),
  ('magic_ai', 'المساعد الذكي', 'Magicly — المساعد الذكي',
   '/chat', 'sparkles', 'available', false,
   NULL, NULL, 3, 30, true),
  ('lectures', 'المحاضرات', 'المحاضرات والملفات',
   '/lectures', 'mic-2', 'available', false,
   NULL, NULL, 3, 40, true),
  ('planner', 'التخطيط والأهداف', 'التخطيط والأهداف',
   '/dashboard/planner', 'target', 'available', false,
   NULL, NULL, 3, 50, true),
  ('games', 'الألعاب', 'الألعاب والترفيه',
   '/break', 'gamepad-2', 'available', false,
   NULL, NULL, 3, 60, true),
  ('community_groups', 'مجموعات المجتمع', 'مجموعات المجتمع',
   NULL, 'users', 'unavailable', false,
   NULL, NULL, 3, 90, true),
  ('rewarded_ads', 'إعلانات مكافأة', 'إعلانات المكافأة',
   NULL, 'badge-dollar-sign', 'planned', false,
   NULL, NULL, 3, 99, true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  route = EXCLUDED.route,
  icon = EXCLUDED.icon,
  availability = EXCLUDED.availability,
  is_discoverable = EXCLUDED.is_discoverable,
  discovery_copy = EXCLUDED.discovery_copy,
  tip_copy = EXCLUDED.tip_copy,
  adoption_min_days = EXCLUDED.adoption_min_days,
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  updated_at = now();

COMMIT;
