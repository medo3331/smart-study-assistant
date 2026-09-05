
export type Dictionary = {
  dir: 'rtl' | 'ltr';
  nav_login: string;
  /* نافبار اللاندينج الثابت: روابط التنقل + زر البداية + زر قائمة الموبايل */
  nav_home: string;
  nav_how: string;
  nav_features: string;
  nav_help: string;
  nav_start: string;
  nav_menu: string;
  /* وصولية: أسماء لاندماركس ونصوص بديلة لرموز الجدول */
  skip_to_content: string;
  nav_primary_label: string;
  /* لينك الرجوع للرئيسية فوق صفحات الأذرع (/features، /faq) */
  sub_back_home: string;
  diff_row_label: string;
  diff_yes: string;
  diff_no: string;
  hero_eyebrow: string;
  hero_title: string;
  hero_subtitle: string;
  hero_cta: string;
  hero_cta_secondary: string;
  annotation: string;
  // التمايز عن ChatGPT
  diff_eyebrow: string;
  diff_title: string;
  diff_chatgpt_label: string;
  diff_us_label: string;
  diff_row1: string;
  diff_row2: string;
  diff_row3: string;
  diff_row4: string;
  steps_eyebrow: string;
  step1_title: string;
  step1_desc: string;
  step2_title: string;
  step2_desc: string;
  step3_title: string;
  step3_desc: string;
  features_eyebrow: string;
  features_title: string;
  features_lede: string;
  /* لينك «شوف كل الميزات» تحت ملخّص اللاندينج (بيودّي /features) */
  features_see_all: string;
  /* الميزات: اتنين وعشرين مفتاح لاتناشر كارت. الترقيم مقصود إنه يفضل
     ترقيم مش أسماء وصفية — الكارت ممكن يتغير محتواه من غير ما يتغير مكانه. */
  feature1_title: string;
  feature1_desc: string;
  feature2_title: string;
  feature2_desc: string;
  feature3_title: string;
  feature3_desc: string;
  feature4_title: string;
  feature4_desc: string;
  feature5_title: string;
  feature5_desc: string;
  feature6_title: string;
  feature6_desc: string;
  feature7_title: string;
  feature7_desc: string;
  feature8_title: string;
  feature8_desc: string;
  feature9_title: string;
  feature9_desc: string;
  feature10_title: string;
  feature10_desc: string;
  feature11_title: string;
  feature11_desc: string;
  feature12_title: string;
  feature12_desc: string;

  footer_cta_title: string;
  footer_cta_button: string;
  /** وصف ماكيت الداشبورد لقارئ الشاشة */
  hero_mockup_alt: string;

  // جديد: كبسولات الثقة تحت أزرار البطل
  trust1: string;
  trust2: string;
  trust3: string;
  trust4: string;

  // جديد: نصوص ماكيت الداشبورد في البطل.
  // مأخوذة من الداشبورد الحقيقي (nav-config.ts و HeroSection.tsx) عشان
  // اللي الزائر بيشوفه يكون هو نفسه اللي هيلاقيه جوه بعد ما يسجّل.
  mock_nav_home: string;
  mock_nav_courses: string;
  mock_nav_workspace: string;
  mock_nav_ai: string;
  mock_nav_notes: string;
  mock_nav_planner: string;
  mock_upload_ok: string;
  mock_focus_label: string;
  mock_topic: string;
  mock_progress: string;
  mock_summary_title: string;
  mock_summary1: string;
  mock_summary2: string;
  mock_summary3: string;
  mock_flash_title: string;
  mock_flash_count: string;
  mock_quiz_title: string;
  mock_quiz_sub: string;

  // جديد: الشات المتحرك
  demo_file: string;
  demo_q1: string;
  demo_a1: string;
  demo_q2: string;
  demo_a2: string;

  showcase_eyebrow: string;
  showcase_title: string;
  showcase1_title: string;
  showcase1_desc: string;
  showcase2_title: string;
  showcase2_desc: string;
  showcase3_title: string;
  showcase3_desc: string;
  showcase4_title: string;
  showcase4_desc: string;
  showcase5_title: string;
  showcase5_desc: string;

  outcomes_eyebrow: string;
  outcomes_title: string;
  outcomes_lede: string;
  outcomes_cta: string;
  outcome1_title: string;
  outcome1_desc: string;
  outcome2_title: string;
  outcome2_desc: string;
  outcome3_title: string;
  outcome3_desc: string;

  /* العنوان مقسّم عشان جزء منه ياخد ضربة القلم الفسفوري.
     ⚠️ `hero_title_b` بيبقى فاضي لو الجزء المعلّم آخر الجملة (زي العربي
     الحالي: «من الملزمة للفهم.. بسحر»). العنصر في LandingHero بيتعامل مع
     الفاضي — من غير كده كان بيسيب مسافة زايدة آخر العنوان. */
  hero_title_a: string;
  hero_title_mark: string;
  hero_title_b: string;

  /* الاسم والسطر اللي تحته في النافبار والفوتر. `brand` هو الاسم لوحده
     (وهو اللي بيتكتب في حقوق النشر)، و `brand_tagline` سطر وصفي جنبه
     بلون الأكسنت — **مش** ضربة `.mark`: الهيرو تحته على بعد شعرة بياخد
     الضربة الوحيدة المسموحة في الشاشة على نفس الكلمة. */
  brand: string;
  brand_tagline: string;

  /* قسم "إزاي بيشتغل" — نصوصه كانت موجودة من غير قسم يعرضها */
  steps_title: string;

  /* صفحة الدخول */
  login_back: string;
  login_title_a: string;
  login_title_mark: string;
  login_subtitle: string;
  login_name_label: string;
  login_name_placeholder: string;
  login_email_label: string;
  login_email_placeholder: string;
  login_password_label: string;
  login_password_placeholder: string;
  login_password_hint: string;
  login_submit_signin: string;
  login_submit_signup: string;
  login_loading: string;
  login_no_account: string;
  login_no_account_cta: string;
  login_has_account: string;
  login_has_account_cta: string;
  login_or: string;
  login_guest: string;
  login_guest_loading: string;
  login_guest_hint: string;
  login_err_credentials: string;
  login_err_exists: string;
  login_err_signup: string;
  login_err_guest: string;
  login_ok_linked: string;
  login_ok_created: string;
  login_forgot_cta: string;
  login_forgot_title: string;
  login_forgot_submit: string;
  login_reset_title: string;
  login_reset_submit: string;
  login_back_signin: string;
  login_ok_reset_sent: string;
  login_ok_reset: string;
  login_err_reset: string;

  /* 👤 مختار الشخصية — سكشن مستقل تحت الهيرو.
     الاختيار بيحصل قبل التسجيل، وبيتخزن في localStorage لحد ما يبقى فيه حساب. */
  picker_eyebrow: string;
  picker_title: string;
  picker_step1: string;
  personaStudent: string;
  personaStudentDesc: string;
  personaGrad: string;
  personaGradDesc: string;
  personaFreelancer: string;
  personaFreelancerDesc: string;
  picker_step2: string;
  levelPrep: string;
  levelHigh: string;
  levelUni: string;
  levelMasters: string;
  /* المجال: المحور اللي بيحدّد عالم المستخدم. الاقتراحات في الخطوة اللي
     بعده بتتحسب بـ المجال × الشخصية، فمش ليستة واحدة للكل. */
  picker_step_field: string;
  picker_field_hint: string;
  fieldProgramming: string;
  fieldMedical: string;
  fieldLanguages: string;
  fieldBusiness: string;
  fieldSchool: string;
  fieldDesign: string;
  picker_step3: string;
  picker_track_hint: string;
  picker_track_placeholder: string;
  picker_cta: string;
  picker_cta_hint: string;
  picker_student_type: string;
  picker_university_type: string;
  picker_university: string;
  picker_faculty: string;
  picker_department: string;
  picker_level: string;
  picker_semester: string;

  /* ❓ الأسئلة الشائعة — عشر أسئلة.
     الترقيم مقصود زي الميزات والآراء: السؤال ممكن يتبدّل نصه من غير ما
     يتغير مكانه في الترتيب. عشان تضيف سؤال: زوّد `faq11_q`/`faq11_a`
     هنا وفي اللغتين، وضيف سطر في مصفوفة FAQS في components/FaqSection.tsx.
     عشان تشيل سؤال: امسح سطره من المصفوفة — المفاتيح ممكن تفضل. */
  faq_eyebrow: string;
  faq_title: string;
  faq_lede: string;
  /* لينك «كل الأسئلة الشائعة» تحت ملخّص اللاندينج (بيودّي /faq) */
  faq_see_all: string;
  /** تحت الأكورديون: «لسه عندك سؤال؟» + لينك التواصل */
  faq_more_text: string;
  faq_more_cta: string;
  faq1_q: string;
  faq1_a: string;
  faq2_q: string;
  faq2_a: string;
  faq3_q: string;
  faq3_a: string;
  faq4_q: string;
  faq4_a: string;
  faq5_q: string;
  faq5_a: string;
  faq6_q: string;
  faq6_a: string;
  faq7_q: string;
  faq7_a: string;
  faq8_q: string;
  faq8_a: string;
  faq9_q: string;
  faq9_a: string;
  faq10_q: string;
  faq10_a: string;

  /* 🦶 الفوتر */
  footer_tagline: string;
  /** عناوين الأعمدة */
  footer_col_product: string;
  footer_col_learn: string;
  footer_col_account: string;
  /** لينكات التنقل */
  footer_link_features: string;
  footer_link_how: string;
  footer_link_faq: string;
  footer_link_start: string;
  footer_link_dashboard: string;
  footer_link_community: string;
  footer_link_courses: string;
  footer_link_login: string;
  /** التواصل */
  footer_contact_title: string;
  footer_email_label: string;
  footer_whatsapp_label: string;
  /** أسفل الفوتر */
  footer_rights: string;
  footer_privacy: string;
  footer_terms: string;
  /** السطر الصغير جنب الحقوق */
  footer_made_with: string;
  /** developed by */
  footer_developed_by: string;
  /** لقارئ الشاشة: عنوان منطقة التنقل في الفوتر */
  footer_nav_label: string;
  footer_social_label: string;

  /* ==========================================================================
     🎬 مراحل الهيرو المتحركة

     الماكيت في الهيرو بقى بيلف على تلات مراحل: ارفع ← بيولّد ← ابدأ.
     كل مرحلة ليها ليبل في الشريط وحالة مختلفة في الماكيت.
     ========================================================================== */
  stage1_label: string;
  stage2_label: string;
  stage3_label: string;
  /** حالة الملف في كل مرحلة */
  stage_uploading: string;
  stage_reading: string;
  stage_ready: string;
  /** لقارئ الشاشة: وصف التتابع كله مرة واحدة بدل ما يتقري كل تغيير */
  stage_sequence_label: string;
  /** زرار الديمو في الهيرو */
  hero_cta_demo: string;

  /* ==========================================================================
     🎁 صفحة الديمو المفتوحة — /demo
     ========================================================================== */
  demo_meta_title: string;
  demo_meta_desc: string;
  demo_back: string;
  demo_eyebrow: string;
  demo_title_a: string;
  demo_title_mark: string;
  demo_lede: string;
  /** منطقة الرفع */
  demo_drop_title: string;
  demo_drop_hint: string;
  demo_drop_browse: string;
  demo_drop_formats: string;
  demo_sample_text: string;
  demo_sample_cta: string;
  demo_file_chosen: string;
  demo_start: string;
  /** المراحل أثناء التوليد */
  demo_step_read: string;
  demo_step_think: string;
  demo_step_build: string;
  demo_working: string;
  /** لقارئ الشاشة: إعلان حالة التوليد */
  demo_progress_label: string;
  /** النتيجة */
  demo_result_eyebrow: string;
  demo_result_summary: string;
  demo_result_cards: string;
  demo_result_cards_hint: string;
  demo_result_quiz: string;
  demo_result_plan: string;
  demo_card_flip: string;
  demo_quiz_correct: string;
  demo_quiz_wrong: string;
  demo_quiz_retry: string;
  demo_plan_day: string;
  /** الختام */
  demo_cta_title: string;
  demo_cta_lede: string;
  demo_cta_button: string;
  demo_again: string;
  /** الأخطاء */
  demo_err_generic: string;
  demo_err_size: string;
  demo_err_type: string;
  demo_err_network: string;
  /* ---- المرحلة ١: Auth & Onboarding Foundation ---- */
  welcome_title_a: string;
  welcome_title_mark: string;
  welcome_lede: string;
  welcome_cta_start: string;
  welcome_cta_login: string;
  welcome_cta_guest: string;
  welcome_terms: string;
  register_title: string;
  register_name_label: string;
  register_name_placeholder: string;
  register_email_label: string;
  register_password_label: string;
  register_submit: string;
  register_pw_weak: string;
  register_pw_medium: string;
  register_pw_strong: string;
  register_pw_hint: string;
  auth_google_cta: string;
  auth_phone_cta: string;
  auth_phone_soon: string;
  auth_or_continue: string;
  login_forgot_link: string;
  onboarding_step: string;
  onboarding_title: string;
  onboarding_subtitle: string;
  onboarding_role_student: string;
  onboarding_role_student_desc: string;
  onboarding_role_graduate: string;
  onboarding_role_graduate_desc: string;
  onboarding_role_freelancer: string;
  onboarding_role_freelancer_desc: string;
  onboarding_changeable_later: string;
  onboarding_skip: string;
  onboarding_next: string;
  onboard_level_title: string;
  onboard_level_subtitle: string;
  onboard_level_note: string;
  onboard_done_title: string;
  onboard_done_lede: string;
};

export const dictionaries: Record<'ar' | 'en', Dictionary> = {
  ar: {
    dir: 'rtl',
    nav_login: 'تسجيل الدخول',
    nav_home: 'الرئيسية',
    nav_how: 'كيف تعمل؟',
    nav_features: 'المميزات',
    nav_help: 'مساعدة',
    nav_start: 'ابدأ مجانًا',
    nav_menu: 'القائمة',
    skip_to_content: 'تخطّي للمحتوى',
    nav_primary_label: 'التنقل الأساسي',
    sub_back_home: 'الرجوع للرئيسية',
    diff_row_label: 'وجه المقارنة',
    diff_yes: 'موجود',
    diff_no: 'مش موجود',
    hero_eyebrow: 'المذاكرة بقت أسهل',
    hero_title: 'المذاكرة صعبة وتقيلة؟ سهّلناها عليك',
    hero_subtitle: 'كل أدوات المذاكرة اللي تحتاجها في مكان واحد. ابدأ خطتك وخلّي ما تبقى علينا.',
    hero_cta: 'ابدأ خطتك مجانًا',
    hero_cta_secondary: 'شوف إزاي بيشتغل',
    annotation: 'مفهوم صعب؟ اسأل هنا',

    diff_eyebrow: 'ليه مش ChatGPT؟',
    diff_title: 'الفرق إنه بيعرف مادتك أنت بالظبط',
    diff_chatgpt_label: 'شات عام',
    diff_us_label: 'ماجيكلي',
    diff_row1: 'مبني على ملفاتك أنت، مش إجابات عامة',
    diff_row2: 'بيعمل اختبارات وبطاقات مراجعة من محاضرتك مباشرة',
    diff_row3: 'بيتابع تقدمك في كل مادة ودرس',
    diff_row4: 'كل حاجة منظمة بالدروس، مش محادثة تضيع',

    steps_eyebrow: 'البداية بسيطة',
    step1_title: 'ارفع مذكرتك',
    step1_desc: 'ارفع ملف الـPDF أو الصور.',
    step2_title: 'حدّد هدفك',
    step2_desc: 'حدّد المادة وهدفك ووقت المذاكرة.',
    step3_title: 'ابدأ المذاكرة',
    step3_desc: 'نجهّزلك الخطة والأدوات وتبدأ على طول.',

    features_eyebrow: 'ليه ماجيكلي',
    features_title: 'كل أدوات مذاكرتك في مكان واحد',
    features_lede:
      'اسأل بالعربي أو بالإنجليزي — المصطلحات التقنية بتفضل زي ما هي في المراجع، والشرح بيوصلك باللغة اللي مريحاك.',
    features_see_all: 'شوف كل الميزات',
    feature1_title: 'يفهم ملفاتك',
    feature1_desc: 'ارفع PDF أو Word مرة واحدة، ويفضل مرجع دايم تسأل فيه من غير ما ترفعه تاني.',
    feature2_title: 'خطة على قد وقتك',
    feature2_desc: 'قول التراك وعندك كام يوم، وتطلع خطة بمواضيع مرتّبة يوم ورا يوم.',
    feature3_title: 'الدرس بأربع طرق',
    feature3_desc: 'مبسّط، أكاديمي، بتشبيهات، أو مثال عملي — نفس الموضوع بالشرح اللي يدخل دماغك.',
    feature4_title: 'كويز في آخر كل درس',
    feature4_desc: 'أسئلة على اللي لسه قريته، واليوم ما بيتقفلش غير لما تعدّي.',
    feature5_title: 'الامتحان بعد كام يوم؟',
    feature5_desc: 'قوله في الشات، يرجّعلك خطة طوارئ آخر يوم فيها مراجعة وكويز.',
    feature6_title: 'صوّر المحاضرة وخلاص',
    feature6_desc: 'صورة السبورة أو الورقة بتتحوّل نص مقروء — بالعربي والإنجليزي.',
    feature7_title: 'يقرا بصوت، ويسمع منك',
    feature7_desc: 'شغّل الشرح وإنت ماشي، أو اسأل بصوتك بدل ما تكتب.',
    feature8_title: 'عرض شرائح في دقيقة',
    feature8_desc: 'من موضوع لعرض تستعرضه بالكيبورد وتصدّره PDF.',
    feature9_title: 'أهدافك مرتّبة بالوقت',
    feature9_desc: 'تسليم مشروع أو مراجعة قبل امتحان — المتأخر فوق، مش آخر حاجة كتبتها.',
    feature10_title: 'إنت فين من الدور',
    feature10_desc: 'مهارات التراك مقسّمة مراحل، وشايف اللي عدّيته واللي جاي.',
    feature11_title: 'مش بتذاكر لوحدك',
    feature11_desc: 'غرفة مذاكرة، أسئلة زمايلك، وترتيب بيخليك مكمّل.',
    feature12_title: 'تشوف مجهودك',
    feature12_desc: 'خريطة نشاط بسبعين يوم وتحليلات أسبوعية — الأرقام بتقول إنت ثابت ولا لأ.',

    footer_cta_title: 'جاهز تبدأ؟',
    footer_cta_button: 'ابدأ خطتك مجانًا',

    hero_mockup_alt:
      'لقطة من لوحة التحكم: ملف محاضرة مرفوع واتقرأ، كارت التركيز الحالي وعليه شريط تقدّم، وملخص وبطاقات مراجعة وأسئلة اتولدوا من نفس الملف.',

    trust1: 'يدعم PDF والصور',
    trust2: 'بالعربي والإنجليزي',
    trust3: 'من غير بطاقة ائتمان',
    trust4: 'إجابات من ملفك أنت',

    mock_nav_home: 'الرئيسية',
    mock_nav_courses: 'الكورسات',
    mock_nav_workspace: 'مساحة العمل',
    mock_nav_ai: 'المساعد الذكي',
    mock_nav_notes: 'الملاحظات',
    mock_nav_planner: 'المخطط',
    mock_upload_ok: 'اتقرأ بالكامل',
    mock_focus_label: 'التركيز الحالي',
    mock_topic: 'الـ Deadlock وشروط حدوثه',
    mock_progress: 'مكتمل',
    mock_summary_title: 'ملخص المحاضرة',
    mock_summary1: 'أهم الأفكار الأساسية',
    mock_summary2: 'شرح مبسّط للمفاهيم',
    mock_summary3: 'نقاط للمراجعة السريعة',
    mock_flash_title: 'بطاقات المراجعة',
    mock_flash_count: '١٢ بطاقة',
    mock_quiz_title: 'أسئلة واختبارات',
    mock_quiz_sub: '٥ أسئلة جاهزة',

    demo_file: 'محاضرة_نظم_التشغيل.pdf',
    demo_q1: 'ايه الفرق بين الـ Process والـ Thread؟',
    demo_a1: 'من المحاضرة: الـ Process وحدة مستقلة ليها مساحة ذاكرة خاصة بيها، أما الـ Thread فهو مسار تنفيذ جوه نفس الـ Process وبيشارك الذاكرة مع باقي الـ Threads.',
    demo_q2: 'اعملي 3 أسئلة اختيار من متعدد على الدرس ده',
    demo_a2: 'تمام، جهزتلك 3 أسئلة بناءً على المحاضرة. جاهز تبدأ؟',

    showcase_eyebrow: 'شوف بنفسك',
    showcase_title: 'المنتج شغال فعلاً، مش مجرد فكرة',
    showcase1_title: 'لوحة التحكم',
    showcase1_desc: 'كل مادة، مستواك، ونقاط الـ XP في مكان واحد.',
    showcase2_title: 'عرض الدرس التفاعلي',
    showcase2_desc: 'اختار النمط اللي يناسبك (عملي، مرئي، أكاديمي) واعرض المحتوى داخل التطبيق مباشرة.',
    showcase3_title: 'اسأل ماجيكلي',
    showcase3_desc: 'اسأل عن أي نقطة في الدرس واحصل على إجابة واضحة فورًا.',
    showcase4_title: 'لوحة الصدارة',
    showcase4_desc: 'تنافس مع زمايلك وشوف ترتيبك أسبوعيًا.',
    showcase5_title: 'غرف الدراسة والمجتمع',
    showcase5_desc: 'تحديات أسبوعية وسلاسل مذاكرة تخليك مستمر.',

    outcomes_eyebrow: 'أول نتيجة هتطلع بإيدك',
    outcomes_title: 'حوّل الملف لمذاكرة تقدر تمشي عليها',
    outcomes_lede: 'مش محتاج تتفرّج على شاشات كتير. ارفع جزء من مادتك واطلع بخطوة واضحة تكمل منها.',
    outcomes_cta: 'جرّب على ملفك',
    outcome1_title: 'خلاصة تفتح لك الموضوع',
    outcome1_desc: 'النقاط المهمة مترتبة بلغة بسيطة بدل ما تبدأ من صفحة فاضية.',
    outcome2_title: 'أسئلة تعرفك فهمت ولا لأ',
    outcome2_desc: 'اختبر نفسك على نفس المحتوى واعرف إيه اللي محتاج مراجعة.',
    outcome3_title: 'خطة تخلي البداية أسهل',
    outcome3_desc: 'قسّم مذاكرتك لخطوات يومية صغيرة تقدر تلتزم بها.',

    hero_title_a: 'المذاكرة صعبة وتقيلة؟',
    hero_title_mark: 'سهّلناها عليك',
    hero_title_b: '',
    brand: 'ماجيكلي',
    brand_tagline: 'للمذاكرة بسحر',

    steps_title: 'ابدأ خطتك في ٣ خطوات',

    login_back: 'الرجوع للرئيسية',
    login_title_a: 'كمّل مذاكرتك من',
    login_title_mark: 'أي جهاز',
    login_subtitle: 'خطتك وتقدمك محفوظين في حسابك.',
    login_name_label: 'الاسم',
    login_name_placeholder: 'اسمك بالكامل',
    login_email_label: 'الإيميل',
    login_email_placeholder: 'you@example.com',
    login_password_label: 'كلمة السر',
    login_password_placeholder: '••••••••',
    login_password_hint: '6 حروف على الأقل',
    login_submit_signin: 'دخول',
    login_submit_signup: 'إنشاء حساب',
    login_loading: 'لحظة..',
    login_no_account: 'مالكش حساب؟',
    login_no_account_cta: 'اعمل واحد جديد',
    login_has_account: 'عندك حساب بالفعل؟',
    login_has_account_cta: 'سجّل دخول',
    login_or: 'أو',
    login_guest: 'جرّب كزائر',
    login_guest_loading: 'جاري الدخول..',
    login_guest_hint: 'تقدر تربط زيارتك بحساب بعد كده وتحتفظ بتقدمك.',
    login_err_credentials: 'الإيميل أو كلمة السر غلط. راجعهم وحاول تاني.',
    login_err_exists: 'الإيميل ده مسجّل قبل كده. سجّل دخول بدل إنشاء حساب.',
    login_err_signup: 'مقدرناش نكمّل إنشاء الحساب. حاول تاني بعد لحظة.',
    login_err_guest: 'مقدرناش ندخّلك كزائر. حاول تاني بعد لحظة.',
    login_ok_linked: 'ربطنا حسابك. راجع إيميلك وأكّد التسجيل.',
    login_ok_created: 'الحساب اتعمل. راجع إيميلك وأكّد التسجيل قبل الدخول.',
    login_forgot_cta: 'نسيت كلمة السر؟',
    login_forgot_title: 'استرجاع كلمة السر',
    login_forgot_submit: 'إرسال رابط الاسترجاع',
    login_reset_title: 'تعيين كلمة سر جديدة',
    login_reset_submit: 'حفظ كلمة السر الجديدة',
    login_back_signin: 'الرجوع لتسجيل الدخول',
    login_ok_reset_sent: 'لو الإيميل مسجّل، هتوصلك رسالة فيها رابط لتعيين كلمة سر جديدة.',
    login_ok_reset: 'تم تغيير كلمة السر. تقدر تسجّل دخولك دلوقتي.',
    login_err_reset: 'مقدرناش نكمّل إعادة تعيين كلمة السر. اطلب رابط جديد وحاول تاني.',

    picker_eyebrow: 'قبل ما تبدأ',
    picker_title: 'إنت مين، وبتتعلم إيه؟',
    picker_step1: 'إنت مين؟',
    personaStudent: 'طالب',
    personaStudentDesc: 'بتذاكر منهج وعايز تفهمه وتنجح فيه.',
    personaGrad: 'خريج',
    personaGradDesc: 'بتجهّز نفسك للشغل وبتستعد للمقابلات.',
    personaFreelancer: 'شغال حر',
    personaFreelancerDesc: 'عندك شغلانة لعميل ومحتاج تخلّصها صح وفي وقتها.',
    picker_step2: 'مستواك الدراسي؟',
    levelPrep: 'إعدادي',
    levelHigh: 'ثانوي',
    levelUni: 'جامعة',
    levelMasters: 'دراسات عليا',
    picker_step_field: 'مجالك إيه؟',
    picker_field_hint: 'ده بيغيّر الاقتراحات اللي جاية، ونبرة الشرح كمان.',
    fieldProgramming: 'برمجة وتكنولوجيا',
    fieldMedical: 'طب وصيدلة',
    fieldLanguages: 'لغات',
    fieldBusiness: 'إدارة وتسويق',
    fieldSchool: 'مناهج دراسية',
    fieldDesign: 'تصميم وإبداع',
    picker_step3: 'عايز تتعلم إيه؟',
    picker_student_type: 'طالب مدرسة',
    picker_university_type: 'طالب جامعي',
    picker_university: 'جامعة',
    picker_faculty: 'كلية',
    picker_department: 'قسم',
    picker_level: 'المستوى الدراسي',
    picker_semester: 'الترم',
    picker_track_hint: 'اختار اقتراح جاهز، أو اكتب اللي في دماغك.',
    picker_track_placeholder: 'اكتب أي موضوع، حتى لو مش في الاقتراحات...',
    picker_cta: 'ابني خطتي',
    picker_cta_hint: 'كمّل الاختيارات الأول عشان نبنيلك خطة على مقاسك.',

    faq_eyebrow: 'أسئلة شائعة',
    faq_title: 'اللي بيتسأل قبل ما حد يبدأ',
    faq_lede:
      'جمّعنا الأسئلة اللي بتتكرر أكتر من غيرها. لو سؤالك مش هنا، ابعتلنا وهنرد.',
    faq_see_all: 'كل الأسئلة الشائعة',
    faq_more_text: 'لسه عندك سؤال؟',
    faq_more_cta: 'ابعتلنا',

    faq1_q: 'إيه الفرق بينه وبين ChatGPT بالظبط؟',
    faq1_a:
      'ChatGPT بيرد على سؤالك ويقفل الصفحة وينسى. هنا الملف اللي رفعته بيفضل موجود، والشرح بيتبني عليه هو بالذات مش على معلومات عامة، وفيه خطة يوم بيوم بتتابع إنت وصلت لفين. يعني الفرق مش في جودة الإجابة الواحدة — الفرق إن فيه حاجة بتفضل شغالة معاك بعد ما تقفل التاب.',
    faq2_q: 'محتاج أعرف حاجة في المجال قبل ما أبدأ؟',
    faq2_a:
      'لأ. الخطة بتتبني على مستواك اللي بتقوله في أول خطوة، فلو بتبدأ من الصفر بتبدأ من الصفر فعلاً. ولو عندك أساس، بيعدّي اللي إنت عارفه بسرعة ويركّز على اللي ناقص.',
    faq3_q: 'بيدعم إيه من الملفات؟',
    faq3_a:
      'PDF والصور (JPG و PNG). الصور بتتقرا بالعربي والإنجليزي، بس فيها سقف حجم أصغر من الـ PDF فلو الصورة كبيرة بتتضغط أوتوماتيك قبل ما تترفع.',
    faq4_q: 'بيشتغل بالعربي ولا الإنجليزي بس؟',
    faq4_a:
      'الاتنين. الواجهة كلها بالعربي والإنجليزي، والشرح بيرد بلغة سؤالك. وبما إن مصطلحات البرمجة إنجليزي أصلاً، بيسيبها زي ما هي جوه الجملة العربي بدل ما يترجمها ترجمة حرفية تلخبط أكتر ما تفهّم.',
    faq5_q: 'كام يوم الخطة؟ وممكن أغيّرها؟',
    faq5_a:
      'الخطة بتتقسّم أيام حسب المادة والوقت المتاح عندك، وأيوة تقدر تعدّلها. لو يوم فات عليك مش بتتكسر — بتتزحلق قدّام والباقي بيتظبط معاه.',
    faq6_q: 'ملفاتي بتروح فين؟ حد بيشوفها؟',
    faq6_a:
      'الملف بيتخزن في حسابك إنت، وبيتبعت لموديل الذكاء الاصطناعي عشان يتقري ويتشرح. مافيش حد من الفريق بيتفرّج على ملفاتك، ومش بنبيع بياناتك ولا بنستخدمها في إعلانات. التفاصيل الكاملة في سياسة الخصوصية.',
    faq7_q: 'الشرح ممكن يغلط؟',
    faq7_a:
      'أيوة، ممكن. ده ذكاء اصطناعي وبيغلط زي أي أداة. عشان كده الإجابات بتتبني على ملفك أنت — ده بيقلل الغلط بس ما بيلغيهوش. قاعدة عامة: أي حاجة هتعتمد عليها في امتحان أو شغل، راجعها في مصدرك الأصلي.',
    faq8_q: 'ينفع أذاكر منه لامتحان قريّب؟',
    faq8_a:
      'أيوة، ولما تقول في الشات إن عندك امتحان بيطلعلك خطة مضغوطة للأيام الفاضلة بدل الخطة العادية. بس كن واقعي — الأداة بتنظّم وقتك، مش بتعوّض شهر ضايع.',
    faq9_q: 'لازم أدفع؟ أو أحط بطاقة؟',
    faq9_a:
      'تقدر تبدأ من غير بطاقة ائتمان خالص. ارفع ملف وشوف الشرح والخطة الأول، ولو الحكاية مش عاجباك مافيش حاجة اتخصمت منك.',
    faq10_q: 'بيشتغل على الموبايل؟',
    faq10_a:
      'أيوة، الموقع كله شغال على الموبايل، وتقدر تثبّته على الشاشة الرئيسية زي أي تطبيق ويفتح من غير متصفح.',

    footer_tagline:
      'منصة مذاكرة لأي مجال: ارفع مادتك، افهمها بشرح مبني عليها هي، وامشي على خطة بتتابعك يوم بيوم.',
    footer_col_product: 'المنتج',
    footer_col_learn: 'اتعلم',
    footer_col_account: 'حسابك',
    footer_link_features: 'الميزات',
    footer_link_how: 'إزاي بيشتغل',
    footer_link_faq: 'أسئلة شائعة',
    footer_link_start: 'ابدأ خطتك',
    footer_link_dashboard: 'مساحة العمل',
    footer_link_community: 'المجتمع',
    footer_link_courses: 'الكورسات',
    footer_link_login: 'تسجيل الدخول',
    footer_contact_title: 'تواصل معانا',
    footer_email_label: 'راسلنا',
    footer_whatsapp_label: 'راسلنا على واتساب',
    footer_rights: 'كل الحقوق محفوظة.',
    footer_privacy: 'سياسة الخصوصية',
    footer_terms: 'شروط الاستخدام',
    footer_made_with: 'مطور من قبل E/Mohamed ELsayed',
    footer_developed_by: 'مطور من قبل م/محمدالسيد',
    footer_nav_label: 'روابط الموقع',
    footer_social_label: 'تابعنا',

    /* 🎬 مراحل الهيرو */
    stage1_label: 'ارفع ملزمتك',
    stage2_label: 'بيولّد الترم',
    stage3_label: 'ابدأ المذاكرة',
    stage_uploading: 'بيترفع…',
    stage_reading: 'بيقرا ٤٢ صفحة…',
    stage_ready: 'جاهز',
    stage_sequence_label:
      'ماكيت متحرّك بيوري تلات خطوات: رفع الملزمة، توليد الخطة، وبداية المذاكرة.',
    hero_cta_demo: 'جرّب من غير حساب',

    /* 🎁 صفحة الديمو */
    demo_meta_title: 'جرّب من غير حساب',
    demo_meta_desc:
      'ارفع ملزمتك وشوف الذكاء الاصطناعي بيلخّصها ويعملك كروت وامتحان وخطة — من غير تسجيل.',
    demo_back: 'رجوع للرئيسية',
    demo_eyebrow: 'تجربة مفتوحة · من غير حساب',
    demo_title_a: 'ارفع ملزمتك،',
    demo_title_mark: 'وشوف بنفسك',
    demo_lede:
      'ملف واحد بس، والذكاء الاصطناعي هيقراه ويطلعلك ملخص وكروت مراجعة وسؤال امتحان وخطة تلات أيام. من غير تسجيل ومن غير بطاقة.',
    demo_drop_title: 'ارمي ملفك هنا',
    demo_drop_hint: 'أو',
    demo_drop_browse: 'اختار من جهازك',
    demo_drop_formats: 'PDF · Word · صورة · نص — لحد ٤ ميجا',
    demo_sample_text: 'مامعاكش ملف دلوقتي؟',
    demo_sample_cta: 'جرّب على ملزمة جاهزة',
    demo_file_chosen: 'الملف المختار',
    demo_start: 'حلّل الملف',
    demo_step_read: 'بقرا الملف',
    demo_step_think: 'بفهم المحتوى',
    demo_step_build: 'ببني المادة',
    demo_working: 'ثواني وتشوف النتيجة…',
    demo_progress_label: 'بشتغل على ملفك',
    demo_result_eyebrow: 'النتيجة من ملفك إنت',
    demo_result_summary: 'الملخص',
    demo_result_cards: 'كروت المراجعة',
    demo_result_cards_hint: 'دوس على الكارت عشان تشوف الإجابة',
    demo_result_quiz: 'سؤال امتحان',
    demo_result_plan: 'خطة أول تلات أيام',
    demo_card_flip: 'اقلب الكارت',
    demo_quiz_correct: 'إجابة صحيحة',
    demo_quiz_wrong: 'مش دي الإجابة',
    demo_quiz_retry: 'جرّب تاني',
    demo_plan_day: 'اليوم',
    demo_cta_title: 'ده كان ملف واحد. تخيّل الترم كله.',
    demo_cta_lede:
      'الحساب المجاني بيخليك ترفع اللي إنت عايزه، وتسأل في الشات، وتمشي على خطة بتتابعك يوم بيوم.',
    demo_cta_button: 'ابدأ مجانًا',
    demo_again: 'جرّب ملف تاني',
    demo_err_generic: 'حصل خطأ. جرّب تاني.',
    demo_err_size: 'الملف كبير. الحد ٤ ميجا (والصور ١ ميجا).',
    demo_err_type: 'نوع الملف ده مش مدعوم. جرّب PDF أو Word أو صورة أو نص.',
    demo_err_network: 'الاتصال اتقطع. اتأكد من النت وجرّب تاني.',
    /* ---- المرحلة ١: Auth & Onboarding Foundation ---- */
    welcome_title_a: 'خطة تتعلم على',
    welcome_title_mark: 'مقاسك',
    welcome_lede: 'ماجيكلي بيفهم دورك ومستواك وهدفك، ويبنيلك خطة يومية بتتابعها خطوة بخطوة.',
    welcome_cta_start: 'ابدأ رحلتك',
    welcome_cta_login: 'عندي حساب بالفعل',
    welcome_cta_guest: 'أكمل كزائر من غير حساب',
    welcome_terms: 'بالإنشاء أنت توافق على الشروط وسياسة الخصوصية.',
    register_title: 'اعمل حسابك',
    register_name_label: 'الاسم',
    register_name_placeholder: 'اسمك كما تحب أن نناديك',
    register_email_label: 'البريد الإلكتروني',
    register_password_label: 'كلمة السر',
    register_submit: 'إنشاء الحساب',
    register_pw_weak: 'ضعيفة — زوّد الحروف والأرقام',
    register_pw_medium: 'متوسطة — كويسة، وتقدر تقوّيها أكتر',
    register_pw_strong: 'قوية ✓',
    register_pw_hint: '٦ حروف على الأقل.',
    auth_google_cta: 'المتابعة بحساب Google',
    auth_phone_cta: 'المتابعة برقم الموبايل',
    auth_phone_soon: 'قريبًا',
    auth_or_continue: 'أو كمّل بواسطة',
    login_forgot_link: 'نسيت كلمة السر؟',
    onboarding_step: 'الخطوة',
    onboarding_title: 'خلينا نعرفك أكتر عشان نجهز ماجيكلي ليك 💙',
    onboarding_subtitle: 'اختار اللي يشبهك — وتقدر تغيّره بعدين من إعدادات حسابك.',
    onboarding_role_student: 'طالب',
    onboarding_role_student_desc: 'بتذاكر منهج أو بتحضّر لامتحان',
    onboarding_role_graduate: 'خريج',
    onboarding_role_graduate_desc: 'بتجهّز نفسك لسوق الشغل والمقابلات',
    onboarding_role_freelancer: 'فريلانسر',
    onboarding_role_freelancer_desc: 'بتشتغل على مشاريع ومع عملاء',
    onboarding_changeable_later: 'تقدر تغيّر اختيارك في أي وقت.',
    onboarding_skip: 'تخطّي دلوقتي',
    onboarding_next: 'كمّل',
    onboard_level_title: 'بتدرس في أنهي مرحلة؟',
    onboard_level_subtitle: 'ده بيظبط شرح الأمثلة ومستوى اللغة في خطتك.',
    onboard_level_note: 'السؤال ده بيظهر لاختيار «طالب» فقط — باقي الأدوار بيتسجلوا على طول.',
    onboard_done_title: 'جاهز! جهزنا ماجيكلي على مقاسك',
    onboard_done_lede: 'بنودّيك على داشبورد دورك. لحد ما النسخ المتخصصة تجهز، الكل بينزل على الداشبورد الحالي بدون أي كسر.',
  },
  en: {
    dir: 'ltr',
    nav_login: 'Sign in',
    nav_home: 'Home',
    nav_how: 'How it works',
    nav_features: 'Features',
    nav_help: 'Help',
    nav_start: 'Get started free',
    nav_menu: 'Menu',
    skip_to_content: 'Skip to content',
    nav_primary_label: 'Primary navigation',
    sub_back_home: 'Back to home',
    diff_row_label: 'Comparison point',
    diff_yes: 'Included',
    diff_no: 'Not included',
    hero_eyebrow: 'Studying just got easier',
    hero_title: 'Studying feels hard and heavy? We made it easier',
    hero_subtitle: 'Every study tool you need in one place. Start your plan and leave the rest to us.',
    hero_cta: 'Start your plan, free',
    hero_cta_secondary: 'See how it works',
    annotation: 'Stuck on something? Ask right here',

    diff_eyebrow: 'Why not just ChatGPT?',
    diff_title: 'It actually knows your exact course material',
    diff_chatgpt_label: 'Generic chatbot',
    diff_us_label: 'Magicly',
    diff_row1: 'Grounded in your own files, not generic answers',
    diff_row2: 'Generates quizzes & flashcards straight from your lecture',
    diff_row3: 'Tracks your progress per subject and lesson',
    diff_row4: 'Everything organized by lesson, not a lost conversation',

    steps_eyebrow: 'Getting started',
    step1_title: 'Upload your notes',
    step1_desc: 'Add your PDF file or photos.',
    step2_title: 'Set your goal',
    step2_desc: 'Pick the subject, your goal, and your study time.',
    step3_title: 'Start studying',
    step3_desc: 'We prepare your plan and tools so you start right away.',

    features_eyebrow: 'Why Magicly',
    features_title: 'All your study tools in one place',
    features_lede:
      'Ask in Arabic or English — technical terms stay exactly as the references write them, and the explanation reaches you in whichever language you think in.',
    features_see_all: 'See all features',
    feature1_title: 'Reads what you give it',
    feature1_desc: 'Upload a PDF or Word file once; it stays a reference you can question without re-uploading.',
    feature2_title: 'A plan that fits your time',
    feature2_desc: 'Name the track and how many days you have. You get topics ordered day by day.',
    feature3_title: 'Four ways to learn it',
    feature3_desc: 'Plain, academic, visual, or a worked example — same topic, the explanation that lands.',
    feature4_title: 'A quiz ends every lesson',
    feature4_desc: "Questions on what you just read, and the day won't close until you pass.",
    feature5_title: 'Exam in a few days?',
    feature5_desc: 'Say so in the chat and get a triage plan — last day is review plus a quiz.',
    feature6_title: 'Photograph the lecture',
    feature6_desc: 'A shot of the whiteboard or a page turns into readable text, Arabic or English.',
    feature7_title: 'Reads aloud, listens back',
    feature7_desc: 'Play the explanation while you walk, or ask out loud instead of typing.',
    feature8_title: 'Slides in a minute',
    feature8_desc: 'From a topic to a deck you can run with the keyboard and export as PDF.',
    feature9_title: 'Goals ordered by time',
    feature9_desc: 'Ship a project, revise before an exam — overdue sits on top, not whatever you typed last.',
    feature10_title: 'Where you are in the role',
    feature10_desc: "Track skills split into stages, so you see what's behind you and what's next.",
    feature11_title: "You're not studying alone",
    feature11_desc: 'A study room, questions from classmates, and a ranking that keeps you going.',
    feature12_title: 'See the effort',
    feature12_desc: 'A 70-day activity map and weekly analytics — the numbers say whether you held the line.',

    footer_cta_title: 'Ready to start?',
    footer_cta_button: 'Start your plan, free',

    hero_mockup_alt:
      'A snapshot of the dashboard: an uploaded lecture file that has been read, a current-focus card with a progress bar, and a summary, flashcards and questions generated from that same file.',

    trust1: 'PDF and images',
    trust2: 'Arabic and English',
    trust3: 'No credit card',
    trust4: 'Answers from your own file',

    mock_nav_home: 'Home',
    mock_nav_courses: 'Courses',
    mock_nav_workspace: 'Workspace',
    mock_nav_ai: 'AI Assistant',
    mock_nav_notes: 'Notes',
    mock_nav_planner: 'Planner',
    mock_upload_ok: 'Fully read',
    mock_focus_label: 'Current focus',
    mock_topic: 'Deadlock and its conditions',
    mock_progress: 'done',
    mock_summary_title: 'Lecture summary',
    mock_summary1: 'The core ideas',
    mock_summary2: 'Concepts in plain words',
    mock_summary3: 'Quick revision points',
    mock_flash_title: 'Flashcards',
    mock_flash_count: '12 cards',
    mock_quiz_title: 'Questions and quizzes',
    mock_quiz_sub: '5 questions ready',

    demo_file: 'Operating_Systems_Lecture.pdf',
    demo_q1: "What's the difference between a Process and a Thread?",
    demo_a1: 'From your lecture: a Process is an independent unit with its own memory space, while a Thread is an execution path within a Process that shares memory with other threads.',
    demo_q2: 'Make me 3 multiple-choice questions on this lesson',
    demo_a2: "Sure, I've prepared 3 questions based on the lecture. Ready to start?",
  
    showcase_eyebrow: 'See for yourself',
    showcase_title: 'A real, working product — not just an idea',
    showcase1_title: 'Dashboard',
    showcase1_desc: 'Every subject, your level, and XP points in one place.',
    showcase2_title: 'Interactive lesson view',
    showcase2_desc: 'Pick the mode that suits you (practical, visual, academic) and view content right inside the app.',
    showcase3_title: 'Ask the AI tutor',
    showcase3_desc: 'Ask about any point in the lesson and get a clear answer instantly.',
    showcase4_title: 'Leaderboard',
    showcase4_desc: 'Compete with classmates and see your weekly ranking.',
    showcase5_title: 'Study rooms & community',
    showcase5_desc: 'Weekly challenges and study streaks that keep you consistent.',

    outcomes_eyebrow: 'What you get from your first file',
    outcomes_title: 'Turn a file into study time you can act on',
    outcomes_lede: "You don't need to browse a lot of screens. Upload a piece of your material and leave with a clear next step.",
    outcomes_cta: 'Try it with your file',
    outcome1_title: 'A summary that opens up the topic',
    outcome1_desc: 'The key ideas are organized in plain language instead of starting from a blank page.',
    outcome2_title: 'Questions that show what you understood',
    outcome2_desc: 'Test yourself on the same material and see what needs another look.',
    outcome3_title: 'A plan that makes starting easier',
    outcome3_desc: 'Break studying into smaller daily steps you can actually keep up with.',

    hero_title_a: 'Studying feels hard and heavy?',
    hero_title_mark: 'we made it easier',
    hero_title_b: '',
    brand: 'Magicly',
    brand_tagline: 'study with magic',

    steps_title: 'Start your plan in 3 steps',

    login_back: 'Back to home',
    login_title_a: 'Pick up your plan on',
    login_title_mark: 'any device',
    login_subtitle: 'Your plan and progress stay saved to your account.',
    login_name_label: 'Name',
    login_name_placeholder: 'Your full name',
    login_email_label: 'Email',
    login_email_placeholder: 'you@example.com',
    login_password_label: 'Password',
    login_password_placeholder: '••••••••',
    login_password_hint: 'At least 6 characters',
    login_submit_signin: 'Sign in',
    login_submit_signup: 'Create account',
    login_loading: 'One moment…',
    login_no_account: 'No account yet?',
    login_no_account_cta: 'Create one',
    login_has_account: 'Already have an account?',
    login_has_account_cta: 'Sign in',
    login_or: 'or',
    login_guest: 'Try as a guest',
    login_guest_loading: 'Signing you in…',
    login_guest_hint: 'You can link your guest session to an account later and keep your progress.',
    login_err_credentials: 'That email or password is wrong. Check them and try again.',
    login_err_exists: 'That email is already registered. Sign in instead.',
    login_err_signup: "We couldn't finish creating your account. Try again in a moment.",
    login_err_guest: "We couldn't sign you in as a guest. Try again in a moment.",
    login_ok_linked: 'Your account is linked. Check your email to confirm it.',
    login_ok_created: 'Account created. Check your email to confirm it before signing in.',
    login_forgot_cta: 'Forgot your password?',
    login_forgot_title: 'Reset your password',
    login_forgot_submit: 'Send reset link',
    login_reset_title: 'Choose a new password',
    login_reset_submit: 'Save new password',
    login_back_signin: 'Back to sign in',
    login_ok_reset_sent: 'If that email is registered, we sent a link to reset your password.',
    login_ok_reset: 'Your password has been changed. You can sign in now.',
    login_err_reset: "We couldn't reset your password. Request a new link and try again.",

    picker_eyebrow: 'Before you start',
    picker_title: 'Who are you, and what are you learning?',
    picker_step1: 'Who are you?',
    personaStudent: 'Student',
    personaStudentDesc: "You're studying a course and want to understand it and pass.",
    personaGrad: 'Graduate',
    personaGradDesc: "You're getting job-ready and preparing for interviews.",
    personaFreelancer: 'Freelancer',
    personaFreelancerDesc: 'You have client work and need to deliver it right, on time.',
    picker_step2: "What's your academic level?",
    levelPrep: 'Middle school',
    levelHigh: 'High school',
    levelUni: 'University',
    levelMasters: 'Postgraduate',
    picker_step_field: "What's your field?",
    picker_field_hint: 'This changes the suggestions below — and the tone of the explanations.',
    fieldProgramming: 'Programming & tech',
    fieldMedical: 'Medicine & pharmacy',
    fieldLanguages: 'Languages',
    fieldBusiness: 'Business & marketing',
    fieldSchool: 'School subjects',
    fieldDesign: 'Design & creative',
    picker_step3: 'What do you want to learn?',
    picker_track_hint: 'Pick a suggestion, or type whatever you have in mind.',
    picker_track_placeholder: 'Type any topic, even if it is not listed…',
    picker_cta: 'Build my plan',
    picker_cta_hint: 'Finish the choices above so we can tailor your plan.',
    picker_student_type: 'School Student',
    picker_university_type: 'University Student',
    picker_university: 'University',
    picker_faculty: 'Faculty',
    picker_department: 'Department',
    picker_level: 'Academic Level',
    picker_semester: 'Semester',

    faq_eyebrow: 'FAQ',
    faq_title: 'What people ask before they start',
    faq_lede:
      'The questions that come up most often. If yours is not here, send it over and we will answer.',
    faq_see_all: 'All FAQs',
    faq_more_text: 'Still have a question?',
    faq_more_cta: 'Get in touch',

    faq1_q: 'How is this different from ChatGPT?',
    faq1_a:
      'ChatGPT answers your question, then forgets the moment you close the tab. Here the file you uploaded stays, explanations are built on that file rather than on general knowledge, and a day-by-day plan tracks where you actually got to. The difference is not the quality of a single answer — it is that something keeps working with you after you close the tab.',
    faq2_q: 'Do I need background in the field first?',
    faq2_a:
      'No. The plan is built around the level you pick in the first step, so starting from zero really does start from zero. If you already have a foundation, it moves through what you know and focuses on the gaps.',
    faq3_q: 'Which file types are supported?',
    faq3_a:
      'PDFs and images (JPG and PNG). Images are read in both Arabic and English, but they have a smaller size limit than PDFs — large images are compressed automatically before upload.',
    faq4_q: 'Does it work in Arabic, or English only?',
    faq4_a:
      'Both. The whole interface is available in Arabic and English, and explanations come back in the language you asked in. Since programming terms are English anyway, they stay as-is inside Arabic sentences instead of being literally translated into something more confusing.',
    faq5_q: 'How long is the plan? Can I change it?',
    faq5_a:
      'The plan is split into days based on your material and the time you have, and yes, you can adjust it. Missing a day does not break it — the day shifts forward and the rest adjusts around it.',
    faq6_q: 'Where do my files go? Can anyone see them?',
    faq6_a:
      'Your file is stored in your account and sent to the AI model so it can be read and explained. No one on the team browses your files, and we do not sell your data or use it for advertising. Full details are in the privacy policy.',
    faq7_q: 'Can the explanations be wrong?',
    faq7_a:
      'Yes, they can. This is AI and it makes mistakes like any tool. That is why answers are grounded in your own file — it reduces errors without eliminating them. A good rule: anything you will rely on in an exam or at work, check against your original source.',
    faq8_q: 'Can I use it to study for an exam that is coming up soon?',
    faq8_a:
      'Yes. Mention in chat that you have an exam and you get a compressed plan for the days left instead of the regular one. Be realistic though — the tool organises your time, it does not replace a month you already lost.',
    faq9_q: 'Do I have to pay, or add a card?',
    faq9_a:
      'You can start with no credit card at all. Upload a file, see the explanation and the plan first — if it is not for you, nothing was charged.',
    faq10_q: 'Does it work on mobile?',
    faq10_a:
      'Yes, the whole site works on mobile, and you can install it to your home screen like any app so it opens without a browser.',

    footer_tagline:
      'A study platform for any field: upload your material, understand it through explanations built on that material, and follow a plan that keeps up with you day by day.',
    footer_col_product: 'Product',
    footer_col_learn: 'Learn',
    footer_col_account: 'Your account',
    footer_link_features: 'Features',
    footer_link_how: 'How it works',
    footer_link_faq: 'FAQ',
    footer_link_start: 'Start your plan',
    footer_link_dashboard: 'Workspace',
    footer_link_community: 'Community',
    footer_link_courses: 'Courses',
    footer_link_login: 'Sign in',
    footer_contact_title: 'Get in touch',
    footer_email_label: 'Email us',
    footer_whatsapp_label: 'Message us on WhatsApp',
    footer_rights: 'All rights reserved.',
    footer_privacy: 'Privacy Policy',
    footer_terms: 'Terms of Use',
    footer_made_with: 'Made in Egypt',
  footer_developed_by: 'مطور من قبل E/Mohamed ELsayed',
    footer_nav_label: 'Site links',
    footer_social_label: 'Follow us',

    /* 🎬 Hero stages */
    stage1_label: 'Upload your syllabus',
    stage2_label: 'AI builds your semester',
    stage3_label: 'Start studying',
    stage_uploading: 'Uploading…',
    stage_reading: 'Reading 42 pages…',
    stage_ready: 'Ready',
    stage_sequence_label:
      'Animated mockup showing three steps: uploading a file, generating the plan, and starting to study.',
    hero_cta_demo: 'Try it, no account',

    /* 🎁 Demo page */
    demo_meta_title: 'Try it without an account',
    demo_meta_desc:
      'Upload your material and watch the AI summarize it and build flashcards, a quiz, and a plan — no sign-up.',
    demo_back: 'Back to home',
    demo_eyebrow: 'Open demo · no account',
    demo_title_a: 'Upload your material,',
    demo_title_mark: 'see it for yourself',
    demo_lede:
      'One file is all it takes. The AI reads it and gives you a summary, revision cards, a quiz question, and a three-day plan. No sign-up, no card.',
    demo_drop_title: 'Drop your file here',
    demo_drop_hint: 'or',
    demo_drop_browse: 'browse your device',
    demo_drop_formats: 'PDF · Word · image · text — up to 4 MB',
    demo_sample_text: "Don't have a file handy?",
    demo_sample_cta: 'Try a ready-made one',
    demo_file_chosen: 'Selected file',
    demo_start: 'Analyze it',
    demo_step_read: 'Reading the file',
    demo_step_think: 'Understanding it',
    demo_step_build: 'Building your material',
    demo_working: 'A few seconds and you will see it…',
    demo_progress_label: 'Working on your file',
    demo_result_eyebrow: 'Built from your own file',
    demo_result_summary: 'Summary',
    demo_result_cards: 'Revision cards',
    demo_result_cards_hint: 'Tap a card to see the answer',
    demo_result_quiz: 'Quiz question',
    demo_result_plan: 'Your first three days',
    demo_card_flip: 'Flip the card',
    demo_quiz_correct: 'Correct',
    demo_quiz_wrong: "That's not it",
    demo_quiz_retry: 'Try again',
    demo_plan_day: 'Day',
    demo_cta_title: 'That was one file. Now picture the whole term.',
    demo_cta_lede:
      'A free account lets you upload whatever you want, ask questions in chat, and follow a plan that keeps up with you day by day.',
    demo_cta_button: 'Get started free',
    demo_again: 'Try another file',
    demo_err_generic: 'Something went wrong. Try again.',
    demo_err_size: 'That file is too big. Limit is 4 MB (1 MB for images).',
    demo_err_type: 'That file type is not supported. Try PDF, Word, an image, or text.',
    demo_err_network: 'Connection dropped. Check your network and try again.',
    /* ---- Phase 1: Auth & Onboarding Foundation ---- */
    welcome_title_a: 'A learning plan built',
    welcome_title_mark: 'around you',
    welcome_lede: 'Magiclly understands your role, level and goal, then builds a daily plan you can follow step by step.',
    welcome_cta_start: "Start your journey",
    welcome_cta_login: 'I already have an account',
    welcome_cta_guest: 'Continue as a guest',
    welcome_terms: 'By creating an account you agree to the Terms and Privacy Policy.',
    register_title: 'Create your account',
    register_name_label: 'Name',
    register_name_placeholder: 'Your name, as you like to be called',
    register_email_label: 'Email',
    register_password_label: 'Password',
    register_submit: 'Create account',
    register_pw_weak: 'Weak — add more letters and numbers',
    register_pw_medium: 'Medium — good, could be stronger',
    register_pw_strong: 'Strong ✓',
    register_pw_hint: 'At least 6 characters.',
    auth_google_cta: 'Continue with Google',
    auth_phone_cta: 'Continue with phone number',
    auth_phone_soon: 'Soon',
    auth_or_continue: 'or continue with',
    login_forgot_link: 'Forgot password?',
    onboarding_step: 'Step',
    onboarding_title: 'Tell us a bit about you so we can tailor Magiclly 💙',
    onboarding_subtitle: 'Pick what fits — you can change it later from your account settings.',
    onboarding_role_student: 'Student',
    onboarding_role_student_desc: 'Studying a curriculum or preparing for exams',
    onboarding_role_graduate: 'Graduate',
    onboarding_role_graduate_desc: 'Getting ready for the job market and interviews',
    onboarding_role_freelancer: 'Freelancer',
    onboarding_role_freelancer_desc: 'Working on projects with clients',
    onboarding_changeable_later: 'You can change this any time.',
    onboarding_skip: 'Skip for now',
    onboarding_next: 'Continue',
    onboard_level_title: 'Which stage are you studying in?',
    onboard_level_subtitle: 'It tunes the explanations and language level of your plan.',
    onboard_level_note: 'This question appears only for “Student” — other roles continue straight away.',
    onboard_done_title: "All set! Magiclly is tailored to you",
    onboard_done_lede: "We're taking you to your role's dashboard. Until the specialized versions ship, everyone lands on the current dashboard — nothing breaks.",
  },
};

export type Locale = keyof typeof dictionaries;
