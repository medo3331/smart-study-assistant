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
