# P2 — خطوة عملية: حل تناقض Secondary (من P2_SECONDARY_AUDIT.md)

التناقض المُثبت من الكود:
- SecondaryDashboard.tsx موجود وكامل UI
- experience.ts يقول: "ONLY primary is implemented now"
- SecondaryBriefing موجود لكن Secondary مش مُفعّل في experience resolver

النتيجة: Secondary = UI بدون تكامل نظامي كامل.

أول خطوة عملية (لا تحتاج كود جديد — فقط قرار + توثيق):
1. نُعدّل experience.ts (أو نوثّق القرار) ليعكس الحقيقة: Secondary = في التطوير (ليس "مكتمل" ولا "غير موجود").
2. نحدد بوضوح: Secondary يستخدم AI Router الحالي (مش Tutor OS بعد) — أي تفاعل AI في Secondary يجب أن يكون عبر Router الموجود.
3. نحدد مقياس التقدم لـ Secondary مؤقتًا: بما إن DB لا تدعم graph/evidence بعد، نستخدم "إكمال درس / درجة / نسبة تقدم" كمقياس مؤقت — مع توثيق إن ده مش "mastery" حقيقي.
4. لا نبدأ ميزات جديدة (Graduate/Freelancer) قبل إكمال هذه الخطوة.

القرار المُقترح (للموافقة أو الرفض من المستخدم):
- Secondary يُعتبر رسميًا "في التطوير" حتى يُربط بـ experience resolver ويُحدد مقياس التقدم.
- AI في Secondary = Router الحالي فقط.
- لا Tutor OS ميزات في Secondary الآن.
