-- ============================================================
-- Admin alerts (monitoring)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  details text,
  provider text,
  route text,
  status text NOT NULL DEFAULT 'active', -- active | resolved | acknowledged
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 1,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_status ON public.admin_alerts(status, last_seen_at DESC);

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_alerts no client" ON public.admin_alerts;
CREATE POLICY "admin_alerts no client" ON public.admin_alerts FOR SELECT USING (false);
