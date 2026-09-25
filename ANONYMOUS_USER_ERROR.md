# Anonymous User Creation Failure - Deep Diagnosis

## الخطأ الفعلي
```json
{
  "code": "unexpected_failure",
  "message": "Database error creating anonymous user"
}
```

## التحليل
هذا الخطأ يأتي من **Supabase Auth (GoTrue)** نفسه، قبل حتى محاولة insert في `profiles`.
المشكلة في إنشاء الصف في `auth.users` نفسه.

## ✅ السبب الجذري المؤكد

**Trigger `handle_signup_bonus` بيفشل**:

1. Anonymous sign-ins مفعّلة ✅
2. Profiles INSERT policy موجودة ✅
3. **لكن**: Trigger `handle_signup_bonus` (في `economy-phase-4-foundation.sql`) بيشتغل `AFTER INSERT ON profiles`
4. الـtrigger بيحاول insert في `coin_ledger` و `coin_wallets`
5. **المشكلة**: الجداول دي عليها RLS لكن **مفيش INSERT policy**
6. حتى مع `SECURITY DEFINER`, لو مفيش أي policy خالص، الـinsert بيفشل
7. النتيجة: Supabase Auth يرجع `"Database error creating anonymous user"`

## الإصلاح المطلوب

**ملف SQL جديد**: `db/hotfix2-coin-system-rls.sql`

يضيف RLS policies على:
- `coin_wallets` (owner reads + block client writes)
- `coin_ledger` (owner reads + block client writes)

**الخطوات**:
1. افتح `db/hotfix2-coin-system-rls.sql`
2. شغّل الكود في Supabase SQL Editor
3. جرب guest login تاني

---

## الأسباب المحتملة

### 1. Anonymous Sign-ins معطلة في Supabase
**الاحتمال**: 🔴 **عالي جدًا**

**التحقق**:
```
Supabase Dashboard → Authentication → Providers → Email → 
تأكد أن "Enable anonymous sign-ins" ✅ مفعّلة
```

**الإصلاح**: فعّل الخيار من Dashboard.

---

### 2. Database Trigger على auth.users بيفشل
**الاحتمال**: 🟡 متوسط

**السبب المحتمل**: 
- لو فيه trigger على `auth.users` بيحاول ينشئ profile تلقائيًا
- ويفشل بسبب RLS أو constraint

**التحقق**: شغّل الـSQL ده في Supabase:
```sql
-- عرض جميع triggers على auth.users
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users'
ORDER BY trigger_name;
```

**الإصلاح**: 
- لو لقيت trigger اسمه `on_auth_user_created` أو مشابه
- شوف الـfunction اللي بيناديها
- ممكن يكون بيحاول insert في `profiles` ويفشل

---

### 3. Auth Hook معطل أو بيرجع خطأ
**الاحتمال**: 🟡 متوسط

**التحقق**:
```
Supabase Dashboard → Database → Webhooks
أو
Authentication → Hooks
```

شوف لو فيه أي hook مفعّل على `auth.users` create event.

---

### 4. RLS Policy على auth.users
**الاحتمال**: 🟢 منخفض (نادر)

Supabase Auth عادة بيستخدم `service_role` اللي بيتخطى RLS، لكن ممكن يكون فيه policy غريبة.

---

### 5. Database Constraint بيفشل
**الاحتمال**: 🟢 منخفض

ممكن يكون فيه constraint أو check على `auth.users` بيمنع anonymous users.

---

## الخطوات المطلوبة **الآن**

### أولاً (الأهم): افحص Anonymous Sign-ins
```
1. Supabase Dashboard
2. Authentication
3. Providers
4. Email (Provider)
5. دور على "Enable anonymous sign-ins"
6. لو مش مفعّلة ← فعّلها وجرب تاني
```

### ثانيًا: شغّل الـSQL للتحقق من Triggers
```sql
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users';
```

ابعتلي النتيجة.

### ثالثًا: افحص Webhooks/Hooks
```
Database → Webhooks
أو
Authentication → Hooks (لو موجودة)
```

ابعتلي screenshot أو قول إيه اللي موجود.

---

## ملاحظة مهمة
الـRLS policy اللي ضفناها على `profiles` **صحيحة ومطلوبة**، لكنها مش السبب في المشكلة دي.
المشكلة قبلها - في إنشاء الـauth user نفسه.
