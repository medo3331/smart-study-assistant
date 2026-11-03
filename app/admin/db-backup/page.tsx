import { requireAdminPermission } from "@/lib/admin/auth-check";
import { listTables } from "@/app/admin/actions/db-backup";
import DbBackupClient from "./DbBackupClient";

export default async function AdminDbBackupPage() {
  await requireAdminPermission("admins.manage");
  const tables = await listTables();
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">نسخة من قاعدة البيانات</h1>
      <DbBackupClient initialTables={tables} />
    </div>
  );
}
