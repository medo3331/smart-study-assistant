// ============================================================================
// MAGICLY — AI Support Administration Dashboard (Phase 1)
// ============================================================================
// جزء من لوحة الإدارة يسمح للمشرفين:
//   - عرض الحالات المفتوحة للمشاريع (support_ai_cases)
//   - مراجعة المقالات المنشورة والزمردات
//   - تهيئة التصنيفات ومقترحات AI
//   - إدارة التصعيدات
//
// ملاحظة: الواجهة الافتراضية للمشرفين التي تجمع من قاعدة البيانات الخاصة
// بالـ DB. يتم تجميع البيانات من أحدث st auditing.
// ============================================================================

import { Suspense, useState } from "react";
import { RefreshCw, BookOpen, Tags, AlertTriangle, Clock, Users, MessageSquare } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { hasPermission } from "@/lib/auth-roles";
import type { AdminPermissionKey } from "@/lib/auth-roles";
import {
  AdminPageHeader,
  AdminCard,
  AdminNotice,
  AdminTableWrap,
  AdminStatCard,
} from "@/components/admin/ui";

// ─────────────────────────────────────────────────────────────────────────────
// أرقام (placeholder) — سيُستبدل لاحقاً بالاستعلامات الحقيقية من قاعدة البيانات
// ─────────────────────────────────────────────────────────────────────────────

function placeholderCounts() {
  return {
    totalOpen: 0,
    totalClosed: 0,
    aiResolved: 0,
    escalated: 0,
    latestArticleVersions: "N/A",
    resolvedCount: "0",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// بطاقات التحكم (stats)
// ─────────────────────────────────────────────────────────────────────────────

function StatsRow() {
  const counts = placeholderCounts();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <AdminStatCard label="الحالات المفتوحة" value={String(counts.totalOpen)} hint="حالات دعم AI قيد المعالجة" tone="blue" />
      <AdminStatCard label="م résolues تلقائياً" value={String(counts.aiResolved)} hint="حالات تم حلها بشكل آلي" tone="emerald" />
      <AdminStatCard label="التصعيدات" value={String(counts.escalated)} hint="حالات رفعت إلى موظف دعم" tone="amber" />
      <AdminStatCard label="المقالات المنشورة" value={String(counts.latestArticleVersions)} hint="مقالات معتمدة متاحه للطلاب" tone="purple" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// القائمة الافتراضية (placeholder)
// ─────────────────────────────────────────────────────────────────────────────

function CaseTable() {
  return (
    <AdminTableWrap>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rule text-ink-soft">
            <th className="text-left py-2 px-3">مصدر الحدث</th>
            <th className="text-left py-2 px-3">المعرف</th>
            <th className="text-left py-2 px-3">الحالة</th>
            <th className="text-left py-2 px-3">الخطوة الحالية</th>
            <th className="text-left py-2 px-3">آخر تحديث</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-rule">
            <td className="py-2 px-3">support_message</td>
            <td className="py-2 px-3 text-ink">mag-12345678</td>
            <td className="py-2 px-3">
              <span className="text-amber-600">classifying</span>
            </td>
            <td className="py-2 px-3 text-ink">تشخيص مدعوم</td>
            <td className="py-2 px-3 text-ink-soft">قبل 5 دقائق</td>
          </tr>
          <tr className="border-b border-rule">
            <td className="py-2 px-3">admin_message</td>
            <td className="py-2 px-3 text-ink">adm-87654321</td>
            <td className="py-2 px-3">
              <span className="text-amber-600">awaiting_student</span>
            </td>
            <td className="py-2 px-3 text-ink">طلب توضيحي</td>
            <td className="py-2 px-3 text-ink-soft">قبل 12 دقيقة</td>
          </tr>
        </tbody>
      </table>
    </AdminTableWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// صفحات المحتوى (default export)
// ─────────────────────────────────────────────────────────────────────────────

function PageContent() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="مركز دعم AI"
        subtitle="إدارة المقالات ومراجعة التصنيفات ومتابعة سير الدعم — تشخيص، حلول آمنة، ورفع الخبر إلى البشر."
        permissionKey={"support.manage" as AdminPermissionKey}
      />

      <StatsRow />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdminCard title="قائمة الحالات المفتوحة" description="متابعة الحالات الجارية للمستخدمين">
          <CaseTable />
        </AdminCard>

        <AdminCard title="مقترحات المعرفة (AI)" description="مقترحات AI لمقالات جديدة، متوفرة للمراجعة فقط">
          <ol className="list-decimal list-inside text-sm text-ink space-y-2">
            <li>مقترح "ما وصل رصيدي" — draft</li>
            <li>مقترح "صعوبات تسجيل الدخول" — draft</li>
            <li>أعمال أخرى — draft</li>
          </ol>
          <div className="mt-3 flex gap-2">
            <button className="rounded-lg border border-rule px-3 py-1.5 text-sm text-ink hover:bg-paper-2">مراجعة</button>
            <button className="rounded-lg bg-marker px-3 py-1.5 text-sm text-white">نشر</button>
          </div>
        </AdminCard>
      </div>
    </div>
  );
}

export default function AiSupportAdminPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-8"><RefreshCw className="h-6 w-6 animate-spin" /></div>}>
      <PageContent />
    </Suspense>
  );
}
