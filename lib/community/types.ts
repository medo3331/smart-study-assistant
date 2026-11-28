// ===========================================================================
// MAGICLY — Community C1: الأنواع المشتركة للطبقة الاجتماعية
// ===========================================================================

/** ملخص بروفايل ظاهر في نتائج البحث/الاقتراحات (بيانات مفلترة بالخصوصية). */
export type SocialProfileSummary = {
  profile_id: string;
  display_name: string | null;
  avatar_url: string | null;
  university: string | null;
  faculty: string | null;
  specialization: string | null;
  year: string | null;
  interests: string[] | null;
  bio: string | null;
  /** false → حساب خاص: اعرض الهوية المختصرة فقط */
  is_visible: boolean;
  match_score: number;
};

/** حالة العلاقة بين المستخدم الحالي وآخر (من get_relation_state). */
export type RelationState =
  | "anonymous"
  | "self"
  | "none"
  | "friends"
  | "pending_sent"
  | "pending_received"
  | "following"
  | "blocked";

/** إجراءات الصداقة المدعومة في /api/community/friends. */
export type FriendAction = "request" | "accept" | "reject" | "cancel" | "remove";

/** أكواد الأخطاء الموحدة الراجعة من الـRPCs. */
export const RELATION_ERROR_AR: Record<string, string> = {
  auth_required: "محتاج تسجّل دخولك الأول.",
  invalid_target: "هدف غير صالح.",
  invalid_action: "إجراء غير معروف.",
  not_allowed: "مش مسموح بإجراء الطلب ده.",
  not_found: "الحساب أو الطلب مش موجود.",
  requests_disabled: "صاحب الحساب مش بيقبل طلبات صداقة.",
  already_friends: "إنتو أصحاب بالفعل.",
  request_exists: "فيه طلب قائم بينكم بالفعل.",
  too_many_pending: "عندك عدد كبير من الطلبات المعلّقة — استنى ردود الأول.",
  already_handled: "الطلب ااتعامل معاه قبل كده.",
  private_account: "الحساب خاص — ابعت طلب صداقة بدل المتابعة.",
};

export function relationErrorAr(code: string | undefined, fallback: string): string {
  if (code && RELATION_ERROR_AR[code]) return RELATION_ERROR_AR[code];
  return fallback;
}

/** أنواع المنشورات التعليمية في مجتمع Magicly. */
export type PostKind = "text" | "achievement" | "question" | "tip" | "summary" | "challenge" | "poll" | "repost";

/** خصوصية المنشور الواحد. */
export type PostVisibility = "public" | "friends" | "private";

/** صف منشور راجع من RPCs القراءة (الفيد/البروفايل/المحفوظات/الهاشتاج). */
export type CommunityPostRow = {
  repost_of_post_id: string | null;
  quote_post_id: string | null;
  post_id: string;
  kind: PostKind;
  body: string;
  visibility: PostVisibility;
  image_url: string | null;
  created_at: string;
  author_id: string;
  author_name: string | null;
  author_code: string | null;
  author_avatar: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  saved_by_me: boolean;
};

/** صف تعليق راجع من get_post_comments. */
export type CommunityCommentRow = {
  comment_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  author_id: string;
  author_name: string | null;
  author_code: string | null;
  author_avatar: string | null;
  can_delete: boolean;
};

/** أخطاء RPCs المنشورات بالعربي. */
export const POST_ERROR_AR: Record<string, string> = {
  auth_required: "محتاج تسجّل دخولك الأول.",
  invalid_body: "اكتب حاجة في المنشور الأول (حتى 2000 حرف).",
  invalid_kind: "نوع المنشور غير معروف.",
  invalid_visibility: "قيمة خصوصية غير صالحة.",
  invalid_image: "صورة المنشور غير صالحة.",
  invalid_parent: "التعليق الأب غير موجود.",
  rate_limited: "نشرت منشورات كتير في الآخر — استنى شوية.",
  not_found: "المنشور أو التعليق مش موجود.",
  not_allowed: "مش مسموح لك بالإجراء ده.",
  invalid_poll: "الاستطلاع لازم يكون من خيارين لأربعة.",
  invalid_option: "اختيار غير موجود في الاستطلاع.",
  already_reposted: "أعدت نشر المنشور ده بالفعل.",
  restricted: "حسابك مقيّد حاليًا في المجتمع — تقدر تقدّم اعتراض.",
  content_blocked: "المنشور مخالف لقواعد المجتمع وما اتنشرش.",
};

export function postErrorAr(code: string | undefined, fallback: string): string {
  if (code && POST_ERROR_AR[code]) return POST_ERROR_AR[code];
  return fallback;
}

/** أسماء أنواع المنشورات بالعربي. */
export const POST_KIND_AR: Record<PostKind, string> = {
  text: "منشور",
  achievement: "إنجاز دراسي",
  question: "سؤال أكاديمي",
  tip: "معلومة مفيدة",
  summary: "ملخص أو مصدر",
  challenge: "تحدي",
  poll: "استطلاع رأي",
  repost: "إعادة نشر",
};

// ===========================================================================
// C4 — الإشراف والحماية: أسباب الإبلاغ + رسائل الأخطاء
// ===========================================================================

export type ReportTargetType = "post" | "comment" | "user";

export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: "harassment", label: "تحرّش أو مضايقات" },
  { id: "hate", label: "خطاب كراهية" },
  { id: "bullying", label: "تنمّر أو إهانة" },
  { id: "spam", label: "سبام أو إعلانات مزعجة" },
  { id: "doxxing", label: "نشر بيانات شخصية" },
  { id: "impersonation", label: "انتحال شخصية" },
  { id: "threat", label: "تهديد أو عنف" },
  { id: "illegal", label: "محتوى غير قانوني" },
  { id: "other", label: "سبب آخر" },
];

export const MOD_ERROR_AR: Record<string, string> = {
  auth_required: "محتاج تسجّل دخولك الأول.",
  invalid_target_type: "نوع الهدف غير صالح.",
  invalid_reason: "اختر سبب إبلاغ صحيح.",
  invalid_details: "التفاصيل أطول من اللازم (حتى 500 حرف).",
  invalid_target: "الهدف غير صالح.",
  not_found: "المنشور أو الحساب مش موجود.",
  cannot_report_self: "مش ممكن تُبلّغ عن نفسك.",
  rate_limited: "بعتّ إبلاغات كتير — استنى شوية.",
  already_reported: "أبلّغت عن ده قبل كده وهو لسه تحت المراجعة.",
  invalid_message: "اكتب سبب الاعتراض (10–1000 حرف).",
  already_appealed: "قدّمت اعتراض على الإجراء ده بالفعل.",
  restricted: "حسابك مقيّد حاليًا في المجتمع — تقدر تقدّم اعتراض.",
  content_blocked: "المنشور مخالف لقواعد المجتمع وما اتنشرش.",
};

export function modErrorAr(code: string | undefined, fallback: string): string {
  if (code && MOD_ERROR_AR[code]) return MOD_ERROR_AR[code];
  return fallback;
}

/** حالة الإشراف للطالب (من community_my_moderation_status). */
export type ModerationStatus = {
  ok: boolean;
  banned: boolean;
  ban_reason?: string | null;
  restricted_until?: string | null;
  warning_count?: number;
  active_action?: {
    id: string;
    action_type: string;
    reason: string;
    expires_at?: string | null;
    created_at?: string;
  } | null;
  my_appeals?: {
    id: string;
    action_id: string;
    status: "pending" | "approved" | "rejected";
    message: string;
    review_notes?: string | null;
    created_at?: string;
  }[];
};
