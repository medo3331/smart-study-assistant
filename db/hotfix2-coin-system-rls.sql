-- ============================================================
-- HOTFIX 2 — Coin System RLS Policies
-- تاريخ: ٢٠٢٦-٠٩-٢٣
-- ============================================================
--
-- المشكلة:
--   Trigger handle_signup_bonus بيفشل لما بيحاول insert في coin_ledger/coin_wallets
--   لأن مفيش INSERT policy على الجداول دي.
--
-- الحل:
--   إضافة RLS policies للقراءة فقط (owner reads)
--   الـinsert/update/delete يحصل عبر SECURITY DEFINER functions فقط
--   (نفس نمط audit_log و rewards_issued)
-- ============================================================

-- 1) coin_wallets
ALTER TABLE public.coin_wallets ENABLE ROW LEVEL SECURITY;

-- Owner reads their wallet
DROP POLICY IF EXISTS "coin_wallets: owner reads" ON public.coin_wallets;
CREATE POLICY "coin_wallets: owner reads"
  ON public.coin_wallets FOR SELECT
  USING (auth.uid() = user_id);

-- Block client insert/update/delete (only SECURITY DEFINER can write)
DROP POLICY IF EXISTS "coin_wallets: no client insert" ON public.coin_wallets;
CREATE POLICY "coin_wallets: no client insert"
  ON public.coin_wallets FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "coin_wallets: no client update" ON public.coin_wallets;
CREATE POLICY "coin_wallets: no client update"
  ON public.coin_wallets FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "coin_wallets: no client delete" ON public.coin_wallets;
CREATE POLICY "coin_wallets: no client delete"
  ON public.coin_wallets FOR DELETE
  USING (false);

-- 2) coin_ledger
ALTER TABLE public.coin_ledger ENABLE ROW LEVEL SECURITY;

-- Owner reads their transactions
DROP POLICY IF EXISTS "coin_ledger: owner reads" ON public.coin_ledger;
CREATE POLICY "coin_ledger: owner reads"
  ON public.coin_ledger FOR SELECT
  USING (auth.uid() = user_id);

-- Block client insert/update/delete (only SECURITY DEFINER can write)
DROP POLICY IF EXISTS "coin_ledger: no client insert" ON public.coin_ledger;
CREATE POLICY "coin_ledger: no client insert"
  ON public.coin_ledger FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "coin_ledger: no client update" ON public.coin_ledger;
CREATE POLICY "coin_ledger: no client update"
  ON public.coin_ledger FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "coin_ledger: no client delete" ON public.coin_ledger;
CREATE POLICY "coin_ledger: no client delete"
  ON public.coin_ledger FOR DELETE
  USING (false);

-- ============================================================
-- ملاحظات:
-- ============================================================
-- 1. SECURITY DEFINER functions تتخطى RLS تلقائياً في معظم إعدادات Supabase
-- 2. لكن لو RLS مفعّل بدون أي policy، حتى SECURITY DEFINER ممكن يفشل في بعض الحالات
-- 3. الـpolicies دي تضمن: القراءة للمالك فقط + منع الكتابة المباشرة من الكلاينت
-- 4. الكتابة تحصل فقط عبر:
--    - handle_signup_bonus() trigger (SECURITY DEFINER)
--    - award_coins() function (SECURITY DEFINER)
--    - claim_signup_bonus() / claim_daily_login() (SECURITY DEFINER)
