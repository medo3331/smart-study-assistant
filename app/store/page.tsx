import { redirect } from "next/navigation";

/**
 * /store → redirect لقسم Magic Credits في المتجر الموحّد (D-M-02).
 * الروابط القديمة (UnifiedChat / rate-limit / إشعارات) بتفضل شغالة —
 * الرديركت دائم مش مؤقت.
 */
export default function StorePage() {
  redirect("/shop#credits");
}
