-- ============================================================================
-- Phase 2 — Lecture Transcription: temporary uploads bucket
-- (MANUAL RUN — #13 in the unified SQL list)
-- ============================================================================
-- ليه الباكيت ده موجود:
--   تفريغ المحاضرات (المرحلة 2) بيبعت الملف من المتصفح **مباشرة** لـ
--   Supabase Storage عبر presigned URL، وElevenLabs بيقرأه من
--   `cloud_storage_url`. السبب: Vercel Functions بيحدّ جسم الطلب بحوالي
--   4.5 ميجا، فمحاضرة 30 دقيقة كانت هتفشل عند الباب.
--
-- ⚠️ الباكيت **private** (مش public) — الرفع والقراءة بيحصلوا بس
--   بالتذكرة الموقّعة اللي بيولّدها
--   `app/api/lecture-transcription/upload-url` بـ service role.
--   مفيش أي عميل يقدر يكتب أو يقرأ هنا مباشرة.
--
-- ⚠️ مفيش سياسات عامة مقصود: الوصول كله service-role من السيرفر.
--   لو حد ضاف policy عامة هنا بالغلط، أي حد يقدر يكتب على الباكيت.
--
-- ⚠️ file_size_limit: Supabase بيفرض حد افتراضي على الباكيت. الـ SQL ده
--   بيحطّه على 1 جيجا عشان يطابق حد التطبيق في
--   `lib/ai/transcription-shared.ts`. لازم يكون **أكبر من أو等于** حد
--   التطبيق مش أصغر — لو أصغر، الرفع هيفشل عند حد الباكيت قبل ما حد
--   التطبيق يقدر يبلّغ الطالب بيه.
--
-- idempotent: كل عبارة guarded — آمن للتكرار.
-- ============================================================================

-- ١) الباكيت نفسه (private).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lecture-uploads',
  'lecture-uploads',
  false,                                      -- ⚠️ private — مش public
  1073741824,                                 -- 1 GiB (يطابق MAX_LECTURE_FILE_BYTES)
  array[
    'audio/aac','audio/x-aac','audio/x-aiff','audio/ogg','audio/mpeg',
    'audio/mp3','audio/mpeg3','audio/x-mpeg-3','audio/opus','audio/wav',
    'audio/x-wav','audio/webm','audio/flac','audio/x-flac','audio/mp4',
    'audio/aiff','audio/x-m4a','audio/m4a',
    'video/mp4','video/x-msvideo','video/x-matroska','video/quicktime',
    'video/x-ms-wmv','video/x-flv','video/webm','video/mpeg','video/3gpp'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ٢) تأمين الباكيت لو حد رفعه قبل كده public بالغلط.
update storage.buckets
   set public = false
 where id = 'lecture-uploads';

-- ٣) ممنوع أي قراءة/كتابة من المتصفح على مستوى storage.objects.
--    الخدمة كلها service-role (بتتجاوز RLS)، فمفيش داعي لسياسات عامة.
--    ⚠️ ما تعملش policy بتسمح بـ insert من anon/authenticated: ده هيفتح
--    الباكيت للزوار ويخلي حد يكتب عليه أي حاجة.
do $$
begin
  drop policy if exists "lecture-uploads: no anon read"  on storage.objects;
  drop policy if exists "lecture-uploads: no anon write" on storage.objects;
  drop policy if exists "lecture-uploads: no authed read" on storage.objects;
  drop policy if exists "lecture-uploads: no authed write" on storage.objects;
end $$;

-- ============================================================================
-- 🔥 CLEANUP — لازم تعمل ده من Supabase Dashboard → Storage → lifecycle
--    (مش SQL: الـ lifecycle APIs مش متاحة من SQL عادي).
--
--   قاعدة: امسح الملفات الأقدم من 24 ساعة.
--
--   - ليش: الأصل بيتمسح في `deleteObject()` بعد نجاح التفريغ، فالقاعدة
--     دي **شبكة أمان** للحالات اللي المتصفح قفل فيها اللاب قبل ما
--     يكمّل (رفع 200 ميجا على نت مقطوع = ملف يتيم في الباكيت).
--   - ليش 24 ساعة مش أقل: لو تفريغ 3 ساعات قطع بعد ساعتين، الطالب
--     يبقى لسه يقدر يرجع يقفل تحويل بدل ما يرفع الملف تاني.
--
-- ⚠️ من غير الـ lifecycle ده، أي رفع مقطوع = تسريب مساحة دائم.
--    وده مهم بصراحة على باقة Supabase المجانية (1 جيجا للحساب كله).
-- ============================================================================
