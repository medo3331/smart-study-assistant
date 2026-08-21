/* ==========================================================================
   مسارات المهنة — المهارات اللي بتوصل لدور

   ليه في الكود مش في الداتابيز؟ دي محتوى بيتغيّر مع نسخة التطبيق مش مع
   المستخدم. لو عاشت في جدول كان كل مهارة جديدة محتاجة seed وmigration،
   والداتابيز بتحفظ حاجة واحدة بس: إيه اللي المستخدم علّم عليه
   (`career_skills.skill_id`) — شوف db/pages.sql:100.

   ⚠️⚠️ الـ `id` عقد مع الداتابيز. أي صف في `career_skills` بيشاور على
   `skill_id` بالنص. يعني:
     • **متغيّرش id موجود.** لو غيّرته، كل اللي علّموا على المهارة دي
       بيخسروا العلامة — الصف بيفضل في الجدول بيشاور على حاجة مش موجودة.
     • غيّر الـ `label` والـ `hint` براحتك، دول عرض بس.
     • مهارة مالهاش لازمة تاني؟ شيلها من هنا عادي. الصفوف اليتيمة في
       الجدول مش بتكسر حاجة (`findSkill` بترجّع undefined والصفحة
       بتتجاهلها)، وبتفضل موجودة لو رجّعتها بعدين.
   ========================================================================== */

import type { FieldId } from "@/lib/user-persona";

export interface CareerSkill {
  /** ثابت للأبد — بيتخزّن في الداتابيز. الشكل: "<track>.<skill>" */
  id: string;
  /** أسماء التقنيات بالإنجليزي عن قصد (React مش «رياكت»)، والمفاهيم بالعربي */
  label: string;
  /** سطر بيقول «إيه اللي يخلّيك تعلّم عليها» — الفرق بين «سمعت عنها» و«عملتها» */
  hint: string;
}

export interface CareerStage {
  id: string;
  title: string;
  /** إيه اللي المرحلة دي بتفتحه */
  blurb: string;
  skills: CareerSkill[];
}

export interface CareerTrack {
  id: string;
  label: string;
  emoji: string;
  /** 🌍 المجال اللي المسار ده بيتبعه — الصفحة بتفلتر بيه عشان طالب طب
   *  ميشوفش شجرة مهارات فرونت إند. لو المستخدم مالوش مجال، بيشوف الكل. */
  field: FieldId;
  /** الدور اللي المسار بيوصّل له بلغة سوق الشغل */
  role: string;
  blurb: string;
  stages: CareerStage[];
}

/* --------------------------------------------------------------------------
   المسارات

   المراحل مرتّبة: كل مرحلة بتفترض اللي قبلها. مش قانون — المستخدم بيعلّم
   على اللي يعرفه بأي ترتيب — بس الترتيب بيقول له «ابدأ منين».

   الـ hint مكتوب كفعل مش كتعريف: «تعمل» و«تظبّط» مش «هي لغة بتستخدم في».
   السبب إن السؤال هو «علّم لو تعرفها»، والفعل بيخلّي الجواب واضح.

   🌍 كل مسار متعلّم بمجاله (`field`). الصفحة بتعرض مسارات مجال المستخدم
   بس — عشان اللي مالوش علاقة بالبرمجة ميفتحش صفحة تقول له ضمناً
   «المنصة دي مش ليك».
   -------------------------------------------------------------------------- */

export const CAREER_TRACKS: CareerTrack[] = [
  {
    id: "frontend",
    label: "الواجهات",
    emoji: "🎨",
    field: "programming",
    role: "Frontend Developer",
    blurb: "اللي المستخدم بيشوفه ويلمسه. أقرب مسار للنتيجة المرئية، وأسهل حاجة تعملها بورتفوليو.",
    stages: [
      {
        id: "frontend.basics",
        title: "الأساسيات",
        blurb: "بعدها تقدر تعمل صفحة شغّالة وتنزّلها على النت.",
        skills: [
          { id: "frontend.html", label: "HTML", hint: "تبني صفحة بعناصر صح (مش divs في كل حاجة)" },
          { id: "frontend.css", label: "CSS", hint: "تظبّط شكل وتخطيط من غير ما تحاول وتشوف" },
          { id: "frontend.layout", label: "Flexbox و Grid", hint: "تعمل تخطيط يتظبّط لوحده على أي مقاس" },
          { id: "frontend.js", label: "JavaScript", hint: "تكتب منطق: شروط، دوال، مصفوفات، async" },
          { id: "frontend.dom", label: "الـ DOM", hint: "تغيّر الصفحة وترد على ضغطات المستخدم" },
          { id: "frontend.git", label: "Git", hint: "تعمل commit وbranch وتحل conflict" },
          { id: "frontend.devtools", label: "DevTools", hint: "تلاقي سبب مشكلة من الـ console والـ network" },
        ],
      },
      {
        id: "frontend.mid",
        title: "المستوى المتوسط",
        blurb: "بعدها تقدر تشتغل في فريق على تطبيق حقيقي.",
        skills: [
          { id: "frontend.react", label: "React", hint: "تفكّك الواجهة لكومبوننتس وتعرف امتى ترندر" },
          { id: "frontend.state", label: "إدارة الحالة", hint: "تعرف الحالة تعيش فين، وتتجنّب تكرارها" },
          { id: "frontend.api", label: "استهلاك APIs", hint: "تجيب داتا وتتعامل مع التحميل والخطأ" },
          { id: "frontend.ts", label: "TypeScript", hint: "تكتب أنواع بتلقّط الغلط قبل التشغيل" },
          { id: "frontend.forms", label: "الفورمز والتحقّق", hint: "تتحقّق من المدخلات وتوري خطأ مفهوم" },
          { id: "frontend.responsive", label: "التصميم المتجاوب", hint: "تشتغل على الموبايل زي الديسكتوب" },
          { id: "frontend.a11y", label: "الوصولية", hint: "تشتغل بالكيبورد وقارئ الشاشة" },
        ],
      },
      {
        id: "frontend.advanced",
        title: "المستوى المتقدّم",
        blurb: "بعدها تبقى اللي بيتّاخد رأيه في قرارات المشروع.",
        skills: [
          { id: "frontend.nextjs", label: "Next.js", hint: "تعرف امتى السيرفر وامتى المتصفح" },
          { id: "frontend.testing", label: "الاختبارات", hint: "تكتب اختبار بيفشل لما تكسر حاجة" },
          { id: "frontend.perf", label: "الأداء", hint: "تقيس الأول وبعدين تحسّن — bundle وrender" },
          { id: "frontend.architecture", label: "هيكلة المشروع", hint: "تقسّم مشروع كبير على فريق" },
          { id: "frontend.review", label: "مراجعة الكود", hint: "تراجع شغل غيرك وتاخد مراجعة عليك" },
        ],
      },
    ],
  },

  {
    id: "backend",
    label: "الخوادم",
    emoji: "⚙️",
    field: "programming",
    role: "Backend Developer",
    blurb: "اللي شغّال ورا الكواليس: الداتا والمنطق والأمان. أقل حاجة مرئية وأكتر حاجة بتفرق لما تكبر.",
    stages: [
      {
        id: "backend.basics",
        title: "الأساسيات",
        blurb: "بعدها تقدر تعمل API بيرد على طلب.",
        skills: [
          { id: "backend.lang", label: "لغة سيرفر", hint: "تعرف لغة (Node أو Python) لدرجة إنك تحل بيها مشكلة" },
          { id: "backend.http", label: "HTTP", hint: "تعرف الميثودز والأكواد ومعنى كل واحد" },
          { id: "backend.sql", label: "SQL", hint: "تكتب select بـ join وgroup by من غير مساعدة" },
          { id: "backend.schema", label: "تصميم الجداول", hint: "تعمل سكيما مش بتكرّر الداتا" },
          { id: "backend.cli", label: "سطر الأوامر", hint: "تتحرّك في سيرفر لينكس وتقرا اللوجز" },
          { id: "backend.git", label: "Git", hint: "تعمل commit وbranch وتحل conflict" },
        ],
      },
      {
        id: "backend.mid",
        title: "المستوى المتوسط",
        blurb: "بعدها تقدر تنزّل خدمة وتسيبها شغّالة.",
        skills: [
          { id: "backend.rest", label: "تصميم REST", hint: "تصمّم endpoints متوقّعة ومتّسقة" },
          { id: "backend.auth", label: "الهوية والصلاحيات", hint: "تعرف الفرق بين «مين ده» و«مسموح له بإيه»" },
          { id: "backend.validation", label: "التحقّق من المدخلات", hint: "متثقش في أي حاجة جاية من العميل" },
          { id: "backend.orm", label: "الـ ORM والـ migrations", hint: "تغيّر السكيما من غير ما تفقد داتا" },
          { id: "backend.errors", label: "الأخطاء واللوجز", hint: "تسجّل اللي يكفي تفهم مشكلة حصلت إمبارح" },
          { id: "backend.docker", label: "Docker", hint: "تحزم الخدمة عشان تشتغل في أي مكان" },
          { id: "backend.deploy", label: "النشر", hint: "تنزّل نسخة جديدة من غير ما توقّف الخدمة" },
        ],
      },
      {
        id: "backend.advanced",
        title: "المستوى المتقدّم",
        blurb: "بعدها تبقى بتاخد قرارات بتوصل لسنين.",
        skills: [
          { id: "backend.caching", label: "الكاش", hint: "تعرف إيه يتكاش وامتى يبطل" },
          { id: "backend.queues", label: "الطوابير والمهام", hint: "تشيل الشغل الطويل بره الطلب" },
          { id: "backend.scaling", label: "التوسّع", hint: "تلاقي عنق الزجاجة بالقياس مش بالتخمين" },
          { id: "backend.security", label: "الأمان", hint: "تعرف OWASP وتراجع كودك عليها" },
          { id: "backend.observability", label: "المراقبة", hint: "تعرف إن فيه مشكلة قبل ما المستخدم يقول لك" },
        ],
      },
    ],
  },

  {
    id: "data",
    label: "البيانات",
    emoji: "📊",
    field: "programming",
    role: "Data Analyst / ML Engineer",
    blurb: "تحوّل أرقام لقرار. مسار بيحب الرياضة والسؤال أكتر من الأدوات.",
    stages: [
      {
        id: "data.basics",
        title: "الأساسيات",
        blurb: "بعدها تقدر تجاوب سؤال من ملف داتا.",
        skills: [
          { id: "data.python", label: "Python", hint: "تكتب سكربت بيقرا ملف ويطلّع نتيجة" },
          { id: "data.sql", label: "SQL", hint: "تجيب اللي محتاجه من داتابيز فيها جداول كتير" },
          { id: "data.pandas", label: "pandas", hint: "تنضّف داتا وحشة وتحوّل شكلها" },
          { id: "data.stats", label: "الإحصاء الوصفي", hint: "تعرف امتى المتوسط بيكدب والوسيط أصدق" },
          { id: "data.viz", label: "الرسم البياني", hint: "تختار الرسمة اللي بتوصّل الفكرة" },
        ],
      },
      {
        id: "data.mid",
        title: "المستوى المتوسط",
        blurb: "بعدها تقدر تبني موديل وتحكم عليه.",
        skills: [
          { id: "data.cleaning", label: "تجهيز البيانات", hint: "تتعامل مع الناقص والشاذ من غير ما تغشّ نفسك" },
          { id: "data.features", label: "هندسة الخصائص", hint: "تطلّع من الداتا الخام حاجة الموديل يفهمها" },
          { id: "data.sklearn", label: "scikit-learn", hint: "تدرّب موديل وتقسّم train/test صح" },
          { id: "data.metrics", label: "مقاييس التقييم", hint: "تعرف ليه الـ accuracy بتكدب في داتا غير متوازنة" },
          { id: "data.inference", label: "الاستدلال الإحصائي", hint: "تفرّق بين ارتباط وسببية" },
          { id: "data.notebooks", label: "الـ notebooks", hint: "تكتب تحليل حد تاني يقدر يعيده" },
        ],
      },
      {
        id: "data.advanced",
        title: "المستوى المتقدّم",
        blurb: "بعدها موديلك بيشتغل في الحقيقة مش في نوتبوك.",
        skills: [
          { id: "data.deeplearning", label: "التعلّم العميق", hint: "تدرّب شبكة وتعرف امتى مش محتاجها" },
          { id: "data.pipelines", label: "خطوط البيانات", hint: "تعمل تحديث تلقائي بدل ما تشغّل بإيدك" },
          { id: "data.mlops", label: "نشر الموديلات", hint: "تنزّل موديل وتراقب انحرافه" },
          { id: "data.experiments", label: "التجارب و A/B", hint: "تصمّم تجربة نتيجتها تتصدّق" },
          { id: "data.storytelling", label: "توصيل النتيجة", hint: "تقنع صاحب قرار مش بيقرا كود" },
        ],
      },
    ],
  },

  {
    id: "cs",
    label: "الأساسيات النظرية",
    emoji: "🧠",
    field: "programming",
    role: "أي دور — ومقابلات التقنية",
    blurb: "مش مسار لوحده، ده اللي بيفرق في المقابلات وفي حل المشاكل الصعبة. بيخدم أي تراك فوق.",
    stages: [
      {
        id: "cs.basics",
        title: "الأساسيات",
        blurb: "بعدها تقدر تقرا كود وتقول بيعمل إيه وبكام.",
        skills: [
          { id: "cs.arrays", label: "المصفوفات والنصوص", hint: "تلفّ وتبحث وتقلب من غير مكتبة" },
          { id: "cs.complexity", label: "تعقيد الوقت والمساحة", hint: "تقول Big-O لكودك وتعرف ليه" },
          { id: "cs.hashing", label: "الـ Hash Maps", hint: "تحوّل بحث خطي لبحث فوري" },
          { id: "cs.recursion", label: "الاستدعاء الذاتي", hint: "تكتب دالة بتنادي نفسها وتوقف صح" },
          { id: "cs.sorting", label: "الترتيب والبحث الثنائي", hint: "تعرف امتى ترتّب الأول" },
        ],
      },
      {
        id: "cs.mid",
        title: "المستوى المتوسط",
        blurb: "بعدها معظم أسئلة المقابلات تبقى مألوفة.",
        skills: [
          { id: "cs.linkedlists", label: "القوايم المترابطة", hint: "تلفّ وتعكس وتلاقي دورة" },
          { id: "cs.trees", label: "الأشجار", hint: "تمشي على شجرة بالعمق وبالعرض" },
          { id: "cs.graphs", label: "الرسوم البيانية", hint: "تحل مشكلة مسار بـ BFS/DFS" },
          { id: "cs.dp", label: "البرمجة الديناميكية", hint: "تشوف التكرار في المسألة وتحفظ نتيجته" },
          { id: "cs.patterns", label: "أنماط الحل", hint: "المؤشرين، النافذة المتحركة، الـ heap" },
        ],
      },
      {
        id: "cs.advanced",
        title: "المستوى المتقدّم",
        blurb: "بعدها تقدر تتكلم في تصميم نظام على السبورة.",
        skills: [
          { id: "cs.systemdesign", label: "تصميم الأنظمة", hint: "تصمّم نظام وتقول ليه اخترت كل قطعة" },
          { id: "cs.concurrency", label: "التوازي", hint: "تعرف الـ race condition قبل ما تحصل" },
          { id: "cs.tradeoffs", label: "المقايضات", hint: "تقول إيه اللي بتخسره في كل اختيار" },
          { id: "cs.communication", label: "الشرح بصوت عالي", hint: "تفكّر بصوت عالي والمقابل يمشي معاك" },
        ],
      },
    ],
  },

  /* ------------------------------------------------------------------------
     المجالات غير البرمجية

     نفس الهيكل بالظبط: تلات مراحل مرتّبة، والـ hint فعل مش تعريف.
     الـ id بيبدأ باسم المسار زي الباقي، وهو عقد مع `career_skills.skill_id`
     من أول لحظة يتحفظ فيها — فمتغيّرهوش بعد ما ينزل للناس.
     ------------------------------------------------------------------------ */

  {
    id: "medicine",
    label: "المسار الطبي",
    emoji: "🩺",
    field: "medical",
    role: "طبيب / صيدلي ممارس",
    blurb: "من حفظ الأساسيات لقراءة الحالة. المسار اللي بيفرق فيه التطبيق الإكلينيكي عن الكتاب.",
    stages: [
      {
        id: "medicine.basics",
        title: "العلوم الأساسية",
        blurb: "بعدها تفهم الجسم شغّال إزاي قبل ما تفهم بيتعطّل إزاي.",
        skills: [
          { id: "medicine.anatomy", label: "التشريح", hint: "تحدّد العضو وعلاقته باللي حواليه من غير أطلس" },
          { id: "medicine.physiology", label: "الفسيولوجي", hint: "تشرح الوظيفة خطوة بخطوة مش تحفظ الاسم" },
          { id: "medicine.biochem", label: "الكيمياء الحيوية", hint: "تربط المسار الحيوي بعرض مرضي" },
          { id: "medicine.histology", label: "الأنسجة", hint: "تعرف النسيج من الشريحة" },
          { id: "medicine.terminology", label: "المصطلح الطبي", hint: "تفكّك أي مصطلح لجذوره وتفهمه من غير قاموس" },
        ],
      },
      {
        id: "medicine.clinical",
        title: "المرحلة الإكلينيكية",
        blurb: "بعدها تقدر تاخد تاريخ مرضي وتوصل لتشخيص محتمل.",
        skills: [
          { id: "medicine.pathology", label: "الباثولوجي", hint: "تربط التغيّر النسيجي بالمرض وأعراضه" },
          { id: "medicine.pharmacology", label: "الفارماكولوجي", hint: "تعرف آلية الدواء وتفاعلاته وموانعه" },
          { id: "medicine.history", label: "أخذ التاريخ المرضي", hint: "تسأل الأسئلة اللي تضيّق التشخيص" },
          { id: "medicine.examination", label: "الفحص الإكلينيكي", hint: "تعمل فحص منظّم وتلاقي العلامة" },
          { id: "medicine.differential", label: "التشخيص التفريقي", hint: "ترتّب الاحتمالات وتقول ليه" },
          { id: "medicine.labs", label: "قراءة التحاليل", hint: "تفسّر النتيجة في سياق الحالة مش لوحدها" },
        ],
      },
      {
        id: "medicine.professional",
        title: "الممارسة والتقدّم",
        blurb: "بعدها تبقى جاهز للامتحانات والممارسة الفعلية.",
        skills: [
          { id: "medicine.imaging", label: "قراءة الأشعة", hint: "تقرا الصورة بشكل منهجي وتلاقي الشاذ" },
          { id: "medicine.evidence", label: "الطب المبني على الدليل", hint: "تقيّم دراسة وتعرف تنطبق على مريضك ولا لأ" },
          { id: "medicine.communication", label: "التواصل مع المريض", hint: "توصّل خبر صعب بلغة مفهومة" },
          { id: "medicine.emergency", label: "التعامل مع الطوارئ", hint: "ترتّب أولوياتك لما الوقت ضيّق" },
          { id: "medicine.exams", label: "امتحانات التخصص", hint: "تذاكر لامتحان بنك أسئلة مش لامتحان مقالي" },
        ],
      },
    ],
  },

  {
    id: "language",
    label: "إتقان اللغة",
    emoji: "🗣️",
    field: "languages",
    role: "متحدث متقدّم / مترجم",
    blurb: "من الكلمات للاستخدام الحقيقي. المسار اللي بيقيس إنك بتتكلم مش إنك بتعرف قواعد.",
    stages: [
      {
        id: "language.foundation",
        title: "الأساس",
        blurb: "بعدها تقدر تكوّن جملة صح وتفهم اللي بيتقال ببطء.",
        skills: [
          { id: "language.alphabet", label: "الحروف والنطق", hint: "تنطق أي كلمة جديدة صح من شكلها" },
          { id: "language.vocab1000", label: "أول ١٠٠٠ كلمة", hint: "تفهم أغلب جملة يومية من غير قاموس" },
          { id: "language.grammar", label: "القواعد الأساسية", hint: "تكوّن جملة في الأزمنة الأساسية صح" },
          { id: "language.listening", label: "الاستماع البطيء", hint: "تفهم محتوى موجّه للمتعلمين من غير ترجمة" },
        ],
      },
      {
        id: "language.usage",
        title: "الاستخدام",
        blurb: "بعدها تقدر تتكلم مع حد حقيقي من غير ما تتجمّد.",
        skills: [
          { id: "language.speaking", label: "المحادثة", hint: "تكمّل محادثة ٥ دقايق من غير ما تترجم في دماغك" },
          { id: "language.writing", label: "الكتابة", hint: "تكتب فقرة مترابطة من غير أخطاء أساسية" },
          { id: "language.native", label: "المحتوى الأصلي", hint: "تتابع فيديو لمتحدث أصلي بسرعة طبيعية" },
          { id: "language.idioms", label: "التعبيرات الشائعة", hint: "تفهم التعبير المجازي وتستخدمه في مكانه" },
          { id: "language.correction", label: "التصحيح الذاتي", hint: "تلاحظ غلطك وأنت بتتكلم وتصلّحه" },
        ],
      },
      {
        id: "language.mastery",
        title: "الإتقان",
        blurb: "بعدها تقدر تستخدم اللغة في شغل أو امتحان معتمد.",
        skills: [
          { id: "language.exam", label: "الامتحانات المعتمدة", hint: "تعرف شكل IELTS أو TOEFL وتتدرّب على توقيته" },
          { id: "language.formal", label: "اللغة الرسمية", hint: "تكتب إيميل أو تقرير بنبرة مهنية" },
          { id: "language.presentation", label: "العرض والتقديم", hint: "تقدّم موضوع قدام ناس باللغة دي" },
          { id: "language.translation", label: "الترجمة", hint: "تنقل المعنى مش الكلمات" },
          { id: "language.register", label: "تغيير النبرة", hint: "تفرّق بين الكلام مع صاحبك والكلام مع مدير" },
        ],
      },
    ],
  },

  {
    id: "business",
    label: "الأعمال والتسويق",
    emoji: "📈",
    field: "business",
    role: "أخصائي تسويق / محلل أعمال",
    blurb: "من فهم الأرقام لاتخاذ القرار. المسار اللي كل مهارة فيه بتتقاس بنتيجة.",
    stages: [
      {
        id: "business.basics",
        title: "الأساسيات",
        blurb: "بعدها تقرا وضع شركة من أرقامها.",
        skills: [
          { id: "business.accounting", label: "المحاسبة", hint: "تقرا ميزانية وتعرف الشركة كسبانة ولا لأ" },
          { id: "business.excel", label: "Excel", hint: "تعمل جدول بمعادلات وpivot من غير ما تدوّر" },
          { id: "business.economics", label: "الاقتصاد", hint: "تفسّر تغيّر سعر بالعرض والطلب" },
          { id: "business.marketing", label: "مبادئ التسويق", hint: "تحدّد الجمهور والرسالة قبل القناة" },
          { id: "business.writing", label: "الكتابة المهنية", hint: "تكتب إيميل أو تقرير حد يقراه لآخره" },
        ],
      },
      {
        id: "business.applied",
        title: "التطبيق",
        blurb: "بعدها تقدر تدير حملة أو مشروع صغير لوحدك.",
        skills: [
          { id: "business.analytics", label: "تحليل البيانات", hint: "تطلع خلاصة من داتا خام مش رسمة حلوة" },
          { id: "business.digital", label: "التسويق الرقمي", hint: "تعمل حملة وتقيس عائدها" },
          { id: "business.seo", label: "السيو", hint: "تعرف ليه صفحة بتترتب قبل التانية" },
          { id: "business.copy", label: "كتابة الإعلانات", hint: "تكتب نص بيخلّي حد يعمل حاجة" },
          { id: "business.crm", label: "إدارة العملاء", hint: "تتابع عميل من أول تواصل للتعاقد" },
          { id: "business.pm", label: "إدارة المشاريع", hint: "تقسّم شغل على ناس وتواعيد وتتابعه" },
        ],
      },
      {
        // مش "business.strategy" عشان ده id مهارة تحت خالص — والاتنين
        // بيتحوّلوا لمفاتيح، فالتشابه فخ للي جاي يقرا.
        id: "business.stage-strategy",
        title: "الاستراتيجية",
        blurb: "بعدها تقدر تدافع عن قرار قدام إدارة.",
        skills: [
          { id: "business.bi", label: "Power BI", hint: "تبني داشبورد بيتحدّث لوحده" },
          { id: "business.feasibility", label: "دراسة الجدوى", hint: "تحسب لو الفكرة تستاهل الفلوس ولا لأ" },
          { id: "business.negotiation", label: "التفاوض", hint: "توصل لاتفاق الطرفين كسبانين فيه" },
          { id: "business.presentation", label: "العرض للإدارة", hint: "تلخّص في سلايد واحدة وتدافع عنها" },
          { id: "business.strategy", label: "التفكير الاستراتيجي", hint: "تربط قرار النهاردة بهدف بعد سنة" },
        ],
      },
    ],
  },

  {
    id: "academic",
    label: "التفوّق الدراسي",
    emoji: "📚",
    field: "school",
    role: "طالب متفوّق / باحث مبتدئ",
    blurb: "مش مادة معيّنة — دي المهارات اللي بتخلّي أي مادة أسهل. بتخدم أي مسار تاني كمان.",
    stages: [
      {
        id: "academic.habits",
        title: "عادات المذاكرة",
        blurb: "بعدها تذاكر بوقت أقل وتفتكر أكتر.",
        skills: [
          { id: "academic.schedule", label: "تنظيم الوقت", hint: "تعمل جدول تمشي عليه فعلاً مش تكتبه بس" },
          { id: "academic.focus", label: "التركيز العميق", hint: "تقعد ٥٠ دقيقة من غير ما تمسك الموبايل" },
          { id: "academic.notes", label: "تدوين الملاحظات", hint: "تكتب ملخّص ينفع ترجعله بعد شهر" },
          { id: "academic.recall", label: "الاسترجاع النشط", hint: "تختبر نفسك من غير ما تبص على الكتاب" },
          { id: "academic.spacing", label: "المراجعة المتباعدة", hint: "ترجّع المعلومة قبل ما تنساها بيوم" },
        ],
      },
      {
        id: "academic.understanding",
        title: "الفهم العميق",
        blurb: "بعدها تحل السؤال اللي شكله جديد.",
        skills: [
          { id: "academic.explain", label: "الشرح للغير", hint: "تشرح المفهوم لحد مش دارسه ويفهم" },
          { id: "academic.problems", label: "حل المسائل", hint: "تعرف تبدأ منين في مسألة مش شبه اللي حليتها" },
          { id: "academic.connect", label: "الربط بين المواضيع", hint: "تشوف الفكرة الواحدة في مادتين" },
          { id: "academic.mistakes", label: "التعلّم من الغلط", hint: "تراجع غلطك وتفهم سببه مش تصلّحه بس" },
          { id: "academic.reading", label: "القراءة الفعّالة", hint: "تطلع الفكرة الأساسية من فصل بسرعة" },
        ],
      },
      {
        id: "academic.exams",
        title: "الامتحانات والبحث",
        blurb: "بعدها تدخل الامتحان عارف إنت هتعمل إيه.",
        skills: [
          { id: "academic.strategy", label: "استراتيجية الامتحان", hint: "توزّع وقتك على الأسئلة قبل ما تبدأ" },
          { id: "academic.anxiety", label: "التعامل مع التوتر", hint: "تفضل مركّز حتى لو السؤال الأول صعب" },
          { id: "academic.research", label: "مهارات البحث", hint: "تلاقي مصدر موثوق وتفرّقه عن غيره" },
          { id: "academic.citation", label: "التوثيق", hint: "تنسب الفكرة لصاحبها بشكل صح" },
          { id: "academic.writing", label: "الكتابة الأكاديمية", hint: "تكتب بحث بحجة واضحة ومرتّبة" },
        ],
      },
    ],
  },

  {
    id: "design",
    label: "التصميم",
    emoji: "🎨",
    field: "design",
    role: "مصمم جرافيك / UI-UX",
    blurb: "من الأدوات للقرار البصري. المسار اللي البورتفوليو فيه أهم من الشهادة.",
    stages: [
      {
        id: "design.basics",
        title: "الأساسيات البصرية",
        blurb: "بعدها تعرف ليه التصميم ده حلو وده لأ.",
        skills: [
          { id: "design.principles", label: "مبادئ التصميم", hint: "تستخدم التباين والمحاذاة والتقارب عن قصد" },
          { id: "design.color", label: "نظرية الألوان", hint: "تختار باليت متناسقة وتقول ليه" },
          { id: "design.typography", label: "التايبوجرافي", hint: "تختار خط ومقاسات تخدم القراءة" },
          { id: "design.layout", label: "التكوين والتخطيط", hint: "ترتّب العناصر بحيث العين تمشي في مسار" },
          { id: "design.hierarchy", label: "التسلسل البصري", hint: "تخلّي الأهم يتشاف الأول من غير ما تكتب كلمة" },
        ],
      },
      {
        id: "design.tools",
        title: "الأدوات والتنفيذ",
        blurb: "بعدها تنفّذ اللي في دماغك بسرعة.",
        skills: [
          { id: "design.figma", label: "Figma", hint: "تبني واجهة بكومبوننتس تتعدّل من مكان واحد" },
          { id: "design.photoshop", label: "Photoshop", hint: "تعدّل صورة بشكل غير قابل للتدمير" },
          { id: "design.illustrator", label: "Illustrator", hint: "ترسم فيكتور يكبر من غير ما يبوظ" },
          { id: "design.prototype", label: "البروتوتايب", hint: "تعمل نموذج قابل للضغط يتجرّب" },
          { id: "design.handoff", label: "تسليم الملفات", hint: "تسلّم ملف منظّم حد تاني يشتغل عليه" },
        ],
      },
      {
        id: "design.professional",
        title: "الاحتراف",
        blurb: "بعدها تشتغل مع عميل أو في فريق منتج.",
        skills: [
          { id: "design.ux", label: "تجربة المستخدم", hint: "تبني على احتياج مستخدم مش على ذوقك" },
          { id: "design.research", label: "بحث المستخدم", hint: "تسأل أسئلة بتطلع معلومة مش تأكيد" },
          { id: "design.system", label: "Design System", hint: "تبني نظام يتوسّع مش شاشة واحدة حلوة" },
          { id: "design.portfolio", label: "البورتفوليو", hint: "تعرض القرار والنتيجة مش الصورة النهائية بس" },
          { id: "design.feedback", label: "استقبال التعديلات", hint: "تفرّق بين ملاحظة تخدم الشغل وذوق شخصي" },
          { id: "design.pricing", label: "تسعير الشغل", hint: "تسعّر بالقيمة مش بعدد الساعات" },
        ],
      },
    ],
  },
];

/* --------------------------------------------------------------------------
   مساعدات

   الحساب هنا مش في الصفحة عشان الصفحة تفضل عرض بس، ولو زوّدنا مسار
   الأرقام تظبط لوحدها.
   -------------------------------------------------------------------------- */

/** كل المهارات في كل المسارات — للعدّ والبحث. */
export const ALL_SKILLS: CareerSkill[] = CAREER_TRACKS.flatMap((track) =>
  track.stages.flatMap((stage) => stage.skills)
);

/** 🌍 مسارات مجال معيّن. لو المجال مش معروف (مستخدم قديم قبل ما العمود
 *  يتضاف) بنرجّع الكل — أحسن من شاشة فاضية. ولو مجال مالوش مسارات لسه،
 *  بنرجّع الكل كمان بدل ما الصفحة تبقى ميّتة. */
export function tracksForField(field?: FieldId | null): CareerTrack[] {
  if (!field) return CAREER_TRACKS;
  const matching = CAREER_TRACKS.filter((track) => track.field === field);
  return matching.length > 0 ? matching : CAREER_TRACKS;
}

/** خريطة id → مهارة. بتتبني مرة واحدة وقت تحميل الموديول. */
const SKILL_BY_ID = new Map(ALL_SKILLS.map((skill) => [skill.id, skill]));

/** بترجّع undefined لو الـ id مش موجود — يحصل لو الداتابيز فيها صف لمهارة
    اتشالت من الملف ده. الصفحة بتتجاهله بدل ما تكسر. */
export function findSkill(id: string): CareerSkill | undefined {
  return SKILL_BY_ID.get(id);
}

/** عدد المهارات في مسار — المقام في شريط التقدّم. */
export function trackSkillCount(track: CareerTrack): number {
  return track.stages.reduce((sum, stage) => sum + stage.skills.length, 0);
}

/** كام مهارة متحقّقة في المسار ده. */
export function achievedInTrack(track: CareerTrack, achieved: Set<string>): number {
  let count = 0;
  for (const stage of track.stages) {
    for (const skill of stage.skills) {
      if (achieved.has(skill.id)) count++;
    }
  }
  return count;
}

/** أول مهارة مش متحقّقة بالترتيب — «الحاجة الجاية». بترجّع null لو خلص كله. */
export function nextSkillInTrack(
  track: CareerTrack,
  achieved: Set<string>
): { stage: CareerStage; skill: CareerSkill } | null {
  for (const stage of track.stages) {
    for (const skill of stage.skills) {
      if (!achieved.has(skill.id)) return { stage, skill };
    }
  }
  return null;
}
