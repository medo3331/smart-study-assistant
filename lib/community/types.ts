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
