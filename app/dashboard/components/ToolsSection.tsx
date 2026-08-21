"use client";

import React from "react";
import type { ThemeStyles } from "./types";

// ============================================================
// 1) إعدادات التنبيهات
//    (بتتحط جوه القائمة الجانبية / الإعدادات في Sidebar.tsx)
//
// ⚠️ ٨ أغسطس: لوحة «أصوات التركيز» اللي كانت هنا (٦ أزرار ثابتة: مطر،
// بحر، غابة، لو-فاي، بيانو، ضوضاء بيضاء) اتشالت بالكامل واتبدلت بـ
// SoundLibrary.tsx — قرآن + موسيقى + صوتيات المستخدم.
//
// وفي نفس اليوم اتشال من هنا كمان `FloatingAudioPlayer` وراح
// `components/audio/` لما الصوت بقى على مستوى الموقع كله — هو مش أداة
// داشبورد. الملف ده بقى للتنبيهات وبس.
// ============================================================
interface NotificationToolsPanelProps {
  themeStyles: ThemeStyles;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  reminderTime: string;
  onChangeReminderTime: (value: string) => void;
  notifPermission: NotificationPermission | "unsupported";
  onEnableWebPush: () => void;
}

export function NotificationToolsPanel({
  themeStyles,
  notificationsEnabled,
  onToggleNotifications,
  reminderTime,
  onChangeReminderTime,
  notifPermission,
  onEnableWebPush,
}: NotificationToolsPanelProps) {
  return (
    <>
      {/* ---- تذكير السلسلة ----
           🗓️ ١٢ أغسطس: تاج «تذكير يومي» والفاصل اللي كانوا فوق اتشالوا —
           الدرج بقى أقسام مسمّاة وعنوان القسم بقى «التنبيهات» وبيقول
           الحالة (مقفولة / التذكير ٩:٠٠)، فالترويسة دي بقت تكرار. */}
      <div className="space-y-2.5">
        <div className="flex items-start justify-between bg-paper rounded-[var(--r-sm)] p-3 gap-3">
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-semibold text-ink">فكّرني أذاكر</p>
            <p className="text-[11px] text-ink-soft leading-relaxed">
              هننبّهك لو لسه ما ذاكرتش قبل ما السلسلة تنكسر. لازم المتصفح يكون مفتوح.
            </p>
          </div>

          {/* المفتاح: المقبض دايماً بلون الحبر — بيتقرا فوق الفسفوري وفوق
              الورق، في الليل والنهار. لو كان أبيض ثابت كان بيختفي في الليل. */}
          <button
            onClick={onToggleNotifications}
            role="switch"
            aria-checked={notificationsEnabled}
            aria-label="تفعيل التذكير اليومي"
            className={`w-11 h-6 rounded-full transition relative shrink-0 border ${
              notificationsEnabled
                ? `${themeStyles.accentBg} border-transparent`
                : "bg-paper-3 border-rule"
            }`}
          >
            <span
              className={`absolute top-[3px] w-4 h-4 bg-ink rounded-full transition-all ${
                notificationsEnabled ? "right-[3px]" : "left-[3px]"
              }`}
            />
          </button>
        </div>

        {notificationsEnabled && (
          <label className="flex items-center justify-between bg-paper rounded-[var(--r-sm)] p-3 gap-3">
            <span className="tag">موعد التذكير</span>
            <input
              type="time"
              value={reminderTime}
              onChange={(e) => onChangeReminderTime(e.target.value)}
              className="bg-paper-2 border border-rule rounded-[6px] px-2 py-1 text-sm text-ink font-mono"
            />
          </label>
        )}

        {notifPermission === "denied" && (
          <div className="notice notice-error text-[11px]">
            <p className="m-0">التنبيهات محظورة من إعدادات المتصفح — فعّلها من هناك الأول.</p>
          </div>
        )}
        {notifPermission === "unsupported" && (
          <p className="text-[11px] text-ink-soft">المتصفح ده مش بيدعم التنبيهات.</p>
        )}

        <button
          onClick={onEnableWebPush}
          className="w-full bg-paper hover:bg-paper-3 border border-rule text-ink-soft hover:text-ink text-xs font-semibold py-2.5 rounded-[var(--r-sm)] transition"
        >
          تنبيهات حتى لو التطبيق مقفول
          <span className="tag ms-2">تجريبي</span>
        </button>
      </div>
    </>
  );
}
