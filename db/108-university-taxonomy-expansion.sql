-- ============================================================================
-- 108 — توسعة بيانات الجامعات: كليات لأكتر الجامعات + أقسام لكل كلية
-- + مواد سنة أولى قياسية للكليات المشهورة (اقتراح تلقائي للمواد).
-- شغّلها مرة واحدة في Supabase SQL Editor (idempotent — آمنة للاعادة).
-- المواد قوائم قياسية عامة للسنة الأولى — تُعدَّل من هنا (SQL) في أي وقت،
-- وهي مصدر «مواك المقترحة تلقائيًا» في صفحة الإسيسمنت.
-- ============================================================================

-- 1) جامعات إضافية (خاصة وإقليمية)
insert into public.universities (name, code) values
  ('جامعة العريش', 'ARISH'),
  ('جامعة جنوب الوادي', 'SVU'),
  ('جامعة 6 أكتوبر', 'O6U'),
  ('جامعة أكتوبر للعلوم الحديثة', 'OCS'),
  ('الجامعة الألمانية بالقاهرة', 'GUC')
on conflict (code) do update set name = excluded.name, updated_at = now();

-- 2) كليات طبية/صحية أساسية لكل الجامعات الحكومية والأزهر (الخاصة لها قايمتها)
insert into public.university_faculties (university_id, name, code)
select u.id, v.fac_name, v.fac_code
from (values
  ('كلية الطب', 'MED'),
  ('كلية طب الأسنان', 'DENT'),
  ('كلية الصيدلة', 'PHARM'),
  ('كلية التمريض', 'NURS')
) as v(fac_name, fac_code)
cross join public.universities u
where u.code not in ('MUST', 'FUE', 'AUC', 'O6U', 'OCS', 'GUC')
on conflict (university_id, code) do update set name = excluded.name, updated_at = now();

-- 3) قسم «عام» لأي كلية مالهاش أقسام — الويزارد لا ينتهي بِطريق مسدود أبدًا
insert into public.university_departments (faculty_id, name, code)
select f.id, 'عام', 'GEN'
from public.university_faculties f
where not exists (select 1 from public.university_departments d where d.faculty_id = f.id)
on conflict (faculty_id, code) do nothing;

-- 4) مواد السنة الأولى القياسية — عبر join تلقائي لكل الجامعات دفعة واحدة
-- (القيود UNIQUE (university_id, department_id, level, semester, code) بتمنع التكرار)

-- 4a) هندسة الحاسبات (CSED) — L1
insert into public.university_subjects (university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type)
select u.id, f.id, d.id, lvl.id, sem.id, v.name, v.name_en, v.code, 'core'
from (values
  ('مقدمة في البرمجة', 'Introduction to Programming', 'CS101', 'S1'),
  ('رياضيات متصلة', 'Discrete Mathematics', 'MATH101', 'S1'),
  ('فيزياء', 'Physics', 'PHY101', 'S1'),
  ('تقنيات المعلومات', 'IT Fundamentals', 'IT101', 'S1'),
  ('البرمجة الكائنية', 'Object-Oriented Programming', 'CS102', 'S2'),
  ('تفاضل وتكامل', 'Calculus', 'MATH102', 'S2'),
  ('معمارية الحاسب', 'Computer Architecture', 'CS103', 'S2')
) as v(name, name_en, code, sem_code)
cross join public.universities u
join public.university_faculties f on f.university_id = u.id and f.code = 'ENG'
join public.university_departments d on d.faculty_id = f.id and d.code = 'CSED'
join public.university_levels lvl on lvl.code = 'L1'
join public.university_semesters sem on sem.code = v.sem_code
on conflict (university_id, department_id, academic_level_id, semester_id, code) do nothing;

-- 4b) علوم الحاسب (CS) — L1
insert into public.university_subjects (university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type)
select u.id, f.id, d.id, lvl.id, sem.id, v.name, v.name_en, v.code, 'core'
from (values
  ('مقدمة في علوم الحاسب', 'Introduction to Computer Science', 'CS100', 'S1'),
  ('مقدمة في البرمجة', 'Introduction to Programming', 'CS101', 'S1'),
  ('رياضيات', 'Mathematics', 'MATH101', 'S1'),
  ('البرمجة الكائنية', 'Object-Oriented Programming', 'CS102', 'S2'),
  ('تفاضل وتكامل', 'Calculus', 'MATH102', 'S2'),
  ('إحصاء', 'Statistics', 'STAT101', 'S2')
) as v(name, name_en, code, sem_code)
cross join public.universities u
join public.university_faculties f on f.university_id = u.id and f.code in ('CI')
join public.university_departments d on d.faculty_id = f.id and d.code = 'CS'
join public.university_levels lvl on lvl.code = 'L1'
join public.university_semesters sem on sem.code = v.sem_code
on conflict (university_id, department_id, academic_level_id, semester_id, code) do nothing;

-- 4c) الأقسام الهندسية الأخرى (مدني/ميكانيكا/كهرباء/عمارة/اتصالات) — L1
insert into public.university_subjects (university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type)
select u.id, f.id, d.id, lvl.id, sem.id, v.name, v.name_en, v.code, 'core'
from (values
  ('رياضيات هندسية', 'Engineering Mathematics', 'MATH101', 'S1'),
  ('رسم هندسي', 'Engineering Drawing', 'DRW101', 'S1'),
  ('فيزياء هندسية', 'Engineering Physics', 'PHY101', 'S1'),
  ('استاتيكا', 'Statics', 'ENG102', 'S2'),
  ('مقدمة البرمجة', 'Introduction to Programming', 'CS101', 'S2')
) as v(name, name_en, code, sem_code)
cross join public.universities u
join public.university_faculties f on f.university_id = u.id and f.code = 'ENG'
join public.university_departments d on d.faculty_id = f.id and d.code in ('CIVIL', 'MECH', 'ELEC', 'ARCH', 'COMM')
join public.university_levels lvl on lvl.code = 'L1'
join public.university_semesters sem on sem.code = v.sem_code
on conflict (university_id, department_id, academic_level_id, semester_id, code) do nothing;

-- 4d) طب بشرى / أسنان / صيدلة (قسم عام) — L1
insert into public.university_subjects (university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type)
select u.id, f.id, d.id, lvl.id, sem.id, v.name, v.name_en, v.code, 'core'
from (values
  ('التشريح', 'Anatomy', 'ANAT101', 'S1'),
  ('الهستولوجيا', 'Histology', 'HIST101', 'S1'),
  ('الكيمياء الحيوية', 'Biochemistry', 'BCH101', 'S2'),
  ('وظائف الأعضاء', 'Physiology', 'PHYSIO101', 'S2')
) as v(name, name_en, code, sem_code)
cross join public.universities u
join public.university_faculties f on f.university_id = u.id and f.code in ('MED', 'DENT', 'PHARM')
join public.university_departments d on d.faculty_id = f.id and d.code = 'GEN'
join public.university_levels lvl on lvl.code = 'L1'
join public.university_semesters sem on sem.code = v.sem_code
on conflict (university_id, department_id, academic_level_id, semester_id, code) do nothing;

-- 4e) تجارة / إدارة أعمال — L1
insert into public.university_subjects (university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type)
select u.id, f.id, d.id, lvl.id, sem.id, v.name, v.name_en, v.code, 'core'
from (values
  ('مبادئ المحاسبة', 'Principles of Accounting', 'ACC101', 'S1'),
  ('مبادئ إدارة الأعمال', 'Principles of Management', 'MNG101', 'S1'),
  ('الاقتصاد الجزئي', 'Microeconomics', 'ECO101', 'S1'),
  ('الرياضيات التجارية', 'Business Mathematics', 'MATH102', 'S2'),
  ('الإحصاء في الأعمال', 'Business Statistics', 'STAT101', 'S2')
) as v(name, name_en, code, sem_code)
cross join public.universities u
join public.university_faculties f on f.university_id = u.id and f.code = 'COM'
join public.university_departments d on d.faculty_id = f.id
join public.university_levels lvl on lvl.code = 'L1'
join public.university_semesters sem on sem.code = v.sem_code
on conflict (university_id, department_id, academic_level_id, semester_id, code) do nothing;

-- 4f) حقوق — L1
insert into public.university_subjects (university_id, faculty_id, department_id, academic_level_id, semester_id, name, name_en, code, type)
select u.id, f.id, d.id, lvl.id, sem.id, v.name, v.name_en, v.code, 'core'
from (values
  ('مدخل إلى علم القانون', 'Introduction to Legal Science', 'LAW101', 'S1'),
  ('القانون المدني', 'Civil Law', 'LAW102', 'S1'),
  ('القانون الدستوري', 'Constitutional Law', 'LAW103', 'S2'),
  ('القانون الجنائي', 'Criminal Law', 'LAW104', 'S2')
) as v(name, name_en, code, sem_code)
cross join public.universities u
join public.university_faculties f on f.university_id = u.id and f.code = 'LAW'
join public.university_departments d on d.faculty_id = f.id
join public.university_levels lvl on lvl.code = 'L1'
join public.university_semesters sem on sem.code = v.sem_code
on conflict (university_id, department_id, academic_level_id, semester_id, code) do nothing;

-- 5) تعريب أسماء الجامعات المحفوظة بالإنجليزية سابقًا (idempotent)
update public.universities set name = 'جامعة القاهرة' where code = 'CAU' and name <> 'جامعة القاهرة';
