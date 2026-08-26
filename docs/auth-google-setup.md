# 🔑 تشغيل زرار Google — خطوات الإعداد (مرة واحدة)

> **الحالة الحالية:** قرار المرحلة إن زرار Google يظهر بحالة «قريبًا»
> زي زرار الموبايل لحد ما الخطوات دي تخلص. الكود الفعلي جاهز في
> `components/AuthProviders.tsx` — التفعيل = استبدال `GoogleSoonButton`
> بـ `GoogleAuthButton` في `ProviderRow` (سطر واحد).

الكود جاهز بالكامل (`components/AuthProviders.tsx`). الزرار هيشتغل أول ما
الخطوات دي تخلص. مفيش أي تعديل كود إضافي مطلوب بعدها.

## ١) من Google Cloud Console

1. افتح <https://console.cloud.google.com/> واعمل مشروع جديد (أو اختار موجود).
2. من القائمة: **APIs & Services → OAuth consent screen**
   - User Type: **External**
   - App name: `Magiclly` + إيميل الدعم
   - Scopes: سيبهم زي ما هم (default) — مش محتاجين scopes حساسة
   - Test users: ضيف إيميلك أثناء التجربة (بعد النشر مش هتحتاج)
3. **Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins:**
     - `http://localhost:3000`  ← للتطوير
     - `https://<دومينك>`  ← الإنتاج (نفس قيمة NEXT_PUBLIC_SITE_URL)
   - **Authorized redirect URIs:** ← ده أهم سطر، انسخه بالظبط من Supabase (خطوة ٢.٤ تحت):
     - `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

## ٢) من لوحة Supabase

1. افتح مشروعك → **Authentication → Providers → Google**
2. فعّل المفتاح (Enable)
3. الصق **Client ID** و **Client Secret** من خطوة ١.٣
4. في نفس الصفحة هتلاقي **Callback URL (for OAuth)** — انسخه وحطه في
   Authorized redirect URIs عند Google (خطوة ١.٣)
5. حفظ.

## ٣) تأكد من Redirect URLs مسموحة

في **Authentication → URL Configuration → Redirect URLs** لازم تكون موجودة:

- `http://localhost:3000/**`  ← للتطوير
- `https://<دومينك>/**`       ← للإنتاج

(الكود بيستخدم `/auth/callback?next=...` الموجود أصلًا وبيتعامل مع الكود.)

## ٤) خلاص ✅

اعمل deploy/تحديث للموقع — زرار «المتابعة بحساب Google» هيشتغل مباشرة:
أول دخول بـGoogle بيعمل حساب تلقائي، والأونبوردنج هيستقبله زي أي مستخدم جديد.

---

## 📱 ليه زرار الهاتف «قريبًا»؟

الدخول برقم الموبايل (OTP عبر SMS) محتاج مزود مدفوع مثل **Twilio** أو
**MessageBird** مربوط بحساب Supabase (Authentication → Providers → Phone).
قرار المرحلة دي: الزرار يظهر بحالة «قريبًا» عشان الشكل النهائي يبان.
لما تقرر تفعّله: افتح حساب Twilio، اربط المفاتيح في Supabase، وبعدها
نستبدل مكوّن `PhoneSoonButton` بزرار OTP حقيقي (نص ساعة شغل).

## ✉️ وربط Resend لتأكيد البريد (اتفقنا عليه)

Supabase بيسمح بـSMTP مخصوص: **Project Settings → Authentication → SMTP Settings**

| الإعداد | القيمة |
|---|---|
| Sender email | إيميل مُوثّق في Resend (مثل `auth@yourdomain.com`) |
| Sender name | `Magiclly` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | مفتاح RESEND_API_KEY الموجود عندك |

وبعدها عدّل قوالب الرسائل من **Authentication → Emails Templates**
لو حابب تخليها بالعربي وهويتك. التأكيد يفضل مفعّل زي ما هو.
