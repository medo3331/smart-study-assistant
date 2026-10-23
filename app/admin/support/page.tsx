import { requireAdminPermission } from "@/lib/admin/auth-check";
export default async function AdminSupportPage() {
  await requireAdminPermission("support.manage");
  return (
    <div className="space-y-6">
      <div className="rounded border p-4">Admin support inbox (client integration pending).</div>
    </div>
  );
}