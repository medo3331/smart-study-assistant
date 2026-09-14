# DATABASE.md — الحقيقة (بعد Reality Sync)

تحذير: الملف النظري السابق افترض schema منطقي مع كيانات: Learner / ConceptNode / GraphEdge / Misconception / TransferTask / Evidence (append-only) / NodeMastery / AdapterOverlay (معزول) / Session. ده مش متطابق مع DB الحقيقية.

## الواقع الفعلي (من Supabase / smart-study-assistant)

### ما هو موجود في DB (مؤكد من الكود / .env / scripts)
- Users / Auth: جدول مستخدمين حقيقي (Supabase Auth).
- Lessons / Content: دروس حقيقية مرتبطة بمراحل ومواضيع.
- Study Plans / Curriculum: خطط دراسية (curricula.json + DB relations).
- Education Context: سياق تعليمي لكل مرحلة (Primary / Preparatory / Secondary / University / Graduate / Freelancer) — موجود كبيانات حقيقية.
- Progress / Tracking: تقدم المستخدم في الدروس والخطط — موجود لكن مش مؤكد إذا كان "per concept node" أو "per lesson completion".
- Gamification / Rewards: نظام مكافآت موجود (نقاط / مكافآت).
- Worship System: موجود كجزء من المحتوى.
- AI Chat: جلسات دردشة موجودة لكن مش مؤكد إذا كانت تُخزّن كـ "structured evidence" أو مجرد "chat logs".

### ما هو غير موجود (أو غير مؤكد)
- "ConceptNode" ككيان منفصل مع `prerequisites` و `transfer-tasks`: غير مؤكد في DB الحقيقية. المحتوى منظم كدروس ومواضيع، مش كـ "graph nodes".
- "Evidence (append-only, spine_eligible)": غير موجود كجدول منفصل بالشكل النظري. التقدم قد يُسجّل كإكمال درس أو نتيجة اختبار — مش "multi-form transfer evidence".
- "NodeMastery" كإسقاط على Evidence: غير موجود. التقدم قد يكون "نسبة إكمال" أو "درجة" مش "mastery state per concept".
- "Misconception (catalog) + LearnerMisconception": غير مؤكد وجوده كجداول منفصلة. قد يكون جزء من نظام الأسئلة أو غير موجود.
- "AdapterOverlay (isolated exam adapter)": غير موجود كجدول منفصل مع "hard wall". محتوى الامتحان موجود ضمن المحتوى العام.
- "Session with explicit mode (spine vs exam_adapter)": غير مؤكد. جلسات الدردشة قد لا تُسجّل بـ "mode" واضح.

### الفجوة الحرجة
الرؤية النظرية (DATABASE.md + AI_SYSTEM.md): نظام يتعلّم من "deep understanding + transfer" عبر graph + evidence منظم.

الواقع: DB تقليدية نسبيًا (مستخدم + درس + خطة + تقدم). ده مش خطأ — ده واقع. لكن لو هدفنا "Tutor OS ذكي يتعلم الطالب بعمق"، فإحنا محتاجين إما:
(أ) نطوّر DB تدريجيًا نحو graph + evidence المنظم، أو
(ب) نعيد تصميمTutor OS ليعمل مع DB الحالية بدون افتراض graph غير موجود.

القرار لازم يتخذ بعد مراجعة الكود (مش افتراض).

### ما يجب توثيقه قبل أي تغيير
قبل أي اقتراح لتغيير DB أو إضافة جداول:
1. راجع scripts (مثل inspect-db.cjs، apply_ingest.js) لفهم العلاقات الحقيقية.
2. راجع .env.local / supabase config للتأكد من أسماء الجداول الفعلية.
3. لا تُضيف جدول "Evidence" أو "ConceptNode" بدون دليل إن الـ AI Router يحتاجه فعليًا.
4. Secondary هي الأولوية — أي تغيير DB يجب أن يخدم Secondary أولًا.

### UNKNOWN (لا نفترض)
- أسماء الجداول الدقيقة في Supabase (من .env فقط — مش مؤكد بدون فحص مباشر).
- هل فيه جدول "chat_sessions" أم "ai_interactions" أم لا شيء.
- كيف يُسجّل التقدم: per lesson / per subject / per user — مش مؤكد بالتفصيل.
- هل الـ DB تستخدم PostgreSQL (Supabase) مع أي extensions خاصة.
- مدى ارتباط الـ AI Router بـ DB مباشرة أم عبر API وسيط.

### قيود CTO للـ DATABASE
- لا نعيد تصميم DB بناءً على DATABASE.md النظري.
- لا نضيف جداول "Concept Graph" قبل ما نتحقق إن الـ AI Router محتاجها.
- أي تغيير في DB يجب أن يكون تدريجي ويخدم Secondary أولًا.
- البيانات الحالية في Supabase هي المصدر — لا نتجاهلها لصالح schema نظري.
