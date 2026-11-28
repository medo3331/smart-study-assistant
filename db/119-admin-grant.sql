-- db/119 — Admin grant: تفعيل منح الكوينز من لوحة الإدارة (D-M-06 Economy Balancing)
-- يفعّل قاعدة admin_grant الموجودة في coin_source_rules (كانت is_live=false)
-- بحيث يقدر الأدمن يضيف Coins لمستخدم من /admin/economy عبر add_coins_grant
-- (source_class='admin' — مسموح، والرصيد بيمر على نفس الـ ledger والحمايات).

BEGIN;

UPDATE public.coin_source_rules
SET is_live = true,
    amount = 100,
    daily_cap = 5
WHERE id = 'admin_grant';

SELECT id, amount, daily_cap, is_live FROM public.coin_source_rules WHERE id = 'admin_grant';

COMMIT;
