import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/ui";

export default function StorePage() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">حزم الرصيد (AI Credits)</h1>
      <p className="text-sm text-muted-foreground">
        هذه الصفحة قيد الإعداد. لشراء رصيد AI Credits أو ترقية الخطة، يرجى التواصل مع الدعم أو زيارة صفحة الأسعار.
      </p>
      <div className="flex gap-3">
        <Link href="/pricing" className="underline">صفحة الأسعار</Link>
        <Link href="/dashboard" className="underline">لوحة التحكم</Link>
      </div>
    </div>
  );
}
