# HOTFIX — Guest Login 500 + Syntax Error Diagnosis

## التشخيص الأولي (2026-09-23)

### الأعراض
1. **Syntax Error**: `Uncaught SyntaxError: Unexpected token ')'` في `/login?next=/assessment`
2. **500 Error**: طلب `/auth/v1/signup` يرجع 500 من Supabase Auth

### الفحص المبدئي

#### 1. فحص الـSyntax Error
- **الملف المشتبه به**: `app/login/page.tsx`
- **النتيجة**: لا يوجد خطأ syntax واضح في الكود المصدري
- **TypeScript check**: لم ينجح بسبب مشكلة network (npm registry)
- **الاستنتاج**: الخطأ قد يكون من:
  - Build/minification issue (يحتاج build ناجح للتحقق)
  - Browser cache (ملف قديم محفوظ)
  - Missing closing tag في component مستورد

#### 2. فحص الـ500 Error من Supabase Auth

**السبب المحتمل الأقوى**: مشكلة في إنشاء الـprofile بعد التسجيل.

##### الآلية الحالية:
1. عند guest login: `supabase.auth.signInAnonymously()` ← ينشئ user في `auth.users`
2. عند signup: `supabase.auth.signUp()` ← ينشئ user في `auth.users`
3. **المشكلة**: الكود بينشئ profile يدويًا من `app/assessment/page.tsx` (السطر 402):
   ```typescript
   await supabase.from("profiles").insert({ 
     id: currentUser.id, 
     xp: 0, 
     streak: 1, 
     theme: "amber", 
     ...personaFields 
   });
   ```

##### الـTrigger الموجود:
- `db/epic6-user-code.sql` يحتوي على trigger `set_public_user_code`
- يشتغل على `BEFORE INSERT OR UPDATE ON public.profiles`
- يولد `public_user_code` تلقائيًا بصيغة `MAG-XXX-XXXX`

##### المشاكل المحتملة:

**أ) RLS Policy مفقودة**:
- لم أجد أي `CREATE POLICY` للـinsert على `profiles` في الملفات
- إذا كانت RLS مفعلة بدون policy للـinsert، الـinsert سيفشل
- **الدليل**: البحث في جميع ملفات SQL عن `policy.*profiles.*insert` لم يرجع نتائج

**ب) Trigger failure**:
- لو حصل collision في `public_user_code` (UNIQUE constraint)
- لو الـfunction `generate_public_user_code()` فشلت

**ج) Concurrent insert attempt**:
- لو Supabase Auth Hook بتحاول تنشئ profile تلقائيًا
- ويحصل race condition مع الكود

### السبب الجذري المؤكد

**المشكلة**: `db/economy-phase-b.sql` (السطر 65-86) يحذف جميع UPDATE policies على profiles ويعيد إنشاء واحدة فقط، لكن **لا يوجد أي INSERT policy**.

```sql
-- السطر 65-74: يحذف كل UPDATE policies
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND cmd='UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

-- السطر 80-86: ينشئ UPDATE policy فقط
create policy "profiles: owner updates (xp protected)"
on public.profiles for update
using (auth.uid() = id)
with check (...);

-- ❌ لا يوجد CREATE POLICY للـINSERT
```

**النتيجة**: 
- عند `supabase.auth.signInAnonymously()` ← Supabase Auth ينشئ user في `auth.users` بنجاح
- عند محاولة insert profile من `app/assessment/page.tsx` ← **يفشل بسبب RLS** (no INSERT policy)
- Supabase Auth يرجع 500 لأن العملية فشلت

### الإصلاح المطلوب

**حل فوري**: إضافة INSERT policy على profiles في ملف SQL جديد:

```sql
-- profiles: allow authenticated users to insert their own profile
CREATE POLICY "profiles: owner insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
```

**ملاحظة مهمة**: الـSyntax Error في `/login?next=/assessment` على الأرجح **browser cache** من build قديم - يحتاج hard refresh (Ctrl+Shift+R) بعد deploy الإصلاح.

### الملفات ذات الصلة
- `app/login/page.tsx` (السطر 160: guest login)
- `app/assessment/page.tsx` (السطر 387-402: profile insert)
- `db/epic6-user-code.sql` (trigger على profiles)
- `db/economy-phase-4-foundation.sql` (trigger آخر على profiles - signup bonus)

### Git Status
- Branch: `progress-experience` 
- Behind origin by 15 commits
- Commit: `b7a5f4c` (EPIC-2/3 upload + quota)
- **ملاحظة**: المستخدم ذكر أن merge لـmain لم يحصل رغم ادعاء Agent سابق

