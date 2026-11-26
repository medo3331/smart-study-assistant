# P2 — مراجعة Secondary من الكود (Reality Sync)

الموجود فعليًا (من الكود في smart-study-assistant):
- SecondaryDashboard.tsx: Dashboard كامل
- SecondaryAssistantCard.tsx: مساعد شخصي مع greeting حسب الوقت + Briefing خاص بـ Secondary
- SecondaryGoalInput.tsx: إدخال أهداف حقيقية (أذاكر الفيزياء / أحل امتحان / أتدرب)
- SecondarySubjectGrid + SecondaryProgress: موجودون في Dashboard
- lib/personal-assistant/secondary.ts: Briefing خاص بـ Secondary (دور أكاديمي/مستقبلي)
- lib/education/experience.ts: Secondary موجود كـ ExperienceKind

التناقض المكتشف:
lib/education/experience.ts يقول صراحة:
"Future-ready for preparatory/secondary/baccalaureate/university, but ONLY primary is implemented now."

رغم وجود SecondaryDashboard كامل في الكود. ده يعني:
- UI Secondary موجود لكن "experience resolver" (النظام اللي يقرر أي تجربة تُعرض) يشير لـ primary فقط كـ "implemented".
- Secondary قد يكون "في الكود" لكن مش "مُفعّل" في نظام التجربة الكلي.
- أو: Secondary موجود جزئيًا (Dashboard) لكن مش متكامل مع باقي النظام (AI Router؟ DB؟ Progress؟).

ما هو غير مؤكد (UNKNOWN من الكود فقط):
- هل Secondary له AI Router خاص (routing مختلف عن Primary)؟
- هل الـ Progress في Secondary يُسجّل كـ "mastery per concept" أم "lesson complete" فقط؟
- هل "Exam adapter" في Secondary معزول فعليًا؟
- هل Secondary متصل بـ Tutor OS أو مجرد Dashboard مع AI Chat عادي؟

النتيجة لـ CTO:
Secondary = "موجود في الكود" + "قيد التطوير" في نفس الوقت. التناقض في experience.ts يؤكد إن العمل لم يكتمل بعد — مش مجرد "نقص ميزات" بل "نقص في التكامل بين الأنظمة".

الأولوية لـ P2:
1. حل تناقض experience.ts: إما Secondary مُفعّل بالكامل أو يُعتبر "في التطوير" رسميًا.
2. ربط Secondary بـ AI Router بشكل واضح (هل له routing خاص؟).
3. تحديد كيف يُقاس التقدم في Secondary — قبل أي ادعاء بـ "Tutor OS".
