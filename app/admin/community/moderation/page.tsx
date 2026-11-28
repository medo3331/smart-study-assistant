import { requireAdminPermission } from "@/lib/admin/auth-check";
import AdminModerationClient from "./ModerationClient";

export default async function AdminCommunityModerationPage() {
  await requireAdminPermission("community.moderate");
  return <AdminModerationClient />;
}
