-- ============================================================
-- Admin messaging, inbox & announcements
-- ============================================================
-- Forward-only. Not executed here.

CREATE TABLE IF NOT EXISTS public.admin_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid,
  subject text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all', -- all | user
  target_user_id uuid,
  send_email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  announcement_id uuid REFERENCES public.admin_announcements(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid REFERENCES public.admin_announcements(id) ON DELETE SET NULL,
  user_id uuid,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed | not_configured
  provider_message_id text,
  error text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_inbox_user ON public.user_inbox(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_ann ON public.email_deliveries(announcement_id);

-- RLS
ALTER TABLE public.admin_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

-- admin_announcements: service role / admin reads; (policies rely on app-level admin auth)
DROP POLICY IF EXISTS "admin_announcements service read" ON public.admin_announcements;
CREATE POLICY "admin_announcements service read" ON public.admin_announcements FOR SELECT USING (true);

-- user_inbox: users can read/update their own
DROP POLICY IF EXISTS "user_inbox own read" ON public.user_inbox;
CREATE POLICY "user_inbox own read" ON public.user_inbox FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_inbox own update" ON public.user_inbox;
CREATE POLICY "user_inbox own update" ON public.user_inbox FOR UPDATE USING (auth.uid() = user_id);

-- email_deliveries: no client access (admin via service role)
DROP POLICY IF EXISTS "email_deliveries no client" ON public.email_deliveries;
CREATE POLICY "email_deliveries no client" ON public.email_deliveries FOR SELECT USING (false);
