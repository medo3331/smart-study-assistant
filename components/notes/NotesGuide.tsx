"use client";

import React from "react";

/**
 * Notes guidance.
 *
 * Two audiences:
 *  • `library` — a student opening the notebook area for the first time needs
 *    to know what a "نوتة" is and that nothing is uploaded anywhere.
 *  • `editor`  — a student already drawing needs the shortcuts and the rules
 *    that keep their work from being lost.
 *
 * Rendered as a native <details>, so it works without JS, is keyboard
 * accessible and needs no state.
 */

type Variant = "library" | "editor";

export default function NotesGuide({
  variant,
  defaultOpen = false,
}: {
  variant: Variant;
  defaultOpen?: boolean;
}) {
  if (variant === "library") {
    return (
      <details className="notes-help" open={defaultOpen || undefined}>
        <summary>
          <span aria-hidden="true">💡</span>
          <span>إزاي تستخدم النوتة</span>
          <span className="notes-help-tag">دليل سريع</span>
        </summary>

        <ol className="notes-steps">
          <li>
            <strong>١. اعمل نوتة</strong> — اكتب اسم زي «تشريح — المحاضرة ٣» واضغط
            «نوتة جديدة». النوتة بتتفتح على أول صفحة جاهزة للرسم.
          </li>
          <li>
            <strong>٢. اختار القالب</strong> — مسطّر للملاحظات العادية، مربعات
            للرياضة والرسومات الهندسية، نقط للنوت القصيرة، وفاضي لو عايز حرية كاملة.
          </li>
          <li>
            <strong>٣. ارسم</strong> — بالقلم أو بالقلم اللوحي (stylus). سماكة الخط
            بتتغير حسب سرعة يدك، ولو قلمك بيدعم الضغط الخط بيبقى طبيعي أكتر.
          </li>
          <li>
            <strong>٤. زوّد صفحات</strong> — كل مادة أو محاضرة تقدر تبقى صفحة،
            وتتنقّل بينهم من شريط الصفحات تحت.
          </li>
          <li>
            <strong>٥. متقلقش على الشغل</strong> — الحفظ تلقائي بعد ما تسيب القلم،
            وكمان لما تقفل التبويب. النوتات متخزنة <em>على جهازك</em> (IndexedDB)
            ومش مرفوعة لأي سيرفر.
          </li>
          <li>
            <strong>٦. أشكال ونصوص وصور</strong> — أداة «تحديد» بتخليك تحرك أي عنصر،
            أدوات الأشكال بتترسم خط وسهم ومستطيل ودايرة (استخدم <kbd>Shift</kbd>
            للضبط)، أداة «نص» بتكتب عربي بخطوط وأحجام تختارها، وزر «صورة»
            بيدرج صورة تقدر تحركها وتحجمها، وتقدر كمان تسحبها أو تلزقها بـ <kbd>Ctrl</kbd>+<kbd>V</kbd>.
          </li>
          <li>
            <strong>٧. صدّر لما تحتاج</strong> — «تصدير PNG» بيحفظ الصفحة كصورة،
            و«تصدير PDF» بيخليك تختار صفحات معينة من النوتة ويطلعهم ملف PDF واحد
            تقدر تشاركه أو تطبعه.
          </li>
          <li>
            <strong>٨. اشتغل على PDF</strong> — زر «PDF» بيستورد ملف PDF ويخلي
            كل صفحة منه خلفية لصفحة نوته: تكتب وترسم وتظلل عليها بكل الأدوات.
          </li>
          <li>
            <strong>٩. استعن بالمساعد</strong> — زر ✨ بيفتح مساعد ذكاء اصطناعي
            جوه النوته: لخّص الصفحة، اعمل أسئلة مراجعة، أو اطلب شرح أبسط.
          </li>
          <li>
            <strong>١٠. ذاكر وانت بتكتب</strong> — من صفحة الدرس اضغط «📝 نوت
            جانبية» عشان النوتة تفتح في نص الشاشة جنب الدرس.
          </li>
        </ol>

        <p className="notes-help-note">
          ⚠️ النوتات مربوطة بالمتصفح والجهاز. لو مسحت بيانات الموقع أو غيّرت
          المتصفح، النوتات مش هتظهر — صدّر الصفحات المهمة كصور للاحتياط.
        </p>
      </details>
    );
  }

  return (
    <details className="notes-help" open={defaultOpen || undefined}>
      <summary>
        <span aria-hidden="true">⌨️</span>
        <span>الاختصارات ونصايح الرسم</span>
        <span className="notes-help-tag">مساعدة</span>
      </summary>

      <div className="notes-help-grid">
        <div>
          <h3 className="notes-help-h">الأدوات</h3>
          <ul className="notes-list">
            <li>
              <kbd>1</kbd> قلم — الخط الأساسي
            </li>
            <li>
              <kbd>2</kbd> حبر — أعرض وأثقل
            </li>
            <li>
              <kbd>3</kbd> رصاص — خفيف وباهت
            </li>
            <li>
              <kbd>4</kbd> تظليل — عريض وشفاف فوق الكلام
            </li>
            <li>
              <kbd>5</kbd> ممحاة — المس الخط نفسه عشان يتمسح
            </li>
            <li>
              <kbd>V</kbd> تحديد — حرك أو احجم أي عنصر، و<kbd>Delete</kbd> يمسحه
            </li>
            <li>
              <kbd>T</kbd> نص — دوس على الورقة واكتب، عربي واتجاهه يمين
            </li>
            <li>
              أشكال: خط · سهم · مستطيل · دايرة — اسحب من نقطة لنقطة
            </li>
            <li>
              صورة — زر الإدراج، أو اسحب الملف على الورقة، أو الصقه
            </li>
          </ul>
        </div>

        <div>
          <h3 className="notes-help-h">التحكم</h3>
          <ul className="notes-list">
            <li>
              <kbd>Ctrl</kbd>+<kbd>Z</kbd> تراجع · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+
              <kbd>Z</kbd> إعادة
            </li>
            <li>
              <kbd>Ctrl</kbd>+<kbd>S</kbd> حفظ فوري
            </li>
            <li>
              <kbd>Ctrl</kbd> + عجلة الماوس = تكبير عند المؤشر
            </li>
            <li>
              <kbd>مسافة</kbd> + سحب = تحريك الورقة
            </li>
            <li>
              <kbd>+</kbd> / <kbd>−</kbd> تكبير وتصغير
            </li>
          </ul>
        </div>

        <div>
          <h3 className="notes-help-h">نصايح</h3>
          <ul className="notes-list">
            <li>اكبر الشاشة أو زوّد التكبير لخط أدق.</li>
            <li>ارسم على مهل — الخط السميك بيطلع من السرعة البطيئة.</li>
            <li>استخدم صفحة لكل موضوع بدل صفحة طويلة واحدة.</li>
            <li>صدّر الصفحة كصورة قبل ما تمسح بيانات المتصفح.</li>
          </ul>
        </div>
      </div>
    </details>
  );
}
