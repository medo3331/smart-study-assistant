// ============================================================================
// MAGICLY — Support Eligibility (Phase 1)
// ============================================================================
// حصر_conditions لما يُفعّل AI Support تلقائياً.
// القاعدة: مطلوب إثبات وجود طالب مسجّل، والهدف ليس محادثة طالب مع طالب.
// ============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// تقييم أهلية المحادثة
// ─────────────────────────────────────────────────────────────────────────────

/**
 * حصر: محادثات طالب مع طالب لا تستجيب لها AI Support.
 * لو قيمة `conversationType` مساوية لـ "peer",
 * أو إذا كان الهدف ضمن قائمة المستخدمين (المستخدمون غير المسجلون),
 * لا نعالجها.
 */
export function isStudentToStudentConversation(
  conversationType?: string
): boolean {
  const peerTypes = new Set(["peer", "student_to_student", "private"]);
  if (!conversationType) return false;
  return peerTypes.has(conversationType.toLowerCase());
}

/**
 * هل هذا موكل دعم رسمي (ذاتي الإدارة) بالنسبة للطرف الخاضع للمساءلة؟
 */
export function isOfficialAdminConversation(conversationType: string | undefined): boolean {
  const officialTypes = new Set([
    "admin",
    "official_admin",
    "support_admin",
    "support_policy",
    "administration",
  ]);
  if (!conversationType) return false;
  return officialTypes.has(conversationType.toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// تحديد المستلم (الطرف الآخر) في حديث دعم
// ─────────────────────────────────────────────────────────────────────────────

/**
 * استخراج معرف المستلم المصرح له للرسالة الخاصة بالدعم أو الإدارة.
 * الهدف هو النموذج الآخر في السجل المهم.
 */
export function getRecipientUserId(
  eventSource: string,
  userId: string | null,
  relatedUserIds: string[]
): string | null {
  if (eventSource === "support_message" || eventSource === "admin_message") {
    if (!userId) return null;
    return userId;
  }
  const others = relatedUserIds.filter((id) => id !== userId);
  return others.length > 0 ? others[0] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// فحص أهلية استقبال الحدث
// ─────────────────────────────────────────────────────────────────────────────

/**
 * فحص ما إذا كان حدث الدعم مقصوداً للطالب المسجل.
 */
export function isSupportMessageEligible(
  eventSource: string,
  userId: string | null,
  relatedUserIds: string[],
  conversationType?: string
): boolean {
  if (eventSource !== "support_message" && eventSource !== "support_reply") {
    return false;
  }
  if (!userId) return false;
  if (isStudentToStudentConversation(conversationType)) return false;
  return true;
}

/**
 * فحص ما إذا كان حدث الدعم مقصوداً للإدارة.
 */
export function isAdminMessageEligible(
  eventSource: string,
  userId: string | null,
  relatedUserIds: string[],
  conversationType?: string
): boolean {
  if (eventSource !== "admin_message" && eventSource !== "admin_reply") {
    return false;
  }
  if (!userId) return false;
  return true;
}
