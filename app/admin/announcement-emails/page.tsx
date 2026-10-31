import { requireAdminPermission } from "@/lib/admin/auth-check";
import AnnouncementEmailCampaignsAdmin from "@/components/admin/AnnouncementEmailCampaignsAdmin";

export default async function Page() {
  await requireAdminPermission("announcements.manage");
  return (
    <div className="space-y-6">
      <AnnouncementEmailCampaignsAdmin />
    </div>
  );
}
