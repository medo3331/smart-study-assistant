"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { MobileNav } from "@/components/dashboard/MobileNav";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Reveal } from "@/components/ui/Reveal";
import { IconBadge } from "@/components/ui/IconBadge";
import { QuranAudioPlayer } from "@/components/worship/QuranAudioPlayer";
import { ReciterSelector } from "@/components/worship/ReciterSelector";
import { cn } from "@/lib/cn";
import { mockNavItems, mockUser } from "@/lib/mock-data";
import { CALCULATION_METHODS, MADHABS } from "@/lib/islamic/prayer-times";
import { useIslamicSettings } from "@/hooks/useIslamicSettings";
import type { IslamicSettings } from "@/lib/islamic/worship-progress";
import {
  ArrowLeft,
  MapPin,
  Bell,
  Sun,
  Moon,
  BookOpen,
  Globe,
  Layers,
  Headphones,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";

/**
 * Worship Settings Page
 * /worship/settings
 *
 * Tabs: Prayer | Adhkar | Quran
 * Uses centralized useIslamicSettings hook.
 * Calculation method now correctly uses .id (not .name) for the API.
 */
export const dynamic = "force-dynamic";

export default function WorshipSettingsPage() {
  const navItems = mockNavItems.map((item) =>
    item.href === "/worship"
      ? { ...item, active: true }
      : { ...item, active: false }
  );

  const { settings, updateSetting, updateSettings, resetSettings, isLoaded } =
    useIslamicSettings();
  const [activeTab, setActiveTab] = useState<"prayer" | "adhkar" | "quran">(
    "prayer"
  );

  const handleChange = <K extends keyof IslamicSettings>(
    key: K,
    value: IslamicSettings[K]
  ) => {
    updateSetting(key, value);
  };

  const tabs = ["prayer", "adhkar", "quran"] as const;
  const tabLabels = (value: "prayer" | "adhkar" | "quran") => {
    const labels = {
      prayer: "الصلاة",
      adhkar: "الأذكار",
      quran: "القرآن",
    };
    return labels[value];
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen bg-[#07091A]">
        <Sidebar items={navItems} user={mockUser} />
        <main className="flex-1 px-4 py-6 md:px-6 md:py-8 pb-[calc(4rem+env(safe-area-inset-bottom,0.5rem)] md:pb-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7C5CFF]"></div>
              <span className="ml-3 text-[#9AA0C0]">جاري تحميل الإعدادات...</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#07091A]">
      <Sidebar items={navItems} user={mockUser} />

      <main className="flex-1 px-4 py-6 md:px-6 md:py-8 pb-[calc(4rem+env(safe-area-inset-bottom,0.5rem)] md:pb-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {/* Header */}
          <Reveal index={0}>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  إعدادات العبادات
                </h1>
                <p className="text-[#9AA0C0] mt-1">
                  تخصيص مواقيت الصلاة والأذكار والقرآن
                </p>
              </div>
              <Link
                href="/worship"
                className="flex items-center gap-1 text-sm text-[#B69CFF] hover:text-[#7C5CFF] transition-colors"
              >
                <ArrowLeft size={18} aria-hidden />
                <span>عباداتي</span>
              </Link>
            </div>
          </Reveal>

          {/* Tabs */}
          <Reveal index={1}>
            <GlassCard className="p-4">
              <Tabs
                options={tabs}
                value={activeTab}
                onChange={setActiveTab}
                labelFor={tabLabels}
              />
            </GlassCard>
          </Reveal>

          {/* ── PRAYER SETTINGS ── */}
          {activeTab === "prayer" && (
            <>
              <Reveal index={2}>
                <GlassCard className="p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <IconBadge
                      icon={MapPin}
                      color="text-[#FB923C]"
                      bg="bg-[#FB923C]/15"
                      size={40}
                    />
                    <div>
                      <h3 className="text-lg font-bold text-white">الموقع</h3>
                      <p className="text-sm text-[#9AA0C0]">
                        تحديد الموقع لحساب مواقيت الصلاة الدقيقة
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[#C7CBE6] mb-2">
                        المدينة
                      </label>
                      <input
                        type="text"
                        value={settings.location?.city ?? ""}
                        onChange={(e) =>
                          handleChange("location", {
                            ...settings.location,
                            city: e.target.value,
                          })
                        }
                        className="w-full h-11 px-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9AA0C0] focus:outline-none focus:border-[#7C5CFF]/50 focus:bg-white/[0.06]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#C7CBE6] mb-2">
                          خط العرض
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={settings.latitude}
                          onChange={(e) =>
                            handleChange(
                              "latitude",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-full h-11 px-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9AA0C0] focus:outline-none focus:border-[#7C5CFF]/50 focus:bg-white/[0.06]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#C7CBE6] mb-2">
                          خط الطول
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={settings.longitude}
                          onChange={(e) =>
                            handleChange(
                              "longitude",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="w-full h-11 px-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9AA0C0] focus:outline-none focus:border-[#7C5CFF]/50 focus:bg-white/[0.06]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#C7CBE6] mb-2">
                        المنطقة الزمنية
                      </label>
                      <input
                        type="text"
                        value={settings.timezone}
                        onChange={(e) =>
                          handleChange("timezone", e.target.value)
                        }
                        className="w-full h-11 px-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-[#9AA0C0] focus:outline-none focus:border-[#7C5CFF]/50 focus:bg-white/[0.06]"
                      />
                    </div>
                  </div>
                </GlassCard>
              </Reveal>

              <Reveal index={3}>
                <GlassCard className="p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <IconBadge
                      icon={Layers}
                      color="text-[#7C5CFF]"
                      bg="bg-[#7C5CFF]/15"
                      size={40}
                    />
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        طريقة الحساب والمذهب
                      </h3>
                      <p className="text-sm text-[#9AA0C0]">
                        اختيار طريقة حساب مواقيت الصلاة والمذهب الفقهي
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[#C7CBE6] mb-2">
                        طريقة الحساب
                      </label>
                      <select
                        value={settings.calculationMethod}
                        onChange={(e) =>
                          handleChange("calculationMethod", e.target.value)
                        }
                        className="w-full h-11 px-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white focus:outline-none focus:border-[#7C5CFF]/50 focus:bg-white/[0.06] appearance-none"
                      >
                        {CALCULATION_METHODS.map((method) => (
                          <option
                            key={method.id}
                            value={method.id}
                            className="bg-[#0D1029]"
                          >
                            {method.name}
                          </option>
                        ))}
                      </select>
                      {/* FIXED: value is now method.id, not method.name */}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#C7CBE6] mb-2">
                        المذهب الفقهي
                      </label>
                      <select
                        value={settings.madhab}
                        onChange={(e) =>
                          handleChange(
                            "madhab",
                            e.target.value as "shafi" | "hanafi"
                          )
                        }
                        className="w-full h-11 px-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white focus:outline-none focus:border-[#7C5CFF]/50 focus:bg-white/[0.06] appearance-none"
                      >
                        {MADHABS.map((madhab) => (
                          <option
                            key={madhab.id}
                            value={madhab.id}
                            className="bg-[#0D1029]"
                          >
                            {madhab.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </GlassCard>
              </Reveal>

              <Reveal index={4}>
                <GlassCard className="p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <IconBadge
                      icon={Bell}
                      color="text-[#2DD4BF]"
                      bg="bg-[#2DD4BF]/15"
                      size={40}
                    />
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        الإشعارات والتنبيهات
                      </h3>
                      <p className="text-sm text-[#9AA0C0]">
                        إدارة تنبيهات الصلاة والأذان
                      </p>
                    </div>
                  </div>

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
                  </div>
                </GlassCard>
              </Reveal>
            </>
          )}

          {/* ── ADHKAR SETTINGS ── */}
          {activeTab === "adhkar" && (
            <Reveal index={2}>
              <GlassCard className="p-6 space-y-6">
                <div className="flex items-center gap-3">
                  <IconBadge
                    icon={Sun}
                    color="text-[#FB923C]"
                    bg="bg-[#FB923C]/15"
                    size={40}
                  />
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      تنبيهات الأذكار
                    </h3>
                    <p className="text-sm text-[#9AA0C0]">
                      تفعيل تذكيرات الأذكار اليومية
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
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
                </div>
              </GlassCard>
            </Reveal>
          )}

          {/* ── QURAN SETTINGS ── */}
          {activeTab === "quran" && (
            <>
              <Reveal index={2}>
                <GlassCard className="p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <IconBadge
                      icon={BookOpen}
                      color="text-[#2DD4BF]"
                      bg="bg-[#2DD4BF]/15"
                      size={40}
                    />
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        إعدادات القراءة
                      </h3>
                      <p className="text-sm text-[#9AA0C0]">
                        تخصيص الورد اليومي وتتبع التقدم
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[#C7CBE6] mb-2">
                        الهدف اليومي للقراءة: {settings.quranDailyTarget} آيات
                      </label>
                      <input
                        type="range"
                        min={5}
                        max={50}
                        step={5}
                        value={settings.quranDailyTarget}
                        onChange={(e) =>
                          handleChange(
                            "quranDailyTarget",
                            parseInt(e.target.value)
                          )
                        }
                        className="w-full h-2 bg-white/[0.06] rounded-full appearance-none accent-[#2DD4BF]"
                      />
                      <p className="text-xs text-[#9AA0C0] mt-1">
                        عدد الآيات المستهدف قراءتها يومياً
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </Reveal>

              <Reveal index={3}>
                <GlassCard className="p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <IconBadge
                      icon={Headphones}
                      color="text-[#7C5CFF]"
                      bg="bg-[#7C5CFF]/15"
                      size={40}
                    />
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        إعدادات الصوت
                      </h3>
                      <p className="text-sm text-[#9AA0C0]">
                        اختيار القارئ المفضل لتلاوة القرآن
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#C7CBE6] mb-2">
                      القارئ المفضل
                    </label>
                    <ReciterSelector />
                  </div>
                </GlassCard>
              </Reveal>
            </>
          )}

          {/* Reset Button */}
          <Reveal index={5}>
            <div className="flex gap-4">
              <Button
                variant="ghost"
                icon={RotateCcw}
                iconPosition="start"
                onClick={resetSettings}
                className="flex-1"
              >
                إعادة تعيين
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  // Settings are auto-saved via useIslamicSettings
                  window.location.href = "/worship";
                }}
              >
                العودة
              </Button>
            </div>
          </Reveal>
        </div>
      </main>

      {/* MobileNav */}
      <MobileNav />
      {/* Only show audio player if a track is playing — handled inside */}
      <QuranAudioPlayer />
    </div>
  );
}

/* ── Toggle Switch ── */

interface SettingToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
      <div className="flex-1">
        <p className="font-medium text-white">{label}</p>
        <p className="text-sm text-[#9AA0C0] mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors flex-shrink-0",
          checked ? "bg-[#7C5CFF]" : "bg-white/[0.1]"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}