import { redirect } from "next/navigation";
import { Bot, Cpu, Gauge } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { MODEL_REGISTRY } from "@/lib/ai/models";
import { GATED_MODELS } from "@/lib/ai/model-access";
import { ALL_AGENTS } from "@/lib/ai/agents/registry";
import {
  MODEL_LIMITS,
  AGENT_LIMITS,
  GUEST_LIMIT,
  GUEST_WINDOW_HOURS,
  FREE_TEXT_LIMIT,
  FREE_TEXT_WINDOW_HOURS,
  FREE_VISION_LIMIT,
  FREE_VISION_WINDOW_HOURS,
} from "@/lib/ai/rate-limit";
import { providerConfigStatus, getProviderHealth, getProviderStats } from "@/lib/ai/health";
import { refreshModelStateCache, getAllRuntimeModelStates } from "@/lib/ai/model-state";
import { getAiOverview } from "@/lib/admin/ai-overview";
import { toggleModelFormAction, updateModelPriorityFormAction, updateModelLimitFormAction } from "@/app/admin/actions/ai-models-form-action";
import { AdminCard, AdminNotice, AdminPageHeader, AdminStatCard, AdminTableWrap } from "@/components/admin/ui";

/**
 * 🧠 نماذج الذكاء الاصطناعي — المرحلة 2 (تفعيل حقيقي).
 *
 * مصادر الحالة المعروضة — كلها حقيقية، مفيش نص ثابت:
 *   ١. التهيئة + الصحة التشغيلية: lib/ai/health.ts (providerConfigStatus +
 *      getProviderHealth/getProviderStats — بتتبنى من نتائج فعلية مش تخمين).
 *   ٢. الهوية/القدرات: MODEL_REGISTRY من lib/ai/models.ts (مصدر الكود).
 *   ٣. enabled/priority/daily_limit: جدول ai_models عبر lib/ai/model-state.ts —
 *      **نفس الكاش اللي الراوتر بيستخدمه**، فالتبديل هنا بيأثر فعليًا في
 *      الاختيار (routing.ts) خلال ≤٣٠ ثانية (TTL). لو الجدول غير متاح بتظهر
 *      القيم من الكود معلَّمة بصراحة + تنبيه.
 *
 * كل الأفعال (تفعيل/تعطيل/أولوية/حد يومي) server actions محصّنة: هوية المنفّذ
 * من الجلسة على السيرفر + hasPermission("models.manage") + audit_log
 * (PASS/FAIL/BLOCKED).
 */
export default async function AdminModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const sp = await searchParams;
  await requireAdminPermission("models.manage");

  // Phase 2: حالة الموديلات من الداتابيز (ai_models: enabled/priority/daily_limit)
  // — نفس الكاش اللي الراوتر بيستخدمه (TTL ٣٠ ثانية). false = الجدول مش متاح
  // → القيم المعروضة من الكود ومعلَّمة بصراحة.
  const modelStateReady = await refreshModelStateCache();
  const modelStates = getAllRuntimeModelStates();

  const [{ data: aiOverview, error: aiOverviewError }, recentLogs] = await Promise.all([
    getAiOverview(),
    getRecentAiLogs(),
  ]);

  const agents = Object.values(ALL_AGENTS);
  const gatedModels = Object.keys(GATED_MODELS);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="نماذج الذكاء الاصطناعي"
        subtitle="حالة المزوّدين والنماذج، حدود الاستخدام لكل مسار، وأفعال التفعيل/التعطيل (Owner)."
        badge="models.manage"
        permissionKey="models.manage"
      />

      {sp.success ? <AdminNotice tone="emerald">تم: {sp.success}</AdminNotice> : null}
      {sp.error ? <AdminNotice tone="rose">خطأ: {sp.error}</AdminNotice> : null}

      <AdminCard title="حالة المزوّدين (تهيئة + صحة تشغيلية لحظية)" description="المصدر: lib/ai/health.ts — providerConfigStatus() للتهيئة + getProviderHealth()/getProviderStats() للحالة التشغيلية بعد أول نتيجة فعلية." tone="purple">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(["groq", "nvidia", "openrouter", "gemini"] as const).map((p) => {
            const st = providerConfigStatus(p);
            // Phase 2: الحالة التشغيلية اللحظية — مش نص ثابت
            const runtime = getProviderHealth(p);
            const stats = getProviderStats(p);
            const inCooldown = stats.cooldownUntil > Date.now();
            const value = st === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : runtime;
            const tone = st === "NOT_CONFIGURED" ? "rose" : runtime === "AVAILABLE" ? "emerald" : runtime === "DEGRADED" ? "amber" : "rose";
            const hint = st === "NOT_CONFIGURED"
              ? "مفيش مفتاح → المزوّد مستثنى من الراوتر"
              : `نجاح ${stats.successCount} / فشل ${stats.failureCount} · زمن ${stats.averageLatencyMs}ms${inCooldown ? " · في cooldown" : ""}${stats.lastError ? ` · آخر خطأ: ${stats.lastError.slice(0, 40)}` : ""}`;
            return (
              <AdminStatCard
                key={p}
                label={p.toUpperCase()}
                value={value}
                tone={tone}
                hint={hint}
              />
            );
          })}
        </div>
        <AdminNotice tone="default">
          الحالة التشغيلية (COOLDOWN / RATE_LIMITED / AUTH_ERROR / TIMEOUT) بتتبنى من نتائج الطلبات الفعلية في العملية الحالية —
          عملية سيرفر جديدة بتبدأ من AVAILABLE بعد فحص التهيئة (سلوك موثق في lib/ai/health.ts، مش عيب إخفاء).
        </AdminNotice>
      </AdminCard>

      <AdminCard title="AI Overview — مراقبة الاستخدام" description="المصدر: ai_credit_ledger (reason=ai_reserve) + entitlements عبر DATABASE_URL." tone="purple">
        {aiOverviewError ? (
          <AdminNotice tone="rose">
            {aiOverviewError} — <strong>غير قابل للتحقق من هنا</strong> (محتاج <code>DATABASE_URL</code> أو تنفيذ <code>db/economy-phase-d.sql</code>).
          </AdminNotice>
        ) : aiOverview ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AdminStatCard label="إجمالي الطلبات" value={aiOverview.total} hint="reason=ai_reserve" />
            <AdminStatCard label="آخر 24 ساعة" value={aiOverview.last24h} />
            <AdminStatCard label="آخر 3 ساعات" value={aiOverview.last3h} />
            <AdminStatCard label="Entitlements" value={aiOverview.entitlements} />
            <AdminStatCard label="استخدام Super (24h)" value={`${aiOverview.super24h} / 5`} hint="nemotron-3-super-120b" tone="amber" />
            <AdminStatCard label="استخدام Ultra (24h)" value={`${aiOverview.ultra24h} / 3`} hint="nemotron-3-ultra-550b" tone="amber" />
          </div>
        ) : (
          <AdminNotice tone="rose">لا توجد بيانات — غير قابل للتحقق من هنا.</AdminNotice>
        )}
      </AdminCard>

      <AdminCard title="التنفيذات الأخيرة (ai_agent_generations)" description="آخر 5 عمليات توليد مسجّلة فعليًا في الداتابيز." tone="default">
        {recentLogs.length === 0 ? (
          <AdminNotice>لا توجد سجلات AI مسجّلة حتى الآن (أو الجلسة مقيّدة بـRLS) — النتيجة مش قابلة للتحقق الكامل من هنا.</AdminNotice>
        ) : (
          <AdminTableWrap>
            <thead>
              <tr className="bg-slate-950/60 text-slate-300">
                <th className="text-right px-3 py-2">المستخدم</th>
                <th className="text-right px-3 py-2">الـAgent</th>
                <th className="text-right px-3 py-2">المزوّد</th>
                <th className="text-right px-3 py-2">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log) => (
                <tr key={log.id} className="border-t border-slate-800">
                  <td className="px-3 py-2 font-mono" dir="ltr">{log.user_id ? `${log.user_id.slice(0, 8)}…` : "—"}</td>
                  <td className="px-3 py-2 text-emerald-300">{log.agent || "—"}</td>
                  <td className="px-3 py-2 text-blue-300">{log.provider || "—"}</td>
                  <td className="px-3 py-2 text-slate-400">{new Date(log.created_at).toLocaleString("ar-EG")}</td>
                </tr>
              ))}
            </tbody>
          </AdminTableWrap>
        )}
      </AdminCard>

      <AdminCard title="حدود الاستخدام المكوّنة (Rate Limiting)" description="المصدر: lib/ai/rate-limit.ts — قيم التهيئة الفعلية المستخدمة في الراوتر." tone="default">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-xs font-bold text-emerald-300 flex items-center gap-1"><Gauge size={14} /> Phase A — لكل مستخدم</p>
            <p className="text-[11px] text-slate-300">نص: <strong>{FREE_TEXT_LIMIT} / {FREE_TEXT_WINDOW_HOURS}h</strong></p>
            <p className="text-[11px] text-slate-300">رؤية/ملفات: <strong>{FREE_VISION_LIMIT} / {FREE_VISION_WINDOW_HOURS}h</strong></p>
          </div>
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-xs font-bold text-blue-300">Phase B — لكل موديل</p>
            {Object.entries(MODEL_LIMITS).map(([m, cfg]) => (
              <p key={m} className="text-[11px] text-slate-300 font-mono">{m.split("/").pop()} — <strong>{cfg.limit} / {cfg.windowHours}h</strong></p>
            ))}
            {gatedModels.length === 0 ? <p className="text-[11px] text-slate-500">لا يوجد حدود per-model</p> : null}
          </div>
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-xs font-bold text-purple-300">Phase C — الزوار</p>
            <p className="text-[11px] text-slate-300">الزوار (anon): <strong>{GUEST_LIMIT} / {GUEST_WINDOW_HOURS}h</strong></p>
            <p className="text-[11px] text-amber-300">نقطة ضعف موثقة: anon جديد = هوية جديدة.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(AGENT_LIMITS).map(([a, cfg]) => (
            <span key={a} className="text-[11px] bg-slate-800 px-2 py-1 rounded font-mono text-slate-300">
              {a}: {cfg.limit}/{cfg.windowHours}h
            </span>
          ))}
        </div>
      </AdminCard>

      <AdminCard
        title="سجل النماذج — حالة الداتابيز + أفعال حقيقية"
        description="الحالة المعروضة مدمجة: الهوية/القدرات من MODEL_REGISTRY (الكود) + enabled/priority/daily_limit من جدول ai_models (الداتابيز). كل فعل بينفذ كتابة حقيقية + audit_log، وبينعكس على الراوتر خلال ≤٣٠ ثانية (TTL الكاش في lib/ai/model-state.ts)."
        tone="amber"
      >
        {!modelStateReady ? (
          <AdminNotice tone="amber" title="جدول ai_models غير متاح">
            تعذّرت قراءة حالة الداتابيز — القيم المعروضة للحالة/الأولوية/الحد من <code>MODEL_REGISTRY</code> (الكود) ومعلَّمة بـ(كود).
            نفّذ <code>db/ai-models-control.sql</code> + <code>db/ai-models-priority-limits.sql</code> على Supabase. الأفعال هترجع FAIL مسجّلة بدل نجاح مزعوم.
          </AdminNotice>
        ) : null}

        <AdminTableWrap>
          <thead>
            <tr className="bg-slate-950/60 text-amber-300">
              <th className="text-right px-3 py-2">المعرّف</th>
              <th className="text-right px-3 py-2">الاسم</th>
              <th className="text-right px-3 py-2">المزوّد</th>
              <th className="text-right px-3 py-2">التصنيف</th>
              <th className="text-right px-3 py-2">أولوية (DB)</th>
              <th className="text-right px-3 py-2">الحالة</th>
              <th className="text-right px-3 py-2">حد يومي / استخدام اليوم</th>
              <th className="text-right px-3 py-2">وصول</th>
              <th className="text-right px-3 py-2">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {MODEL_REGISTRY.map((m) => {
              // Phase 2: دمج حالة الداتابيز مع السجل — DB بتغلّب الكود لما تكون متاحة
              const st = modelStates?.get(m.id);
              const effectiveEnabled = st ? st.enabled : m.enabled;
              const effectivePriority = st?.priority ?? m.priority;
              const dailyLimit = st ? st.dailyLimit : null;
              const usedToday = st?.usedToday ?? 0;
              const limitReached = dailyLimit !== null && usedToday >= dailyLimit;
              return (
              <tr key={m.id} className="border-t border-slate-800">
                <td className="px-3 py-2 font-mono text-[10px] text-slate-300" dir="ltr">{m.id}</td>
                <td className="px-3 py-2">{m.displayName}</td>
                <td className="px-3 py-2 text-blue-300">{m.provider}</td>
                <td className="px-3 py-2">{m.tier}</td>
                <td className="px-3 py-2">
                  <form
                    action={async (formData: FormData) => {
                      "use server";
                      const res = await updateModelPriorityFormAction(formData);
                      if (res.ok) redirect("/admin/models?success=" + encodeURIComponent(res.message));
                      redirect("/admin/models?error=" + encodeURIComponent(res.message));
                    }}
                    className="flex items-center gap-1"
                  >
                    <input type="hidden" name="model_id" value={m.id} />
                    <input
                      type="number"
                      name="priority"
                      min={1}
                      max={99}
                      defaultValue={effectivePriority}
                      aria-label={`أولوية ${m.id}`}
                      className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-slate-200"
                    />
                    <button type="submit" className="text-[10px] bg-slate-700 text-white rounded px-2 py-1 hover:bg-slate-600">حفظ</button>
                  </form>
                  <span className="text-slate-500 text-[10px]">fallback: {m.fallbackPriority} (كود)</span>
                </td>
                <td className="px-3 py-2">
                  <span className={effectiveEnabled ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>{effectiveEnabled ? "enabled" : "disabled"}</span>
                  <span className="text-slate-500 text-[10px]"> {st ? "(DB)" : "(كود)"}</span>
                  {limitReached ? <span className="block text-rose-400 text-[10px] font-bold">مستبعد: حد يومي متخطي</span> : null}
                </td>
                <td className="px-3 py-2">
                  <form
                    action={async (formData: FormData) => {
                      "use server";
                      const res = await updateModelLimitFormAction(formData);
                      if (res.ok) redirect("/admin/models?success=" + encodeURIComponent(res.message));
                      redirect("/admin/models?error=" + encodeURIComponent(res.message));
                    }}
                    className="flex items-center gap-1"
                  >
                    <input type="hidden" name="model_id" value={m.id} />
                    <input
                      type="number"
                      name="daily_limit"
                      min={0}
                      max={100000}
                      defaultValue={dailyLimit ?? 0}
                      title="0 = بلا حد"
                      aria-label={`الحد اليومي لـ ${m.id}`}
                      className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-slate-200"
                    />
                    <button type="submit" className="text-[10px] bg-slate-700 text-white rounded px-2 py-1 hover:bg-slate-600">حفظ</button>
                  </form>
                  <span className={limitReached ? "text-rose-400 text-[10px] font-bold" : "text-slate-500 text-[10px]"}>
                    اليوم: {usedToday}{dailyLimit !== null ? ` / ${dailyLimit}` : " / ∞"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {gatedModels.includes(m.id) ? (
                    <span className="bg-purple-500/15 text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-bold">مقفل (entitlement)</span>
                  ) : (
                    <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">مجاني</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <form
                    action={async (formData: FormData) => {
                      "use server";
                      const res = await toggleModelFormAction(formData);
                      if (res.ok) redirect("/admin/models?success=" + encodeURIComponent(res.message));
                      redirect("/admin/models?error=" + encodeURIComponent(res.message));
                    }}
                  >
                    <input type="hidden" name="model_id" value={m.id} />
                    <input type="hidden" name="target_enabled" value={effectiveEnabled ? "false" : "true"} />
                    <button
                      type="submit"
                      className={
                        effectiveEnabled
                          ? "text-[10px] bg-rose-600 text-white rounded px-2 py-1 hover:bg-rose-500"
                          : "text-[10px] bg-emerald-600 text-white rounded px-2 py-1 hover:bg-emerald-500"
                      }
                    >
                      {effectiveEnabled ? "تعطيل" : "تفعيل"}
                    </button>
                  </form>
                </td>
              </tr>
              );
            })}
          </tbody>
        </AdminTableWrap>

        <AdminNotice tone="default">
          <Cpu size={12} className="inline" /> الأفعال دي بتحدّث <code>ai_models</code> (enabled / priority / daily_limit + updated_at) وبتسجّل
          <code> audit_log</code> بنتيجة PASS/FAIL/BLOCKED، وبينعكس أثرها على الراوتر (lib/ai/routing.ts) خلال ≤٣٠ ثانية عبر كاش
          <code> lib/ai/model-state.ts</code>. لو الجدول مش منطبق على Supabase، الفعل هيرجّع FAIL ويسجل السبب — مفيش نجاح مزعوم.
        </AdminNotice>
      </AdminCard>

      <AdminCard title={`Agent Registry — ${agents.length} agents`} description="المصدر: lib/ai/agents/registry.ts" tone="default">
        <AdminNotice tone="amber">
          كل الـAgents حالياً STUB — الـPer-Agent limits مكوّنة (CONFIGURED) وليست تحقق فعلي لحظة التشغيل.
        </AdminNotice>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((a) => (
            <div key={a.id} className="bg-slate-950/40 rounded-xl p-3 border border-slate-800">
              <p className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Bot size={14} className="text-purple-400" /> {a.label}
                <span className="text-[10px] font-mono text-slate-500">({a.id})</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">{a.description}</p>
              <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">STUB</span>
            </div>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}

/** أحدث عمليات التوليد — نفس الجدول اللي كانت الصفحة الموحّدة بتقراه. */
async function getRecentAiLogs() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_agent_generations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []) as Array<{ id: string; user_id?: string; agent?: string; provider?: string; created_at: string }>;
}
