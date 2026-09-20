with open('C:/Desktop/smart-study-assistant/app/assessment/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Restore disabled logic
old_disabled = '''                disabled={(() => {
                  if (persona !== "student") return needsStudentLevel && !studentLevel;
                  if (persona === "student") return false;
                  return false;
                })()}'''
new_disabled = '''                disabled={(() => {
                  if (persona !== "student") return needsStudentLevel && !studentLevel;
                  if (!eduStageId) return true;
                  const code = stagesDB.find((s) => s.id === eduStageId)?.code;
                  if (code === "UNIVERSITY") return !((uniFaculty || uniFacultyFree.trim()) && uniYear);
                  if (!eduGradeId) return true;
                  if (tracksDB.length > 0 && !eduTrackId) return true;
                  return false;
                })()}'''
content = content.replace(old_disabled, new_disabled)

# 2. Find the hidden-edu-mobile block start and replace through the button start
start_marker = '{persona === "student" && (\n                <div className="space-y-4 hidden-edu-mobile"'
start_idx = content.find(start_marker)
end_marker = '              <button\n                type="button"\n                onClick={() => setStep("subject")}'
end_idx = content.find(end_marker, start_idx)
new_block = '''              {persona === "student" && (
                <div className="space-y-4" dir="rtl">
                  <div>
                    <label htmlFor="edu-stage-select" className="field-label">المرحلة التعليمية</label>
                    <select
                      id="edu-stage-select"
                      value={eduStageId || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEduStageId(v || null);
                        setEduGradeId(null);
                        setEduTrackId(null);
                        setUniFaculty("");
                        setUniFacultyFree("");
                        setUniYear(null);
                        setSubjectsAuto([]);
                      }}
                      className="field text-sm w-full h-[48px] min-h-[44px] rounded-[var(--r-sm)] border border-rule-strong bg-paper text-ink px-3 py-2 focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink transition"
                      aria-required="true"
                    >
                      <option value="">اختر المرحلة…</option>
                      {stagesDB.map((s) => {
                        const label = locale === "ar"
                          ? (s.code === "PRIMARY" ? "ابتدائي" : s.code === "PREPARATORY" ? "إعدادي" : s.code === "SECONDARY" ? "ثانوي" : s.code === "BACCALAUREATE" ? "بكالوريا" : s.code === "UNIVERSITY" ? "جامعة" : s.name)
                          : (s.code === "PRIMARY" ? "Primary" : s.code === "PREPARATORY" ? "Preparatory" : s.code === "SECONDARY" ? "Secondary" : s.code === "BACCALAUREATE" ? "Baccalaureate" : s.code === "UNIVERSITY" ? "University" : s.name);
                        return <option key={s.id} value={s.id}>{label}</option>;
                      })}
                      {stagesDB.length === 0 && <option disabled>جارٍ التحميل…</option>}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edu-grade-select" className="field-label">الصف</label>
                    <select
                      id="edu-grade-select"
                      value={eduGradeId || ""}
                      disabled={!eduStageId || stagesDB.find((s) => s.id === eduStageId)?.code === "UNIVERSITY"}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEduGradeId(v || null);
                        setEduTrackId(null);
                        setSubjectsAuto([]);
                      }}
                      className="field text-sm w-full h-[48px] min-h-[44px] rounded-[var(--r-sm)] border border-rule-strong bg-paper text-ink px-3 py-2 focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink transition disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-required="true"
                      aria-disabled={!eduStageId || stagesDB.find((s) => s.id === eduStageId)?.code === "UNIVERSITY"}
                    >
                      <option value="">
                        {!eduStageId ? "اختر المرحلة أولاً" : stagesDB.find((s) => s.id === eduStageId)?.code === "UNIVERSITY" ? "لا يوجد صف ثابت للجامعة" : "اختر الصف…"}
                      </option>
                      {eduStageId && stagesDB.find((s) => s.id === eduStageId)?.code !== "UNIVERSITY" && gradesDB.map((g) => {
                        const label = locale === "ar"
                          ? (g.code === "P1" ? "الصف الأول" : g.code === "P2" ? "الصف الثاني" : g.code === "P3" ? "الصف الثالث" : g.code === "P4" ? "الصف الرابع" : g.code === "P5" ? "الصف الخامس" : g.code === "P6" ? "الصف السادس" : g.code === "PREP1" ? "الصف الأول الإعدادي" : g.code === "PREP2" ? "الصف الثاني الإعدادي" : g.code === "PREP3" ? "الصف الثالث الإعدادي" : g.code === "SEC_GEN_1" ? "الصف الأول الثانوي" : g.code === "SEC_GEN_2" ? "الصف الثاني الثانوي" : g.code === "SEC_GEN_3" ? "الصف الثالث الثانوي" : g.code === "BACC_1" ? "الصف الأول" : g.code === "BACC_2" ? "الصف الثاني" : g.code === "BACC_3" ? "الصف الثالث" : g.name)
                          : (g.code === "P1" ? "Grade 1" : g.code === "P2" ? "Grade 2" : g.code === "P3" ? "Grade 3" : g.code === "P4" ? "Grade 4" : g.code === "P5" ? "Grade 5" : g.code === "P6" ? "Grade 6" : g.code === "PREP1" ? "Preparatory Grade 1" : g.code === "PREP2" ? "Preparatory Grade 2" : g.code === "PREP3" ? "Preparatory Grade 3" : g.code === "SEC_GEN_1" ? "Secondary Grade 1" : g.code === "SEC_GEN_2" ? "Secondary Grade 2" : g.code === "SEC_GEN_3" ? "Secondary Grade 3" : g.code === "BACC_1" ? "Grade 1" : g.code === "BACC_2" ? "Grade 2" : g.code === "BACC_3" ? "Grade 3" : g.name);
                        return <option key={g.id} value={g.id}>{label}</option>;
                      })}
                    </select>
                  </div>
                  {eduStageId && stagesDB.find((s) => s.id === eduStageId)?.code === "UNIVERSITY" && (
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="uni-faculty-select" className="field-label">الكلية / التخصص</label>
                        <select
                          id="uni-faculty-select"
                          value={uniFaculty || ""}
                          onChange={(e) => { setUniFaculty(e.target.value || ""); setUniFacultyFree(""); }}
                          className="field text-sm w-full h-[48px] min-h-[44px] rounded-[var(--r-sm)] border border-rule-strong bg-paper text-ink px-3 py-2 focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink transition"
                        >
                          <option value="">اختر الكلية…</option>
                          {["الهندسة","الطب","الصيدلة","التجارة","الحقوق","الآداب","العلوم","الحاسبات والمعلومات","التربية","الإعلام"].map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                        <input
                          value={uniFacultyFree}
                          onChange={(e) => { setUniFacultyFree(e.target.value); if (e.target.value) setUniFaculty(""); }}
                          placeholder="لو مش موجودة — اكتب تخصصك"
                          className="field text-sm mt-2 w-full h-[44px] min-h-[44px] rounded-[var(--r-sm)] border border-rule-strong bg-paper text-ink px-3 py-2"
                        />
                      </div>
                      <div>
                        <label htmlFor="uni-year-select" className="field-label">الفرقة الدراسية</label>
                        <select
                          id="uni-year-select"
                          value={uniYear ?? ""}
                          onChange={(e) => setUniYear(e.target.value ? Number(e.target.value) : null)}
                          className="field text-sm w-full h-[48px] min-h-[44px] rounded-[var(--r-sm)] border border-rule-strong bg-paper text-ink px-3 py-2 focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink transition"
                        >
                          <option value="">اختر الفرقة…</option>
                          {[1,2,3,4,5].map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                      <p className="text-xs text-ink-soft">لا مواد ثابتة للجامعة — هتضيف مواد كل كورس بنفسك.</p>
                    </div>
                  )}
                  {eduStageId && eduGradeId && stagesDB.find((s) => s.id === eduStageId)?.code !== "UNIVERSITY" && tracksDB.length > 0 && (
                    <div>
                      <label htmlFor="edu-track-select" className="field-label">{locale === "ar" ? (stagesDB.find((s) => s.id === eduStageId)?.code === "SECONDARY" ? "الشعبة" : "المسار") : (stagesDB.find((s) => s.id === eduStageId)?.code === "SECONDARY" ? "Track" : "Path")}</label>
                      <select
                        id="edu-track-select"
                        value={eduTrackId || ""}
                        disabled={!eduGradeId}
                        onChange={(e) => setEduTrackId(e.target.value || null)}
                        className="field text-sm w-full h-[48px] min-h-[44px] rounded-[var(--r-sm)] border border-rule-strong bg-paper text-ink px-3 py-2 focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">اختر المسار / الشعبة…</option>
                        {tracksDB.map((t) => {
                          const lab = locale === "ar"
                            ? (t.code === "SEC_SCI" ? "علمي علوم" : t.code === "SEC_MATH" ? "علمي رياضة" : t.code === "SEC_LIT" ? "أدبي" : t.code.startsWith("MED") ? "طب وعلوم حياة" : t.code.startsWith("ENG") ? "هندسة وعلوم حاسب" : t.code.startsWith("BUS") ? "قطاع أعمال" : t.code.startsWith("HUM") ? "آداب وفنون" : t.name)
                            : (t.code === "SEC_SCI" ? "Science" : t.code === "SEC_MATH" ? "Math" : t.code === "SEC_LIT" ? "Literary" : t.name);
                          return <option key={t.id} value={t.id}>{lab}</option>;
                        })}
                      </select>
                    </div>
                  )}
                  {subjectsAuto.length > 0 && (
                    <div className="bg-paper border border-dashed border-rule rounded-[var(--r-sm)] p-3">
                      <p className="mono text-xs font-bold mb-2">📚 {locale === "ar" ? `موادك (${subjectsAuto.length}) — من قاعدة البيانات` : `Your subjects (${subjectsAuto.length}) — from DB`}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {subjectsAuto.map((s) => <span key={s} className="mono text-[11px] bg-paper-3 border border-rule px-2 py-1 rounded-full">{s}</span>)}
                      </div>
                      <p className="text-[11px] text-ink-soft mt-2">تُعدَّل من الـ SQL Editor — لا تحتاج تحديث كود.</p>
                    </div>
                  )}
                </div>
              )}'''
content = content[:start_idx] + new_block + content[end_idx:]

with open('C:/Desktop/smart-study-assistant/app/assessment/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done. File length:', len(content))
