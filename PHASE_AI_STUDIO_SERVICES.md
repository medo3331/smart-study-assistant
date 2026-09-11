# 🚀 مرحلة خدمات الـ AI المتقدمة — صور + مخططات + ملفات

تحويل ماجيكلي من "مساعد شات" لمنصة إنتاج محتوى تعليمي متكاملة.

## ✅ ما تم تنفيذه

### 🗂️ الملفات الجديدة

**طبقة الخدمات (lib/ai/):**

| الملف | الوظيفة |
|---|---|
| `lib/ai/image-generator.ts` | توليد الصور التعليمية — DALL-E 3 → Flux Pro → SDXL مع Fallback تلقائي + بناء prompt تعليمي حسب الأسلوب والمرحلة |
| `lib/ai/diagram-generator.ts` | توليد مخططات Mermaid عبر نموذج اللغة (مجاني 100% — الرسم في المتصفح) + تنظيف الاستجابة + خريطة أنواع المخططات حسب المادة |
| `lib/ai/file-generator.tsx` | توليد الملفات: PDF (@react-pdf/renderer) + Word (docx) + Excel (xlsx) + PowerPoint (pptxgenjs) — محتوى ملخص/كويز/خطة مذاكرة/بطاقات/تقرير |
| `lib/ai/service-registry.ts` | سجل الخدمات + حدود الباقات (Free/Pro/Ultra) + عدّادات يومية + تحديد الباقة من `entitlements` |
| `lib/ai/prompt-engine.ts` | إرشادات رسم المخططات (Mermaid) اللي بتتحقن في الـ system prompt بتاع الشات |

**الـ API (app/api/ai/):**

| الراوت | الوظيفة |
|---|---|
| `/api/ai/image` | توليد صورة — حد الخدمة حسب الباقة + تقييد الموديل حسب الباقة |
| `/api/ai/diagram` | توليد مخطط Mermaid عبر `aiRouter.completeChat` + حجز كريدت واسترجاعه عند الفشل |
| `/api/ai/file` | تحويل بيانات موجودة لملف (يرجع الملف نفسه كـ binary) |
| `/api/ai/file/generate` | خطوة واحدة: توليد محتوى منظم بالـ AI ثم تصديره كملف |

**الواجهات (components/):**

| المكوّن | الوظيفة |
|---|---|
| `components/ui/MermaidViewer.tsx` | عارض المخططات التفاعلي داخل الشات (تكبير/تصغير + تحميل SVG + نسخ الكود + عرض النص عند فشل الرسم) |
| `components/ui/MarkdownRenderer.tsx` | عرض ردود الـ AI — بيتعرف تلقائيًا على بلوكات ```` ```mermaid ```` وبيحولها لمخطط تفاعلي |
| `components/ai/DiagramCanvas.tsx` | لوحة عرض المخططات لأداة التوليد |
| `components/ai/ImageGenerator.tsx` | واجهة توليد الصور |
| `components/ai/DiagramGenerator.tsx` | أداة توليد المخططات المخصصة |
| `components/ai/FileExporter.tsx` | شريط تحميل الملفات (قابل لإعادة الاستخدام في أي صفحة فيها نتيجة توليد) |
| `components/ai/AiStudioTabs.tsx` | تبويبات الاستوديو الثلاثة |

**الصفحة:** `app/ai-studio` — استوديو ماجيكلي (صور + مخططات + ملفات) + جدول حدود الباقات.
متربوطة في `/study-tools` والـ sitemap.

### 🔗 الربط مع الموجود

- **الشات الموحّد** (`UnifiedChat`): رسائل المساعد بتتعرض دلوقتي عبر `MarkdownRenderer` — أي مخطط يرسمه الـ AI يظهر تفاعلي فورًا.
- **الـ Prompt**: `DIAGRAM_GUIDELINES` اتحقنت في `buildMagiclySystemPrompt` (lib/magicly-ai.ts) وفي مسار `/api/unified-ai` (lib/unified-ai/unified-ai.ts مع رفع max_tokens لـ 2048).
- **الاقتصاد**: راوتات التوليد بتستخدم نفس نمط `guardAiAccessAndReserve`/`refundAiCreditIfNeeded` + طبقة حدود جديدة فوقها (`service-registry`) بتقرأ الباقة من `entitlements` الحالي (خطة `premium` القائمة = باقة Pro).
- **FileExporter** متاح للدمج في أي تدفق فيه بيانات مولدة (نتايج الكويزات والملخصات).

## 📊 مصفوفة الباقات المطبقة

| الخدمة | Free | Pro | Ultra |
|---|---|---|---|
| الصور | ❌ | 5/يوم | غير محدود |
| المخططات | 3/يوم | 20/يوم | غير محدود |
| PDF | 5/يوم | 50/يوم | غير محدود |
| Word/Excel | ❌ | 20/يوم | غير محدود |
| PowerPoint | ❌ | 10/يوم | غير محدود |
| موديل الصور | — | SDXL | DALL-E 3 + Flux + SDXL |

تحديد الباقة: `plan:ultra` → Ultra، `plan:pro` أو `plan:premium` أو `feature:premium-ai` → Pro، غير كده Free.

## 🔑 متغيرات البيئة الجديدة (.env / Vercel)

```
OPENAI_API_KEY=        # DALL-E 3
REPLICATE_API_TOKEN=   # Flux 1.1 Pro
STABILITY_API_KEY=     # SDXL
```

من غير أي مفتاح خدمة الصور بتعتذر برسالة واضحة. المخططات والملفات شغالة من غير مفاتيح إضافية.

## 🧪 التحقق

- `tsc --noEmit` — نظيف.
- `vitest run lib/ai/__tests__/ai-content-services.test.ts` — 28 اختبار (بناء الـ prompts، تنظيف كود Mermaid، حدود الباقات والعدّادات والاسترجاع، توليد DOCX/XLSX/PPTX/PDF فعلًا في الذاكرة، إرشادات الـ prompt).
- الـ build الكامل بيعطل في بيئة التطوير دي على تحميل خطوط Google فقط (قيود شبكة الساندبوكس) — نفس العطل موجود قبل التغييرات، وعلى Vercel ما يحصلش.

## ⚠️ ملاحظات تصميم

- **استرجاع الحدود**: لو فشل التوليد قبل التسليم بيتسترجع حد الخدمة (ما عدا الصور — المزوّد المدفوع بيكون اتحاسب فعلًا في محاولات فاشلة، فده متعمد لمنع الاستنزاف).
- **خط الـ PDF العربي**: بيتسجل خط Amiri وقت التشغيل من CDN مع فولو-آوتوماتيك لـ Helvetica لو الشبكة مش متاحة.
- **أسماء الملفات**: بتتشافط من الرموز الخطرة وبتتبعت بـ `filename*=UTF-8''` (RFC 5987) لدعم العربية.
