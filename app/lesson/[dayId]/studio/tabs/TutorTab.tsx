"use client";

/** تاب Tutor — الشات بحجم كامل. الـ UnifiedChat نفسه بيتضاف هنا بالـ DOM
 *  من TutorChatHost (نفس المحادثة الواحدة بين الـ Panel والتاب — §4.1). */
export default function TutorTab() {
  return (
    <div dir="rtl">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-primary)]/70 overflow-hidden h-[75vh] lg:h-[calc(100dvh-16rem)]">
        {/* سلوتة التاب — TutorChatHost بينقل الشات هنا لما التاب ده يبقى نشط */}
        <div id="studio-tutor-tab-slot" className="h-full" />
      </div>
    </div>
  );
}
