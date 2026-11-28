# DEV-M3 — جزء ١١: Magic Chess Online — Phase 2

**الفرع:** `feat/community-c1-discovery` · **المواصفة:** `magic-chess-master-spec.md` · **db:** `125-chess-online.sql` (مطبق على الإنتاج)

## إيه اللي اتنفذ

### 🗄️ قاعدة البيانات (db/125 — 27 statement، اتطبقت)
- **`chess_ratings`** — Elo مستقل لكل فئة وقت (bullet/blitz/rapid/classical، كلها تبدأ 1200) + W/L/D. RLS: قراءة للمالك بس.
- **`chess_games`** — حالة المباراة (نفس `GameState` من محركنا) + الساعات بالميلي + النقلات. RLS: قراءة للاعبَي المباراة بس — **الكتابة من السيرفر فقط**.
- **`chess_queue`** — طابور البحث. RLS بلا سياسات — الوصول عبر RPCs بس.
- RPCs:
  | الدالة | وظيفتها |
  |---|---|
  | `chess_join_queue` | matchmaking — خصم بنفس الإعدادات (`SKIP LOCKED` ضد السباق)، ألوان عشوائية، تنظيف طلبات يتيمة (>3 دقائق)، وإعادة اتصال تلقائية لمباراة شغالة |
  | `chess_leave_queue` | خروج من الطابور |
  | `chess_resign` | استسلام — لاعب المباراة بس |
  | `chess_claim_timeout` | المطالبة بانتهاء الوقت — **السيرفر بيتحقق بالحساب** (مفيش إنهاء لو لسه وقت) |
  | `chess_finish_game` | إنهاء + تطبيق Elo (K=32، أرضية 100) — revoked من everyone، `service_role` بس |
  | `chess_elo` / `chess_initial_state` | مساعدات — اتأكدنا منها على الإنتاج (فوز +16، خسارة −16، مفاجأة 1200 ضد 1400 = +24) |

### ⚙️ السيرفر — `/api/chess/move`
- تحقق سيرفري كامل بمحرك الشطرنج نفسه (`lib/games/chess/engine`) — أي نقلة غير قانونية ترفض.
- المصادقة + التأكد من المشاركة + إنها دوره.
- الساعات: خصم المنقضي من `last_move_at` + increment — ولو الوقت خلص → خسارة بالوقت فورًا.
- كش مات/حصر → `chess_finish_game` (Elo على السيرفر).
- كتابة بـ service-role بعد التحقق اليدوي — العميل عمره ما يكتب على `chess_games`.

### 🌍 الواجهة — `/games/chess/online`
- اختيار فئة وقت: **Bullet 2+1 · Blitz 5+0 · Rapid 10+5 · Classical 30+0** + مباراة مرتبة/ودية.
- matchmaking بجولة كل 2.5 ثانية (idempotent — نفس النداء بيطابق وبيسجل)، ومتابعة المباراة كل 1.5 ثانية.
- ساعات بنمط chess.com (تنبيه أحمر تحت 30 ثانية) — الساعة بتقف لمن مش دوره.
- قلب تلقائي للأسود + نفس رقع/أطقم/أصوات إعدادات اللاعب + إبراز النقلات والكش.
- استسلام + نتيجة نهائية بالسبب + Rating المحدث.
- نفس عقد اللوحة الثابتة (57/64px) وألوان الإبراز.

## الاختبارات
- `tests/magic-chess-online.test.ts` — جديد (14 اختبار): الجداول وRLS وخصوصية `chess_finish_game` · matchmaking (ألوان عشوائية + إعادة اتصال + تنظيف) · `claim_timeout` بالحساب · فئات الوقت والساعة · route التحقق السيرفري · الواجهة.
- `tsc` نظيف · المجموع الكامل 2759 ناجح — الفشل الوحيد WIP الجلسة التانية (unified-ai/profile/community).

## المرحلة الجاية (Phase 3 — Social Gaming)
- غرف خاصة + دعوات أصدقاء (زر «Challenge to Chess ♟️» من الشات).
- مشاهدة المباريات (spectate) + rematch.
- Friends Leaderboard.
