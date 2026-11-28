# DEV-M3 جزء ٧ — Arcade موحّد 🕹️ + جول ولا لا؟ واقعية ⚽

التاريخ: ٢٨ نوفمبر ٢٠٢٦
الحالة: منفذ ومدموج
ملاحظة: مفيش مهاجر DB في الجزء ده — نفس عقد db/114 (claim_break_game)
ودb/124 (arcade_submit_score) زي ما هو.

## ١) كل الألعاب في مكان واحد

`/games` (Magicly Arcade) بقى المكان الوحيد للألعاب:

| القسم | المحتوى |
|---|---|
| مستواك في Arcade | XP الكلي + Level + شريط تقدم + كروت لكل لعبة |
| مهام اليوم | ٣ مهام بقواعد على السيرفر |
| اللعبة المميزة | Magicly Chess ♟️ |
| 🚪 غرفة الهروب | نفس منطق `/escape-room` حرفيًا (EscapeRoomGame component) |
| 🎮 ألعاب الاستراحة | ⚽ جول ولا لا؟ (جديدة بالكامل) · ⚡ Reaction · 🏃 Quiz Rush · ☕ مؤقت · 🧠 Memory Match · 🧩 فزورة اليوم |
| 🏆 ترتيب الشطرنج | Top 20 من `arcade_leaderboard` |
| 🏅 الإنجازات | 6 إنجازات من `game_achievements` |
| على الطريق | Run · Football · Blocks · Battle Pass · بطولات |

- **`/break` و`/escape-room` بقوا redirects لـ `/games`** — أي لينك قديم
  بيوصّل لنفس المكان.
- الألعاب اتحولت لـ components مشتركة في `app/games/components/`
  (BreakTimer · ReactionTest · QuizRush · DailyRiddle · PenaltyShootout ·
  EscapeRoomGame) — نفس نداءات الـ RPC القديمة بلا أي تغيير في العقد.
- `lib/engagement/feature-contract.ts`: route FEATURE_KEYS.GAMES بقى `/games`.
- nav: عنصرَي «استراحة» و«غرفة الهروب» اتصالوا — بنده «الألعاب» واحد في المجتمع.

## ٢) ⚽ جول ولا لا؟ — واقعية أكتر

إعادة بناء كاملة (`PenaltyShootout.tsx`):

- **منظور من نقطة الجزاء**: ملعب أخضر بتدرّج، خط جزاء وقوس منطقة.
- **مرمى بشبكة حقيقية**: إطار أبيض + شبكة CSS (خطوط متقاطعة
  repeating-linear-gradient) — الكورة لما تدخل بتنوّر الشبكة.
- **الكورة بتطير**: بتتحرك من نقطة الجزاء للزاوية المختارة
  (transition 700ms) ومعاها **تصغير تدريجي = إحساس العمق**، ولما تكون جول
  بتكمل شوية جوه الشبكة.
- **الحارس 🧤 بينط**: بيختار زاوية عشوائية وبيطير عليها بميلان
  (rotate ±38°) — لو وصل الكورة بتتصدّ وترجع من الحارس.
- نفس عقد المكافأة: ٣ جول متتالية = `claim_break_game('penalty')` —
  سيرفر-أوثوريتيتيف (سقف ٢/يوم + شرط المذاكرة).

## الاختبارات

تحديث `tests/showcase-arcade-migration.test.ts`: عقد الواقعية (transition +
شبكة + rotate)، عقد التوحيد (redirects + الـ Hub فيه كل المكونات).

`tsc --noEmit` ✅ · vitest كامل ✅ (2690 ناجح — الـ 5 إخفاقات الموجودة
مسبقًا من جلسة تانية: unified-ai وwhatsapp).

## الجاي

- Magicly Run (Phase 2) · Online Chess وشطرنج الأصدقاء (Phase 3) ·
  Football (Phase 4) · Battle Pass وبطولات (Phase 5).
