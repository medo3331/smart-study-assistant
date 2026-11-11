This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Smoke tests

فحوصات المتصفح الحقيقية (مش HTTP requests بس) — بتشتغل على Edge/Chrome عبر
Chrome DevTools Protocol، وتقيس الحاجة اللي الـ HTTP test مش قادر يقيسها
(هل عنصر متغطّى؟ هل الـ scrollbar اتضاعفت؟ هل الـ composer فوق الـ fold؟).

### `npm run check:navbar`

بيفتح المتصفح وبيقيس **7 صفحات × 2 viewport** (1440×900 و 390×844):

| الفحص | إيه اللي بيتأكد منه |
|---|---|
| `no redirect` | الصفحة ما اتحوّلتش (تحويل = auth redirect = قياس فاشل) |
| `navbar present` | الشريط العلوي بيرندر في الصفحة |
| `navbar height == 56` | ارتفاعه = `--nav-h` بالظبط — لو اتغيّر، الـ `calc(100dvh - var(--nav-h))` في الصفحات اللي بتملأ الشاشة بيبقى غلط |
| `no content covered by navbar` | مفيش عنصر (فهرس/عنوان/زرار) واقع تحت الشريط |
| `no double scrollbar` | مفيش scrollbar مزدوج (الصفحة كلها + واحدة جواها) |
| `chat container fits viewport` | حاوية الشات من تحت الـ nav لحد أسفل الشاشة بالظبط |
| `chat composer visible` | شريط الكتابة في الشات ظاهر فوق الـ fold |

**المطلوب:** `npm run dev` شغّال، وEdge أو Chrome على الجهاز.
السكربت بيشغّل Edge لوحده (headless) على بورت CDP 9222، ويقفله في الآخر.

> السكربت **مش في CI** — محتاج متصفح حقيقي. في CI استخدم
> `npm run typecheck` و `npm run test:all` بس.

```bash
npm run dev          # في ترمنال
npm run check:navbar # في ترمنال تاني
```

النتيجة الكاملة دلوقتي: **74/74 PASS**.

#### تغطية الصفحات المحمية (اختياري)

الصفحات اللي محتاجة تسجيل دخول (زي `/lectures`) بتبقى **SKIP** من غير
session — القياس عليها معناه لا شيء لأن الشريط مش موجود على صفحات الـ
auth أصلاً. لو عايز تغطّيها فعلاً، ادّي السكربت بيانات الدخول:

```bash
# PowerShell
$env:NAVSMOKE_EMAIL="me@example.com"; $env:NAVSMOKE_PASSWORD="•••"
npm run check:navbar
```

السكربت بيسجّل دخول من **فورم الدخول نفسه** (مش من الـ REST API) —
عشان session بتاع Supabase SSR بيتخزّن في cookies، واللي بينقله
بيغيّر بين الإصدارات. لو الدخول فشل، السكربت بيحذّر ويكمل.

فحص `no double scrollbar` بيسامح **92px** من الـ overflow المعروف
(56px من الشريط `sticky` فوق صفحات `min-h-screen` + 36px من جرس
`NotificationBell`) — الاتنين متسجّلين في
[`docs/TECH_DEBT.md`](docs/TECH_DEBT.md) تحت `N-007` و `N-006`.
أي overflow أكبر من كده = regression جديد والسكربت بيفشل:

```
  FAIL  /chat @ desktop — no double scrollbar — page=+1071px inner=1 page-like ← DOUBLE SCROLL (>92px)
```

# Magicly
