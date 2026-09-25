-- تحقق من جميع RLS policies الموجودة حاليًا
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  CASE
    WHEN qual IS NOT NULL THEN 'USING clause exists'
    ELSE 'No USING clause'
  END as has_using,
  CASE
    WHEN with_check IS NOT NULL THEN 'WITH CHECK exists'
    ELSE 'No WITH CHECK'
  END as has_with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'coin_wallets', 'coin_ledger', 'subscription_quotas')
ORDER BY tablename, cmd, policyname;

-- تحقق من أي UNIQUE constraints على coin_ledger اللي ممكن تفشل
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('coin_ledger', 'coin_wallets')
  AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.table_name, tc.constraint_name;

-- تحقق من triggers على profiles
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'profiles'
ORDER BY trigger_name;
