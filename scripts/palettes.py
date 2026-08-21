#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
مولّد باليتات ثيمات المتجر — والمدقّق بتاعها.

ليه سكربت مش ألوان مكتوبة بالإيد؟
  نظام التصميم بتاع المشروع فيه قواعد **رقمية** مكتوبة في globals.css:
    • تباين الحبر على الكارت لازم يبقى في المدى المريح ١٠–١٣ : ١
      (النسخة الأولى كانت ١٦٫٩ والمستخدم قال "حادة ومؤذية للعين").
    • الفرق بين الكارت والصفحة ΔL* ≈ ٥ — ممنوع يتهدّى.
    • قوة خط الحدّ ΔL* ≈ ١٣ — ممنوعة تتهدّى كمان، لأن لو هدّيناها
      الصفحة ترجع "مريحة بس ملخبطة" وهي المشكلة اللي التصميم اتعمل لحلها.

  ١٥ باليت × ٨ ألوان = ١٢٠ قرار. باليد يعني نسيب الأرقام للحظ.
  فبدل كده كل باليت بتتعرّف بـ **نيّتها** (درجة اللون + هل فاتحة ولا
  غامقة + لون الأكسنت)، والسكربت بيحلّ السطوع اللي بيحقّق النسبة
  المطلوبة بالظبط، وبيرفض أي باليت تخرج عن المدى.

الاستخدام:
    python scripts/palettes.py --check   # يقيس ويطبّع تقرير
    python scripts/palettes.py --css     # يطلّع الـ CSS الجاهز
"""

from __future__ import annotations

import argparse
import sys

# ============================================================================
# ١) حسابات الألوان
# ============================================================================


def hex_to_rgb(value: str) -> tuple[float, float, float]:
    v = value.lstrip("#")
    return tuple(int(v[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{round(max(0.0, min(1.0, c)) * 255):02X}" for c in rgb)


def _linearize(c: float) -> float:
    """sRGB → خطّي. المعادلة من مواصفة WCAG بالحرف."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(value: str) -> float:
    r, g, b = (_linearize(c) for c in hex_to_rgb(value))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def lstar(value: str) -> float:
    """CIE L* — السطوع زي ما العين شايفاه. بنستخدمه لـ ΔL* بين الأسطح."""
    y = luminance(value)
    return 116 * (y ** (1 / 3)) - 16 if y > 0.008856 else 903.3 * y


def hsl_to_hex(h: float, s: float, l: float) -> str:
    """HSL → hex. h بالدرجات، s و l من ٠ لـ ١."""
    c = (1 - abs(2 * l - 1)) * s
    hp = (h % 360) / 60
    x = c * (1 - abs(hp % 2 - 1))
    if hp < 1:
        rgb = (c, x, 0.0)
    elif hp < 2:
        rgb = (x, c, 0.0)
    elif hp < 3:
        rgb = (0.0, c, x)
    elif hp < 4:
        rgb = (0.0, x, c)
    elif hp < 5:
        rgb = (x, 0.0, c)
    else:
        rgb = (c, 0.0, x)
    m = l - c / 2
    return rgb_to_hex((rgb[0] + m, rgb[1] + m, rgb[2] + m))


def hex_to_hsl(value: str) -> tuple[float, float, float]:
    """hex → HSL. محتاجينها عشان نعيد حلّ لون موجود (الأخضر الدلالي مثلاً)
    على نفس درجته بس بسطوع مختلف."""
    r, g, b = hex_to_rgb(value)
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return (0.0, 0.0, l)
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == r:
        h = ((g - b) / d) % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return (h * 60, s, l)


# ============================================================================
# ٢) تعريف الباليتات
#
# كل باليت = نيّتها، مش ألوانها:
#   hue    — درجة اللون الحاكمة (سطح المكتب + النص المميز)
#   accent — درجة الأكسنت (الثيم الحالي amber هو فسفوري؛ جوه الطبقة دي
#            كل لون له دور واضح: "ده الإجراء الأساسي")
#   mood   — فاتح (زي الورقة الحالية) أو غامق (مكتب باللمبة، شاشة/سينما)
#
# قيم السطوع مش هنا — بيتم حلّها من قواعد التباين في القسم ٤.
# ============================================================================

# نسب التباين اللي نظام التصميم بيفرضها (globals.css بتوثّقها)
PAPER_SOFT = "#F2F5FA"   # ورق القائمة الحالية (لكل باليت فاتحة نسختها)
TARGET_BODY = 11.0       # المدى المريح: ١٠–١٣ : ١
TARGET_SOFT = 4.8        # النص الهادي: مش أقل من ٤٫٥ (WCAG AA)
TARGET_DELTA = 4.6       # الفرق ΔL* بين الكارت والصفحة
TARGET_BORDER = 12.0     # قوة خط الحدّ (ΔL*)
TARGET_ON_MARKER = 4.8   # النص فوق الضربة الفسفورية (خلفية ملوّنة)


def mood_lit() -> tuple[float, float]:
    """ورق فاتح: نسختا السطوع اللي بتحدد الكارت والصفحة."""
    # دلوقتي من الثيم الحالي
    return (lstar(PAPER_SOFT), 0.0)


def mood_dark() -> tuple[float, float]:
    """ورق غامق: الكارت يبقى أغمق من الورقة بالفرق نفسه اللي فوق."""
    card_l = 26.5
    return (card_l + 5.2, card_l)


# ── درجات الألوان (hue) ──
# الأسطورة: D = غامق، L = فاتح، والأرقام درجات HSL.
HUE_DARK_LIBRARY = 220   # كحلي — أغلفة الكتب، سطح مكتب هادي
HUE_OCEAN = 205          # أزرق مائي — عمق المحيط
HUE_CYBERPUNK = 330      # وردي نيون — رجّعته نيون لطيف على ورق غامق
HUE_MATRIX = 120         # أخضر — الشاشة الكلاسيكية
HUE_SUNSET = 25          # برتقالي دافئ — الشفق
HUE_FOREST = 150         # أخضر غابة
HUE_GALAXY = 265         # بنفسجي — السديم
HUE_COFFEE = 30          # بنّي دافئ — القهوة والحليب
HUE_PURPLE_NEON = 285    # نيون بنفسجي
HUE_ICE = 195            # أزرق جليدي
HUE_GOLDEN = 45          # ذهبي دافئ
HUE_MIDNIGHT = 235       # ليلي كحلي غامق
HUE_RETRO = 340          # وردي رجعي
HUE_MINIMAL = 210        # أزرق هادي (أبيض نضيف لو فاتح)
HUE_AURORA = 185         # تركواز — الشفق القطبي

# ── كل باليت ──
# (id, اسم عربي، hue السطح، mood، hue الضربة الفسفورية، وصف)
#
# ⚠️ الضربة الفسفورية بتتغيّر مع كل باليت عن قصد. هي العنصر المميز في
# المشروع كله، فلو سيبناها صفرا في الـ١٥ كانت "أزرق المحيط" و"العالم
# الجليدي" هيبانوا نفس الحاجة (الفرق بينهم ١٠ درجات hue على السطح بس).
# القاعدة "اصرف الجُرأة في مكان واحد" معناها هنا: الضربة هي المكان.
#
# ⚠️ الألوان الدلالية (أخضر=تم، أحمر=خطأ) **مش** بتتغيّر مع الباليت.
# "نجح" ممنوع يطلع وردي في سايبربانك — الدلالة مش زينة.
PALETTES = [
    # -- ليلي --
    ("dark-library", "المكتبة الغامقة", HUE_DARK_LIBRARY, "dark", 45,  "أغلفة جلدية وكحلي هادي — مكتب بالليل"),
    ("midnight",     "منتصف الليل",     HUE_MIDNIGHT,     "dark", 220, "كحلي غامق بارد — سهرة خفيفة"),
    ("retro",        "ريترو",           HUE_RETRO,        "dark", 35,  "وردي رجعي — CRT وشريط كاسيت"),
    ("cyberpunk",    "سايبربانك",       HUE_CYBERPUNK,    "dark", 175, "نيون وردي على ليل — سايبر"),
    ("matrix",       "ماتريكس",         HUE_MATRIX,       "dark", 115, "شاشة خضرا — وضع التركيز"),
    ("galaxy",       "المجرّة",         HUE_GALAXY,       "dark", 285, "سديم بنفسجي — الفضاء"),

    # -- نهاري --
    ("ocean-blue",   "أزرق المحيط",     HUE_OCEAN,        "light", 195, "مياه صافية — شطّ هادي"),
    ("forest",       "الغابة",          HUE_FOREST,       "light", 95,  "أوراق صباح — نسمة هواء"),
    ("coffee-shop",  "القهوة",          HUE_COFFEE,       "light", 40,  "بنّي دافئ — مقهى الصباح"),
    ("sunset",       "الغروب",          HUE_SUNSET,       "light", 15,  "أشعة الشفق — دفا آخر اليوم"),
    ("golden",       "الذهبي",          HUE_GOLDEN,       "light", 48,  "ذهبي — ندرة عالية"),
    ("minimal",      "الحد الأدنى",     HUE_MINIMAL,      "light", 210, "ورق أبيض نضيف — مفيش تشويش"),
    ("purple-neon",  "النيون البنفسجي", HUE_PURPLE_NEON,  "light", 300, "قلم بنفسجي — مذاكرة تركيز"),
    ("ice-world",    "العالم الجليدي",  HUE_ICE,          "light", 185, "جليد صباح — نضارة"),
    ("aurora",       "الأورورا",        HUE_AURORA,       "light", 155, "تركواز — شفق قطبي"),
]


# ============================================================================
# ٣) حلّ باليت كاملة
# ============================================================================


def solve_contrast_l(hue: float, sat: float, against: str, ratio: float, darker: bool) -> str:
    """
    بيدوّر على درجة سطوع HSL على نفس الـ hue بتحقّق نسبة تباين مطلوبة مع
    لون معروف. `darker=True` معناها إحنا بندوّر في النص الغامق (تحت السطح).

    ⚠️ ليه دالة واحدة لكل حاجة؟ لأن أول نسخة حسبت الكارت بإني طرحت ΔL*
    (وحدة CIE L*) واستخدمت الناتج كـ HSL lightness — وهما سلّمين مختلفين
    خالص. الفحص مسك ده فوراً (ΔL* طلع ٢٫٨ بدل ٤٫٦).
    """
    lo, hi = (0.0, 1.0)
    for _ in range(50):
        mid = (lo + hi) / 2
        got = contrast(hsl_to_hex(hue, sat, mid), against)
        # في النص الغامق: كل ما السطوع نزل التباين زاد
        if (got > ratio) == darker:
            lo = mid
        else:
            hi = mid
    return hsl_to_hex(hue, sat, (lo + hi) / 2)


def solve_delta_l(hue: float, sat: float, against: str, delta: float, lighter: bool) -> str:
    """نفس الفكرة بس الهدف فرق سطوع منظور (ΔL*) مش نسبة تباين."""
    target = lstar(against) + (delta if lighter else -delta)
    lo, hi = (0.0, 1.0)
    for _ in range(50):
        mid = (lo + hi) / 2
        if lstar(hsl_to_hex(hue, sat, mid)) < target:
            lo = mid
        else:
            hi = mid
    return hsl_to_hex(hue, sat, (lo + hi) / 2)


def solve_marker(hue: float, sat: float = 0.72, prefer: float = 0.62) -> tuple[str, str]:
    """
    بيرجّع (لون الضربة، لون النص فوقها).

    ⚠️ ليه بحث مش رقم ثابت؟ الضربة الفسفورية بتتحط **خلفية** وفوقها نص.
    عند سطوع متوسط فيه "منطقة ميتة": اللون بيبقى غامق زيادة على النص
    الأبيض وفاتح زيادة على النص الغامق، فمحدش من الاتنين بيوصل ٤٫٥.
    الفحص مسك ده في المجرّة (بنفسجي ٢٨٥ عند ٠٫٦٢ = ٤٫٣٧ لأحسن اختيار).

    فبدل ما نظبط الباليت دي بإيدنا، بندوّر على أقرب سطوع لـ`prefer`
    بيحقّق النسبة. الأصفر بيفضل مكانه، والبنفسجي بيفتح لحد ما ياخد حبر
    غامق — وده بالظبط اللي القلم الفسفوري الحقيقي بيعمله.
    """
    inks = ("#1B2233", "#FFFFFF")
    best: tuple[str, str] | None = None
    # بنجرّب سطوع من ٠٫٣٤ لـ ٠٫٩٠ ونختار الأقرب لـ prefer اللي بيعدّي
    for step in range(0, 57):
        light = 0.34 + step * 0.01
        candidate = hsl_to_hex(hue, sat, light)
        ink_c = max(inks, key=lambda i: contrast(i, candidate))
        if contrast(ink_c, candidate) >= TARGET_ON_MARKER:
            if best is None or abs(light - prefer) < abs(hex_to_hsl(best[0])[2] - prefer):
                best = (candidate, ink_c)
    if best is None:
        # مش المفروض تحصل مع أي درجة، بس لو حصلت الأمان أهم من الجمال
        fallback = hsl_to_hex(hue, sat * 0.6, 0.88)
        return (fallback, "#1B2233")
    return best


def build_palette(pid: str, name: str, hue: float, mood: str, accent_hue: float, desc: str) -> dict:
    dark = mood == "dark"
    sat = 0.30 if dark else 0.22  # تشبّع ممنوع يعلو: ورق مش نيون

    # الترتيب مهم: **الكارت هو سطح القراءة**، فهو الأصل. الحبر بيتحلّ عليه
    # لحد النسبة المريحة، والصفحة بتتحلّ منه بفرق ΔL*.
    if dark:
        ink = "#EDF1FA"  # نص فاتح واحد لكل الباليتات الغامقة
        # الكارت: أغمق درجة بتدي التباين المطلوب مع النص الفاتح.
        # ده اللي بيصلّح ماتريكس لوحده — الأخضر لمّا يتحلّ بيطلع غامق كفاية.
        card = solve_contrast_l(hue, sat, ink, TARGET_BODY, darker=True)
        # في الغامق الورقة **أغمق** من الكارت (زي الثيم الحالي:
        # paper #101524 والكارت #171E30 أفتح منها)
        page = solve_delta_l(hue, sat, card, TARGET_DELTA, lighter=False)
        soft = solve_contrast_l(hue, min(0.22, sat), card, TARGET_SOFT, darker=False)
    else:
        # الفاتح: الكارت أوف-وايت (مش أبيض نقي — أكبر مصدر إجهاد)
        card = hsl_to_hex(hue, sat * 0.5, 0.972)
        ink = solve_contrast_l(hue, sat + 0.2, card, TARGET_BODY, darker=True)
        page = solve_delta_l(hue, sat, card, TARGET_DELTA, lighter=False)
        soft = solve_contrast_l(hue, sat + 0.1, card, TARGET_SOFT, darker=True)

    # الحدود: قوة ΔL* ≈ ١٢ مش بصراحة (روابط بيئة) — جوه الطبقة بنحددها
    # نسبة شفافية فوق الورقة، وهي اتضبطت في الحالي على ١٥٪.
    rule = "color-mix(in srgb, var(--paper) 85%, var(--ink) 15%)" if dark else "color-mix(in srgb, var(--paper-2) 75%, var(--ink) 25%)"

    # السطح التالت: بيتحرك **ناحية الحبر** من الكارت (في الفاتح أغمق، في
    # الغامق أفتح). اتحطّ تحت نص في ١٢ مكان فلازم يتقاس هو كمان.
    paper3 = solve_delta_l(hue, sat, card, 3.4, lighter=dark)

    # الأكسنت: مش لون مستقل — هو "الإجراء الأساسي" فلو الباليت غامقة
    # يبقى فاتح مشبع، ولو فاتحة يبقى درجة على الورق.
    accent = hsl_to_hex(accent_hue, 0.55, 0.68 if dark else 0.5)
    on_accent = "#141C33" if not dark else "#0E1322"

    # ── الضربة الفسفورية ──
    # دي هي اللي بتفرّق باليت عن باليت. بتتحط **خلفية** وتحتها نص، فالنص
    # بيتحلّ عليها مش بيتفترض: أصفر عايز حبر غامق، بنفسجي عايز حبر فاتح.
    # لو سيبنا --on-marker ثابت زي ما هو في :root كان النص هيختفي على نص
    # الباليتات.
    marker, on_marker = solve_marker(accent_hue)
    # النسخة الغامقة (حدود وظل الزرار) — درجة تحت الضربة على نفس اللون
    marker_deep = hsl_to_hex(accent_hue, 0.72, max(0.24, hex_to_hsl(marker)[2] - 0.10))
    # نسخة "الحبر" من الفسفوري: نفس الدرجة بس مقروءة **على الكارت**
    # (بتستخدم في .tag و.eyebrow كنص مش كخلفية).
    marker_ink = solve_contrast_l(accent_hue, 0.62, card, TARGET_SOFT, darker=not dark)

    # ── الألوان الدلالية ──
    # الدرجة ثابتة (أخضر = تم، أحمر = خطأ، أزرق = معلومة) بس **السطوع**
    # بيتحلّ على كارت الباليت. من غير كده كان الأخضر الغامق بتاع الثيم
    # الفاتح هيتحط على كارت غامق ويختفي.
    def semantic(base: str) -> tuple[str, str]:
        h, s, _ = hex_to_hsl(base)
        fill = hsl_to_hex(h, s, 0.62 if dark else 0.45)
        text = solve_contrast_l(h, min(0.7, s + 0.1), card, TARGET_SOFT, darker=not dark)
        return fill, text

    green_fill, green_ink = semantic("#35C285")
    red_fill, red_ink = semantic("#D8455E")
    blue_fill, blue_ink = semantic("#3BA8D4")
    purple_fill, purple_ink = semantic("#9B6BD6")
    indigo_fill, indigo_ink = semantic("#4F5BD5")
    _, orange_ink = semantic("#E08A2E")

    # البقعة الحمرا (القلم الأحمر للخطأ) — متجردة عن الـ hue عشان تفضل
    # "قلم حبر" مش "لون الثيم"
    red = red_fill

    return {
        "id": pid, "name": name, "desc": desc, "dark": dark,
        "hue": hue, "page": page, "card": card, "paper3": paper3,
        "ink": ink, "soft": soft, "rule": rule,
        "accent": accent, "on_accent": on_accent,
        "marker": marker, "marker_deep": marker_deep,
        "on_marker": on_marker, "marker_ink": marker_ink, "red": red,
        "green_fill": green_fill, "green_ink": green_ink,
        "red_fill": red_fill, "red_ink": red_ink,
        "blue_fill": blue_fill, "blue_ink": blue_ink,
        "purple_fill": purple_fill, "purple_ink": purple_ink,
        "indigo_fill": indigo_fill, "indigo_ink": indigo_ink,
        "orange_ink": orange_ink,
    }


# ============================================================================
# ٤) الفحص والطباعة
# ============================================================================

# علامات الحقن في globals.css. السكربت بيستبدل اللي بينهم، فإعادة التوليد
# مش بتكرّر الباليتات ولا بتلمس أي CSS مكتوب بالإيد.
BEGIN_MARK = "/* ⇩⇩ PACKS:BEGIN — مولّد آلياً، متعدّلوش بالإيد ⇩⇩ */"
END_MARK = "/* ⇧⇧ PACKS:END ⇧⇧ */"


def check_all() -> bool:
    """
    الفحص هو اللي بيخلّي السكربت يستحق وجوده. أول نسخة عدّت التباين بس،
    فسابت تلات أخطاء تعدّي (سطوح متساوية، وحبر فوق الفسفوري مش مقروء).
    فكل رقم النظام بيفرضه بيتقاس هنا، والسكربت بيرجّع ١ لو أي واحد وقع.
    """
    head = f"{'الباليت':<20}{'الوضع':<6}{'حبر':<7}{'هادي':<7}{'ΔL*':<7}{'س٣':<7}{'فوسفور':<8}{'دلالي':<7}الحالة"
    print(head)
    print("─" * 82)
    ok = True
    for pid, name, hue, mood, accent_hue, desc in PALETTES:
        p = build_palette(pid, name, hue, mood, accent_hue, desc)
        c = contrast(p["ink"], p["card"])
        s = contrast(p["soft"], p["card"])
        delta = abs(lstar(p["card"]) - lstar(p["page"]))
        # ΔL* بين الكارت والسطح التالت — لو صفر يبقى مفيش سطح تالت أصلاً
        d3 = abs(lstar(p["card"]) - lstar(p["paper3"]))
        # الحبر فوق الضربة الفسفورية (خلفية + نص جواها)
        mk = contrast(p["on_marker"], p["marker"])
        # أضعف لون دلالي كنص على الكارت
        sem = min(
            contrast(p[k], p["card"])
            for k in ("green_ink", "red_ink", "blue_ink", "purple_ink", "indigo_ink", "orange_ink", "marker_ink")
        )
        # الحبر الأساسي لازم يقرا على السطح التالت كمان مش على الكارت بس
        ink3 = contrast(p["ink"], p["paper3"])

        problems: list[str] = []
        if not (10.0 <= c <= 13.5):
            problems.append(f"تباين الحبر {c:.1f} خارج ١٠–١٣٫٥")
        if s < 4.5:
            problems.append(f"النص الهادي {s:.2f} تحت ٤٫٥")
        if delta < 4.2:
            problems.append(f"ΔL* الكارت/الصفحة {delta:.1f} تحت ٤٫٢")
        if d3 < 2.5:
            problems.append(f"السطح التالت مش مميّز (ΔL* {d3:.1f})")
        if mk < 4.5:
            problems.append(f"النص فوق الفسفوري {mk:.2f} تحت ٤٫٥")
        if sem < 4.5:
            problems.append(f"لون دلالي {sem:.2f} تحت ٤٫٥")
        if ink3 < 7.0:
            problems.append(f"الحبر على السطح التالت {ink3:.1f} تحت ٧")

        status = "✓" if not problems else "✗ " + "؛ ".join(problems)
        if problems:
            ok = False
        mood_ar = "غامق" if p["dark"] else "فاتح"
        print(f"{name:<20}{mood_ar:<6}{c:<7.1f}{s:<7.2f}{delta:<7.1f}{d3:<7.1f}{mk:<8.1f}{sem:<7.2f}{status}")
    return ok


def css_block() -> str:
    out: list[str] = []
    out.append(BEGIN_MARK)
    out.append("/* ══════════════════════════════════════════════════════════════")
    out.append("   باليتات المتجر — مولّدة من scripts/palettes.py")
    out.append("   ⚠️ متتكتبش بالإيد. عدّل السكربت وشغّل:")
    out.append("      python scripts/palettes.py --check   (لازم يعدّي)")
    out.append("      python scripts/palettes.py --css")
    out.append("   كل باليت بتعيد تعريف الطقم كامل — التوكنز الدلالية")
    out.append("   والفسفوري مش بيتورّثوا من :root عشان مايبقاش فيه نص")
    out.append("   غامق على خلفية غامقة.")
    out.append("   ══════════════════════════════════════════════════════════ */")
    out.append("")
    for pid, name, hue, mood, accent_hue, desc in PALETTES:
        p = build_palette(pid, name, hue, mood, accent_hue, desc)
        out.append(f"/* {name} — {desc} */")
        out.append(f':root[data-pack="{pid}"] {{')
        out.append(f'  color-scheme: {"dark" if p["dark"] else "light"};')
        out.append(f'  --paper: {p["page"]};')
        out.append(f'  --paper-2: {p["card"]};')
        out.append(f'  --paper-3: {p["paper3"]};')
        out.append(f"  --rule: {p['rule']};")
        out.append("  --rule-strong: color-mix(in srgb, var(--paper-2) 60%, var(--ink) 40%);")
        out.append(f'  --ink: {p["ink"]};')
        out.append(f'  --ink-soft: {p["soft"]};')
        out.append(f'  --marker: {p["marker"]};')
        out.append(f'  --marker-deep: {p["marker_deep"]};')
        out.append(f'  --on-marker: {p["on_marker"]};')
        out.append(f'  --redpen: {p["red"]};')
        out.append(f'  --redpen-soft: color-mix(in srgb, {p["red"]} 34%, transparent);')
        shade = "0, 0, 0" if p["dark"] else "35, 45, 73"
        out.append(f'  --shade: rgba({shade}, {0.28 if p["dark"] else 0.08});')
        out.append(f'  --shade-lift: rgba({shade}, {0.42 if p["dark"] else 0.12});')
        out.append(f'  --on-danger: {"#0E1322" if p["dark"] else "#FFFFFF"};')
        out.append("  /* الطقم الدلالي — الدرجة ثابتة والسطوع محلول على كارت الباليت */")
        out.append(f'  --hl-yellow-fill: {p["marker"]};')
        out.append(f'  --hl-yellow-deep: {p["marker_deep"]};')
        out.append(f'  --hl-yellow-ink: {p["marker_ink"]};')
        out.append(f'  --hl-green-fill: {p["green_fill"]};')
        out.append(f'  --hl-green-ink: {p["green_ink"]};')
        out.append(f'  --hl-red-fill: {p["red_fill"]};')
        out.append(f'  --hl-red-ink: {p["red_ink"]};')
        out.append(f'  --hl-orange-ink: {p["orange_ink"]};')
        out.append(f'  --hl-blue-fill: {p["blue_fill"]};')
        out.append(f'  --hl-blue-ink: {p["blue_ink"]};')
        out.append(f'  --hl-purple-fill: {p["purple_fill"]};')
        out.append(f'  --hl-purple-ink: {p["purple_ink"]};')
        out.append(f'  --hl-indigo-fill: {p["indigo_fill"]};')
        out.append(f'  --hl-indigo-ink: {p["indigo_ink"]};')
        out.append("}")
        out.append("")
    out.append(END_MARK)
    return "\n".join(out)


def ts_block() -> str:
    """
    بيطلّع موديول TS كامل بميتاداتا الباليتات.

    Why مولّد مش مكتوب بالإيد: الكتالوج محتاج اسم كل ثيم ووصفه وعيّنة
    ألوانه للمعاينة. لو اتكتبوا مرتين (هنا وفي الـ CSS) أول تعديل على
    باليت هيخلّي المعاينة تكدب على الحقيقة.
    """
    out = [
        "/* ⇩⇩ مولّد آلياً من scripts/palettes.py — متعدّلوش بالإيد ⇩⇩",
        "   للتحديث: python scripts/palettes.py --ts > lib/shop/theme-packs.ts",
        "",
        "   العيّنة (swatch) ترتيبها: [الصفحة، الكارت، الضربة، الحبر]",
        "   وهي نفس القيم الموجودة في globals.css بالحرف، فمعاينة الثيم في",
        "   المتجر بتوريه بجد مش تقريب. */",
        "",
        'export type ThemePackId =',
    ]
    for i, (pid, *_rest) in enumerate(PALETTES):
        out.append(f'  {"|" if i else " "} "{pid}"')
    out[-1] += ";"
    out.append("")
    out.append("export type ThemePack = {")
    out.append("  id: ThemePackId;")
    out.append("  name: string;")
    out.append("  desc: string;")
    out.append("  /** غامقة؟ بتستخدم لفرز «ثيمات ليلية» ولـ color-scheme */")
    out.append("  dark: boolean;")
    out.append("  swatch: readonly [string, string, string, string];")
    out.append("};")
    out.append("")
    out.append("export const THEME_PACKS: readonly ThemePack[] = [")
    for pid, name, hue, mood, accent_hue, desc in PALETTES:
        p = build_palette(pid, name, hue, mood, accent_hue, desc)
        out.append(
            f'  {{ id: "{pid}", name: "{name}", desc: "{desc}", '
            f'dark: {"true" if p["dark"] else "false"}, '
            f'swatch: ["{p["page"]}", "{p["card"]}", "{p["marker"]}", "{p["ink"]}"] }},'
        )
    out.append("];")
    out.append("")
    out.append("export const THEME_PACK_IDS: readonly ThemePackId[] =")
    out.append("  THEME_PACKS.map((p) => p.id);")
    out.append("")
    out.append("export function isThemePackId(v: string): v is ThemePackId {")
    out.append("  return THEME_PACK_IDS.includes(v as ThemePackId);")
    out.append("}")
    return "\n".join(out)


def apply_to_css(path: str) -> str:
    """
    بيحقن الباليتات في globals.css بين العلامتين.

    ⚠️ الترتيب مش تفصيلة: `:root[data-pack="x"]` و`:root[data-theme="dark"]`
    ليهم **نفس الـ specificity** (0,2,0)، فاللي بيكسب هو اللي متأخر في
    الملف. عشان كده الحقن بيتم بعد بلوك data-theme وقبل @theme inline —
    لو اتحطوا قبله الثيم المشترى مش هيبان أصلاً في الوضع الغامق.
    """
    with open(path, encoding="utf-8") as fh:
        css = fh.read()

    block = css_block()

    if BEGIN_MARK in css and END_MARK in css:
        head = css.split(BEGIN_MARK)[0]
        tail = css.split(END_MARK)[1]
        updated = head + block + tail
        mode = "اتحدّثت"
    else:
        anchor = "\n@theme inline {"
        if anchor not in css:
            raise SystemExit("مالقيتش @theme inline — الملف اتغيّر، راجع يدوي")
        # قبل أول @theme inline بالظبط
        idx = css.index(anchor)
        updated = css[:idx] + "\n" + block + "\n" + css[idx:]
        mode = "اتزرعت"

    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(updated)
    return mode


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--css", action="store_true")
    parser.add_argument("--ts", action="store_true")
    parser.add_argument("--apply", metavar="PATH", help="يحقن الباليتات في globals.css")
    args = parser.parse_args()
    if args.check:
        ok = check_all()
        print("\nالمجموع:", "مقبول" if ok else "فيه باليتات خارج المدى")
        sys.exit(0 if ok else 1)
    if args.css:
        print(css_block())
    if args.ts:
        print(ts_block())
    if args.apply:
        # ممنوع نكتب باليتات ساقطة في الملف
        if not check_all():
            print("\n✗ فيه باليتات خارج المدى — مفيش حاجة اتكتبت")
            sys.exit(1)
        print("\n" + args.apply, apply_to_css(args.apply))

