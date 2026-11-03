"use client";

import React, { useEffect, useId, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NotificationToolsPanel } from "./ToolsSection";
import { SoundLibrary } from "./SoundLibrary";
import { useTheme } from "@/theme/ThemeProvider";
import { useAudio } from "@/components/audio/AudioProvider";
import type { ThemeColor, ThemeStyles } from "./types";

/* ==========================================================================
   درج الإعدادات

   🗓️ ١٢ أغسطس: الدرج ده كان سكرول واحد طويل — التنقّل، بعده الإضاءة،
   بعده القلم، بعده المكتبة الصوتية، بعده التنبيهات. المشكلة اللي المستخدم
   قالها: «المميزات مش ظاهرة». المكتبة الصوتية والتنبيهات كانوا مدفونين
   تحت، فاللي مافتحش الدرج ونزل لآخره عمره ما عرف إنهم موجودين.

   الحل: أقسام مسمّاة مقفولة. أول ما تفتح الدرج بتشوف **الأربع أقسام كلها
   في شاشة واحدة** بأيقونة وعنوان وسطر بيقول القسم فيه إيه وحالته الحالية
   (نهار · قلم أصفر / سورة الكهف / التذكير ٩:٠٠). فالاكتشاف بقى بنظرة
   واحدة بدل سكرول.

   ⚠️ لوحات الأقسام **متركّبة دايماً** و`hidden` هي اللي بتخفي. سببين:
   (١) `aria-controls` لازم يلاقي عنصر موجود وإلا الرابط بينكسر لقارئ
   الشاشة، (٢) الحالة اللي جوه اللوحة (القارئ المختار والبحث في المكتبة
   الصوتية) بتعيش لما تقفل القسم وتفتحه تاني — لو التركيب شرطي كان اختيارك
   بيضيع مع كل قفلة.
   ========================================================================== */

/** أقسام الدرج. الداشبورد بتستعمل النوع ده عشان تفتح الدرج على قسم بعينه
    (كارت القرآن بيفتحه على «الصوت»). */
export type SettingsSectionId = "plan" | "look" | "sound" | "notif";

interface SidebarProps {
  // فتح/قفل الدرج الجانبي
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;

  // تعديل اسم المادة (المودال المرتبط بالسايدبار)
  showSubjectModal: boolean;
  setShowSubjectModal: (show: boolean) => void;
  newSubjectInput: string;
  setNewSubjectInput: (value: string) => void;
  isChangingSubject: boolean;
  handleSubjectChange: () => void;

  // الثيم
  theme: ThemeColor;
  setTheme: (theme: ThemeColor) => void;
  themeStyles: ThemeStyles;

  // ⚠️ مفيش بروبس صوت هنا. المكتبة بتقرا من `useAudio()` مباشرة لأن
  // المشغّل بقى في app/layout.tsx عشان الصوت ما يفصلش مع التنقّل.
  // والدرج نفسه بيقرا التراك الشغّال عشان يكتبه في سطر القسم.

  // التنبيهات
  notificationsEnabled: boolean;
  handleToggleNotifications: () => void;
  reminderTime: string;
  setReminderTime: (time: string) => void;
  notifPermission: NotificationPermission | "unsupported";
  handleEnableWebPush: () => void;

  // التنقل
  onNavigateHome: () => void;

  /** يتفتح على القسم ده أول ما الدرج يفتح. بيتبعت من كارت القرآن في
      الداشبورد («كل السور والقرّاء» → قسم الصوت). */
  focusSection?: SettingsSectionId | null;
}

// 🖍️ الأربع ألوان دي هي أقلام الفسفوري المتاحة. الأسماء الإنجليزية
// (amber/emerald/...) متسيبة زي ما هي لأنها محفوظة في قاعدة البيانات.
const PENS: { id: ThemeColor; name: string; swatch: string }[] = [
  { id: "amber", name: "أصفر", swatch: "bg-amber-500" },
  { id: "emerald", name: "أخضر", swatch: "bg-emerald-500" },
  { id: "coral", name: "كورال", swatch: "bg-[#DC4C4C]" },
  { id: "cyan", name: "أزرق", swatch: "bg-cyan-500" },
];

/* ⚠️ سلّم الورق: `paper-2` هو الأفتح (سطح الورقة) و`paper` أغمق شوية
   (حتة غايرة) و`paper-3` أغمق (تمرير الماوس). فالدرج نفسه `paper-2`،
   وكل عنصر تحكّم جواه `paper` عشان يبان غاير. كروت الأقسام الجديدة
   بتاخد `paper-2` — نفس سطح الدرج بحدّ حواليه — عشان العناصر اللي
   جواها تفضل غايرة زي ما هي. لو الكارت بقى `paper` كانت الصفوف اللي
   جوه المكتبة الصوتية والتنبيهات هتختفي فيه (نفس اللون بالظبط). */
const NAV_BTN =
  "w-full bg-paper hover:bg-paper-3 border border-rule text-ink p-3 rounded-[var(--r-sm)] text-sm font-semibold transition flex items-center justify-between gap-3 text-right";

/** ترتيب الأقسام في الدرج. السطر التعريفي (`hint`) بيظهر لما مفيش حالة
    فعلية تتكتب — هو اللي بيخلي القسم مفهوم وهو مقفول. */
const SECTIONS: {
  id: SettingsSectionId;
  label: string;
  icon: string;
  hint: string;
}[] = [
  { id: "plan", label: "الخطة والمادة", icon: "📚", hint: "عدّل اسم المادة أو ابدأ خطة جديدة" },
  { id: "look", label: "الشكل والإضاءة", icon: "🎨", hint: "ليل ونهار وأربع أقلام تعليم" },
  { id: "sound", label: "المكتبة الصوتية", icon: "🎧", hint: "قرآن وموسيقى وصوتياتك" },
  { id: "notif", label: "التنبيهات", icon: "🔔", hint: "تذكير يومي قبل السلسلة تنكسر" },
];

export function Sidebar({
  isMenuOpen,
  setIsMenuOpen,
  showSubjectModal,
  setShowSubjectModal,
  newSubjectInput,
  setNewSubjectInput,
  isChangingSubject,
  handleSubjectChange,
  theme,
  setTheme,
  themeStyles,
  notificationsEnabled,
  handleToggleNotifications,
  reminderTime,
  setReminderTime,
  notifPermission,
  handleEnableWebPush,
  onNavigateHome,
  focusSection = null,
}: SidebarProps) {
  // الداشبورد كان بيورّث الليل/النهار من اللاندينج من غير أي طريقة يغيّره
  // من جوه. الدرج ده أنسب مكان للمفتاح.
  const { theme: mode, toggle: toggleMode } = useTheme();

  // التراك الشغّال بيتقرا هنا للسطر التعريفي بس. التحكّم كله جوه
  // `SoundLibrary` وفي المشغّل العائم.
  const { activeTrack, isPlaying } = useAudio();

  // 🗒️ الحالة عايشة في الكومبوننت ده مش جوه الدرج، فاختيارك للأقسام
  // المفتوحة بيفضل لو قفلت الدرج وفتحته تاني في نفس الجلسة. (المحتوى
  // نفسه بيتشال لأنه جوه AnimatePresence، وده مقصود.)
  const [openSections, setOpenSections] = useState<SettingsSectionId[]>([]);

  const uid = useId();
  const panelId = (id: SettingsSectionId) => `${uid}-settings-${id}`;

  // فتح موجّه: كارت القرآن بيقول «افتح على الصوت». بنزوّد مش بنستبدل،
  // عشان لو المستخدم كان سايب قسم تاني مفتوح ما نقفلوش في وشه.
  useEffect(() => {
    if (!isMenuOpen || !focusSection) return;
    setOpenSections((prev) => (prev.includes(focusSection) ? prev : [...prev, focusSection]));
  }, [isMenuOpen, focusSection]);

  const toggleSection = (id: SettingsSectionId) =>
    setOpenSections((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const penName = PENS.find((p) => p.id === theme)?.name ?? "";

  /** السطر تحت عنوان القسم: الحالة الحقيقية لو فيها معلومة، وإلا التعريف.
      ده بيت القصيد من التنظيم — القسم المقفول بيقول إيه جواه وإيه شغّال. */
  const sectionStatus = (id: SettingsSectionId): string | null => {
    switch (id) {
      case "look":
        return `${mode === "dark" ? "ليل" : "نهار"} · قلم ${penName}`;
      case "sound":
        return activeTrack ? `${isPlaying ? "بيشتغل" : "متوقف"}: ${activeTrack.name}` : null;
      case "notif":
        return notificationsEnabled ? `التذكير ${reminderTime}` : "مقفولة";
      default:
        return null;
    }
  };

  /** نقطة خضرا = القسم ده فيه حاجة شغّالة دلوقتي. مع النص المخفي لأن
      اللون لوحده مش معلومة لقارئ الشاشة ولا لحد مش شايف الفرق. */
  const sectionLive = (id: SettingsSectionId): string | null => {
    if (id === "sound" && isPlaying) return "فيه صوت شغّال";
    if (id === "notif" && notificationsEnabled) return "التذكير مفعّل";
    return null;
  };

  const sectionBody = (id: SettingsSectionId) => {
    switch (id) {
      case "plan":
        return (
          <div className="space-y-2">
            <button onClick={() => setShowSubjectModal(true)} className={NAV_BTN}>
              <span>تعديل اسم المادة</span>
              <span className="mono text-ink-soft">←</span>
            </button>
            <button onClick={onNavigateHome} className={NAV_BTN}>
              <span>الرجوع للرئيسية</span>
              <span className="mono text-ink-soft">←</span>
            </button>
          </div>
        );

      case "look":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="tag">الإضاءة</p>
              <div className="flex gap-1 bg-paper p-1 rounded-[var(--r-sm)] border border-rule">
                {(
                  [
                    { id: "light", label: "نهار" },
                    { id: "dark", label: "ليل" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (mode !== m.id) toggleMode();
                    }}
                    aria-pressed={mode === m.id}
                    className={`mono flex-1 px-3 py-2 rounded-[6px] transition ${
                      mode === m.id ? "bg-ink text-paper-2" : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="tag">قلم التعليم</p>
              <div className="grid grid-cols-4 gap-2">
                {PENS.map((pen) => (
                  <button
                    key={pen.id}
                    onClick={() => setTheme(pen.id)}
                    aria-pressed={theme === pen.id}
                    className={`p-2 rounded-[var(--r-sm)] border transition flex flex-col items-center gap-2 ${
                      theme === pen.id
                        ? "border-ink bg-paper-3"
                        : "border-rule bg-paper hover:border-rule-strong"
                    }`}
                  >
                    {/* الضربة نفسها هي العيّنة — مستطيل زي أثر القلم، مش دايرة */}
                    <span
                      className={`w-full h-3 rounded-[2px] ${pen.swatch}`}
                      style={{ transform: "rotate(-1.5deg)" }}
                    />
                    <span className={`mono ${theme === pen.id ? "text-ink" : "text-ink-soft"}`}>
                      {pen.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case "sound":
        // 🎧 قرآن + موسيقى + صوتيات المستخدم. عنوان القسم بقى هو عنوانها،
        // فالمكتبة مابقاش عندها ترويسة من جوه.
        return <SoundLibrary themeStyles={themeStyles} />;

      case "notif":
        return (
          <NotificationToolsPanel
            themeStyles={themeStyles}
            notificationsEnabled={notificationsEnabled}
            onToggleNotifications={handleToggleNotifications}
            reminderTime={reminderTime}
            onChangeReminderTime={setReminderTime}
            notifPermission={notifPermission}
            onEnableWebPush={handleEnableWebPush}
          />
        );
    }
  };

  return (
    <>
      <AnimatePresence>
        {isMenuOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-ink/45 backdrop-blur-sm">
            <motion.div
              key="side-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-paper-2 border-s-[3px] border-s-redpen w-full max-w-xs sm:max-w-sm h-full p-6 flex flex-col justify-between overflow-y-auto"
            >
              <div className="space-y-5">
                <div className="flex items-start justify-between border-b border-rule pb-4">
                  <div>
                    <p className="eyebrow eyebrow-flush mb-1.5">الإعدادات</p>
                    <h3 className="h3">كل الأدوات</h3>
                  </div>
                  <button
                    onClick={() => setIsMenuOpen(false)}
                    aria-label="إغلاق"
                    className="mono text-ink-soft hover:text-ink px-2 py-1 rounded-[var(--r-sm)] hover:bg-paper-3 transition"
                  >
                    ✕
                  </button>
                </div>

                {/* الزرار الأساسي فوق الأقسام وباين دايماً — هو أهم حاجة في
                    الدرج، فمالوش لازمة يستنى ضغطة على قسم عشان يظهر. */}
                <button onClick={onNavigateHome} className="btn btn-marker btn-block text-sm">
                  أضف مادة أو هدف جديد
                </button>

                {/* ---- الأقسام ---- */}
                <div className="space-y-2">
                  {SECTIONS.map((section) => {
                    const open = openSections.includes(section.id);
                    const status = sectionStatus(section.id);
                    const live = sectionLive(section.id);

                    return (
                      <div
                        key={section.id}
                        className={`rounded-[var(--r-sm)] border bg-paper-2 transition ${
                          open ? "border-rule-strong" : "border-rule"
                        }`}
                      >
                        {/* عنوان حقيقي (h4) جوه زرار: كده الدرج بيبقى
                            متنقّل بالعناوين في قارئ الشاشة، وده نفس هدف
                            التنظيم — تعرف فيه إيه من غير ما تقرا كله. */}
                        <h4 className="m-0">
                          <button
                            type="button"
                            onClick={() => toggleSection(section.id)}
                            aria-expanded={open}
                            aria-controls={panelId(section.id)}
                            className="w-full flex items-center gap-3 p-3 text-right hover:bg-paper-3 rounded-[var(--r-sm)] transition"
                          >
                            <span aria-hidden className="text-base leading-none shrink-0">
                              {section.icon}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-bold text-ink">{section.label}</span>
                              <span className="block mono text-ink-soft truncate normal-case">
                                {status ?? section.hint}
                              </span>
                            </span>
                            {live && (
                              <>
                                <span
                                  aria-hidden
                                  className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
                                />
                                <span className="sr-only">{live}</span>
                              </>
                            )}
                            <span aria-hidden className="mono text-ink-soft shrink-0">
                              {open ? "▾" : "▸"}
                            </span>
                          </button>
                        </h4>

                        <div
                          id={panelId(section.id)}
                          hidden={!open}
                          className="px-3 pb-3 pt-3 border-t border-rule"
                        >
                          {sectionBody(section.id)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="tag justify-center pt-6 mt-6 border-t border-rule">
                منصة إدارة الأهداف والمهام
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4">
          <div className="sheet-card card-lift p-6 w-full max-w-md space-y-4">
            <div>
              <p className="eyebrow eyebrow-flush mb-1.5">تعديل</p>
              <h3 className="h3">اسم المادة أو الهدف</h3>
            </div>
            <input
              type="text"
              value={newSubjectInput}
              onChange={(e) => setNewSubjectInput(e.target.value)}
              className="field"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSubjectModal(false)}
                disabled={isChangingSubject}
                className="btn btn-quiet text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={handleSubjectChange}
                disabled={isChangingSubject}
                className="btn btn-marker text-sm"
              >
                {isChangingSubject ? "بيحفظ…" : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
