# تقرير التعديلات — color-migration-2026-08-27

## الملخص
تم توحيد ألوان الداشبورد مع اللاندينج (من البنفسج #7C5CFF إلى الكورال #DC4C4C) + تغيير الخلفية من الكحلي البارد (#07091A) إلى الأسود الدافئ (#0A0806). تم إصلاح responsive اللاندينج. كل التعديلات على branch منفصل (`color-migration-2026-08-27`) مع commit لكل ملف.

---

## الـ Commits (13)

| SHA | الوصف |
|---|---|
| 1ace731 | checkpoint: إنشاء branch + preview HTML |
| 4a672d2 | step1: theme-helpers purple -> coral |
| 04dff13 | step1: globals.css --paper -> #0D0906 |
| 40e2e46 | fix: إصلاح CSS comment داخل :root |
| bbe51f9 | step1-fix: HEATMAP purple -> coral |
| 904381d | step1-fix: HeroCard hardcoded violet -> coral |
| d9f208b | step1-fix: CurrentStepCard violet -> coral |
| e567895 | step1-fix: ProgressRing violet -> coral |
| 7385123 | step1-fix: StatCards violet -> coral |
| a8a7b46 | step1-fix: globals.css --hl-purple-fill -> #DC4C4C |
| 8f5fec7 | step1-rename: ThemeColor purple -> coral |
| fc275a8 | step4: Hero.module.css responsive (1024px) |
| 331427d | step3: lesson page (6 ملفات) violet -> coral |

---

## الملفات المُعدَّلة (18 ملف) — سطر واحد لكل ملف

1. `app/dashboard/components/theme-helpers.ts` — purple key -> coral (#DC4C4C / #F2745C / #F5A25C) + HEATMAP
2. `app/globals.css` — --paper dark -> #0D0906; --hl-purple-fill -> #DC4C4C (كل النسخ)
3. `app/dashboard/components/HeroCard.tsx` — avatar bg/glow, card bg (#0D1029->#0D0906), pill hover
4. `app/dashboard/components/CurrentStepCard.tsx` — badge, button, top line, card bg
5. `app/dashboard/components/ProgressRing.tsx` — stroke + shadow (#7C5CFF -> #DC4C4C)
6. `app/dashboard/components/StatCards.tsx` — toneBg + card bg + hover shadow
7. `app/dashboard/components/types.ts` — ThemeColor "purple" -> "coral"
8. `app/dashboard/components/Sidebar.tsx` — PENS array id/name/swatch
9. `app/dashboard/components/PageShell.tsx` — isThemeColor check
10. `app/dashboard/components/AnalyticsSection.tsx` — BAR_TOKEN mapping
11. `components/BossFight.tsx` — ThemeColor + themeAccentBg
12. `components/StudyPet.tsx` — ThemeColor + THEME_BAR + THEME_TEXT
13. `components/landing/Hero.module.css` — media query 1024px + flex-wrap nav/steps
14. `app/lesson/[dayId]/components/LessonChrome.tsx` — bg + CSS string violet -> coral
15. `app/lesson/[dayId]/components/LessonHero.tsx` — button colors
16. `app/lesson/[dayId]/components/LessonBreadcrumb.tsx` — badge colors
17. `app/lesson/[dayId]/components/LessonProgressPanel.tsx` — meter gradient
18. `app/lesson/[dayId]/components/LessonModeTabs.tsx` — tab gradient
19. `app/lesson/[dayId]/page.tsx` — CTA button colors

---

## ما لم يُنفَّذ (حسب طلب التقسيم)
- Avatar page منفصلة (`app/avatar/` أو ما يعادله) — غير موجود؛ لم يُطلب صراحة
- Screenshots بصرية على 375/768/1024/1440 — preview يعمل لكن `cua-driver` يحتاج Chrome `Allow` popup
- أي تعديل خارج النطاق المطلوب (لا NavRail/HeroSection/Sidebar خارج `PENS`)

---

## حالة البناء
- `npm run build`: PASS ✅
- `dev server`: يعمل (PID متغير، تم إعادة تشغيله بعد kill 17220) ✅
- `branch`: `color-migration-2026-08-27` (منفصل عن `main`) ✅
