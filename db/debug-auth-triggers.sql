-- تحقق من جميع الـtriggers على auth.users
SELECT
  t.trigger_name,
  t.event_manipulation,
  t.action_timing,
  t.action_statement,
  p.proname as function_name
FROM information_schema.triggers t
LEFT JOIN pg_proc p ON t.action_statement LIKE '%' || p.proname || '%'
WHERE t.event_object_schema = 'auth'
  AND t.event_object_table = 'users'
ORDER BY t.trigger_name;

-- تحقق من RLS على coin_ledger و subscription_quotas (الجداول اللي ممكن تتأثر بـsignup)
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('coin_ledger', 'subscription_quotas', 'profiles', 'audit_log')
  AND schemaname = 'public';

-- تحقق من policies على coin_ledger
SELECT
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'coin_ledger'
ORDER BY cmd, policyname;
