"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { IconBadge } from "@/components/ui/IconBadge";
import {
  WorshipChrome,
  useSharedWorshipData,
} from "@/components/worship/WorshipChrome";
import { ReciterSelector } from "@/components/worship/ReciterSelector";
import { CALCULATION_METHODS, MADHABS } from "@/lib/islamic/prayer-times";
import type { IslamicSettings } from "@/lib/islamic/worship-progress";
import {
  ArrowLeft,
  MapPin,
  Bell,
  BellRing,
  BookOpen,
  Headphones,
  Layers as LayersIcon,
  RotateCcw,
} from "lucide-react";
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from "@/lib/islamic/notifications";

/**
 * Worship Settings Page — /worship/settings
 *
 * الإعدادات بتتحفظ محليًا (نفس نظام useIslamicSettings) + على البروفايل
 * للحسابات الحقيقية — فبتلاقيها على أي جهاز.
 */
export default function WorshipSettingsPage() {
  return (
    <WorshipChrome maxWidth="max-w-3xl">
      <SettingsHome />
    </WorshipChrome>
  );
}

function SettingsHome() {
  const shared = useSharedWorshipData();
  const settings = shared?.settings;
  const update = shared?.updateSettingsLocal;

  if (!shared || !settings || !update) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#10B981]" />
        <span className="ml-3 text-[#9AA0C0]">جاري تحميل الإعدادات…</span>
      </div>
    );
  }

  const handleChange = <K extends keyof IslamicSettings>(
    key: K,
    value: IslamicSettings[K],
  ) => update({ [key]: value } as Partial<IslamicSettings>);

  return (
    <>
      {/* Header */}
      <Reveal index={0}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">إعدادات العبادات</h1>
            <p className="mt-1 text-[#9AA0C0]">
              تخصيص مواقيت الصلاة والأذكار والقرآن
              {shared.profile && !shared.profile.isAnonymous
                ? " • بتتزامن مع حسابك"
                : ""}
            </p>
          </div>
          <Link
            href="/worship"
            className="flex items-center gap-1 text-sm text-[#6EE7B7] transition-colors hover:text-[#10B981]"
          >
            <ArrowLeft size={18} aria-hidden />
            <span>عباداتي</span>
          </Link>
        </div>
      </Reveal>

      {/* ── PRAYER SETTINGS ── */}
      <>
        <Reveal index={1}>
          <GlassCard className="space-y-6 p-6">
            <SectionHeader
              icon={MapPin}
              color="text-[#FB923C]"
              bg="bg-[#FB923C]/15"
              title="الموقع"
              description="تحديد الموقع لحساب مواقيت الصلاة الدقيقة"
            />

            <div className="space-y-4">
              <Field label="المدينة">
                <input
                  type="text"
                  value={settings.location?.city ?? ""}
                  onChange={(e) =>
                    handleChange("location", {
                      ...settings.location,
                      city: e.target.value,
                    })
                  }
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="خط العرض">
                  <input
                    type="number"
                    step="any"
                    value={settings.latitude}
                    onChange={(e) =>
                      handleChange(
                        "latitude",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="خط الطول">
                  <input
                    type="number"
                    step="any"
                    value={settings.longitude}
                    onChange={(e) =>
                      handleChange(
                        "longitude",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field label="المنطقة الزمنية">
                <input
                  type="text"
                  value={settings.timezone}
                  onChange={(e) => handleChange("timezone", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </GlassCard>
        </Reveal>

        <Reveal index={2}>
          <GlassCard className="space-y-6 p-6">
            <SectionHeader
              icon={LayersIcon}
              color="text-[#10B981]"
              bg="bg-[#10B981]/15"
              title="طريقة الحساب والمذهب"
              description="اختيار طريقة حساب مواقيت الصلاة والمذهب الفقهي"
            />

            <div className="space-y-4">
              <Field label="طريقة الحساب">
                <select
                  value={settings.calculationMethod}
                  onChange={(e) =>
                    handleChange("calculationMethod", e.target.value)
                  }
                  className={selectClass}
                >
                  {CALCULATION_METHODS.map((method) => (
                    <option key={method.id} value={method.id} className="bg-[#0D1029]">
                      {method.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="المذهب الفقهي">
                <select
                  value={settings.madhab}
                  onChange={(e) =>
                    handleChange("madhab", e.target.value as "shafi" | "hanafi")
                  }
                  className={selectClass}
                >
                  {MADHABS.map((madhab) => (
                    <option key={madhab.id} value={madhab.id} className="bg-[#0D1029]">
                      {madhab.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </GlassCard>
        </Reveal>

        <Reveal index={3}>
          <GlassCard className="space-y-6 p-6">
            <SectionHeader
              icon={Bell}
              color="text-[#34D399]"
              bg="bg-[#34D399]/15"
              title="الإشعارات والتنبيهات"
              description="إدارة تنبيهات الصلاة والأذان"
            />
            <div className="space-y-4">
              <SettingToggle
                label="إشعارات الصلاة"
                description="تلقي تنبيه عند دخول كل وقت صلاة"
                checked={settings.prayerNotifications}
                onChange={(checked) =>
                  handleChange("prayerNotifications", checked)
                }
              />
              <SettingToggle
                label="تذكير أذكار الصباح"
                description="تنبيه بعد صلاة الفجر لأذكار الصباح"
                checked={settings.morningAdhkarReminder}
                onChange={(checked) =>
                  handleChange("morningAdhkarReminder", checked)
                }
              />
              <SettingToggle
                label="تذكير أذكار المساء"
                description="تنبيه بعد صلاة العصر لأذكار المساء"
                checked={settings.eveningAdhkarReminder}
                onChange={(checked) =>
                  handleChange("eveningAdhkarReminder", checked)
                }
              />
              <SettingToggle
                label="تذكير أذكار النوم"
                description="تنبيه قبل النوم لأذكار النوم"
                checked={settings.sleepAdhkarReminder ?? false}
                onChange={(checked) =>
                  handleChange("sleepAdhkarReminder", checked)
                }
              />
              <NotificationPermissionRow />
            </div>
          </GlassCard>
        </Reveal>
      </>

      {/* ── QURAN SETTINGS ── */}
      <Reveal index={4}>
        <GlassCard className="space-y-6 p-6">
          <SectionHeader
            icon={BookOpen}
            color="text-[#34D399]"
            bg="bg-[#34D399]/15"
            title="إعدادات القراءة"
            description="تخصيص الورد اليومي وتتبع التقدم"
          />
          <div className="space-y-4">
            <Field label={`الهدف اليومي للقراءة: ${settings.quranDailyTarget} آيات`}>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={settings.quranDailyTarget}
                onChange={(e) =>
                  handleChange("quranDailyTarget", parseInt(e.target.value))
                }
                className="h-2 w-full appearance-none rounded-full bg-white/[0.06] accent-[#34D399]"
              />
            </Field>
          </div>
        </GlassCard>
      </Reveal>

      {/* ── AUDIO ── */}
      <Reveal index={5}>
        <GlassCard className="space-y-6 p-6">
          <SectionHeader
            icon={Headphones}
            color="text-[#10B981]"
            bg="bg-[#10B981]/15"
            title="إعدادات الصوت"
            description="اختيار القارئ المفضل لتلاوة القرآن"
          />
          <ReciterSelector />
        </GlassCard>
      </Reveal>

      {/* Reset / Back */}
      <Reveal index={6}>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => {
              import("@/lib/islamic/worship-progress").then(
                ({ DEFAULT_ISLAMIC_SETTINGS }) => {
                  // إعادة تعيين للمحلي + السحابة (للحسابات الحقيقية).
                  shared.updateSettingsLocal(DEFAULT_ISLAMIC_SETTINGS);
                },
              );
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] px-4 py-3 text-sm font-medium text-[#9AA0C0] transition-colors hover:bg-white/[0.04] hover:text-[#E7E9F5]"
          >
            <RotateCcw size={16} aria-hidden />
            إعادة تعيين
          </button>
          <Link
            href="/worship"
            className="flex flex-1 items-center justify-center rounded-2xl bg-[#10B981] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#059669]"
          >
            العودة لعباداتي
          </Link>
        </div>
      </Reveal>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* عناصر صغيرة                                                                 */
/* -------------------------------------------------------------------------- */

const inputClass =
  "w-full h-11 px-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9AA0C0] focus:outline-none focus:border-[#10B981]/50 focus:bg-white/[0.06]";
const selectClass =
  "w-full h-11 px-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white focus:outline-none focus:border-[#10B981]/50 focus:bg-white/[0.06] appearance-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[#C7CBE6]">
        {label}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  color,
  bg,
  title,
  description,
}: {
  icon: LucideIcon;
  color: string;
  bg: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <IconBadge icon={Icon} color={color} bg={bg} size={40} />
      <div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-sm text-[#9AA0C0]">{description}</p>
      </div>
    </div>
  );
}

const PERMISSION_LABELS: Record<
  NotificationPermissionState,
  { label: string; description: string; action: string | null }
> = {
  granted: {
    label: "إشعارات المتصفح مفعّلة ✅",
    description: "هتوصلك تنبيهات الصلاة والأذان والأذكار وورد القرآن.",
    action: null,
  },
  default: {
    label: "إشعارات المتصفح",
    description: "اسمح بالإشعارات عشان توصلك تنبيهات مواقيت الصلاة والأذان والأذكار.",
    action: "تفعيل الإشعارات",
  },
  denied: {
    label: "الإشعارات متوقفة من المتصفح ❌",
    description: "اسمح بالإشعارات لهذا الموقع من إعدادات المتصفح عشان التذكيرات تشتغل.",
    action: null,
  },
  unsupported: {
    label: "المتصفح مش بيدعم الإشعارات",
    description: "جرّب متصفح تاني (زي Chrome) عشان تفعّل تنبيهات العبادات.",
    action: null,
  },
};

function NotificationPermissionRow() {
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(
      () => setPermission(getNotificationPermission()),
      0,
    );
    return () => window.clearTimeout(id);
  }, []);

  const state = PERMISSION_LABELS[permission];

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4">
      <div className="flex flex-1 items-center gap-3">
        <BellRing size={20} className="flex-shrink-0 text-[#10B981]" aria-hidden />
        <div className="flex-1">
          <p className="font-medium text-white">{state.label}</p>
          <p className="mt-0.5 text-sm text-[#9AA0C0]">{state.description}</p>
        </div>
      </div>
      {state.action && (
        <button
          type="button"
          disabled={requesting}
          onClick={async () => {
            setRequesting(true);
            setPermission(await requestNotificationPermission());
            setRequesting(false);
          }}
          className="flex-shrink-0 rounded-xl bg-[#10B981] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#059669] disabled:opacity-60"
        >
          {requesting ? "جاري التفعيل…" : state.action}
        </button>
      )}
    </div>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4">
      <div className="flex-1">
        <p className="font-medium text-white">{label}</p>
        <p className="mt-0.5 text-sm text-[#9AA0C0]">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={
          "relative h-6 w-11 flex-shrink-0 rounded-full transition-colors " +
          (checked ? "bg-[#10B981]" : "bg-white/[0.1]")
        }
      >
        <span
          className={
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform " +
            (checked ? "translate-x-5" : "translate-x-0.5")
          }
        />
      </button>
    </div>
  );
}
