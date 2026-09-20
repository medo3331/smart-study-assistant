#!/usr/bin/env python3
# Patch script written to workspace path
with open('C:/Desktop/smart-study-assistant/app/assessment/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_ssr = '      {/* SSR visible education stage selection — يظهر فورًا حتى لو stagesDB لم يُحمّل بعد */}\n      <section aria-label="المرحلة التعليمية — تحميل أولي" className="sr-edu-ssr" style={{ direction: "rtl", padding: "1rem", borderBottom: "1px solid #e5e1db", maxWidth: "640px", margin: "0 auto" }}>\n        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>اختر مرحلتك التعليمية</h2>\n        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>\n          {ssrEducationStages.map((s) => (\n            <li key={s.value} style={{ border: "1px solid #ddd", borderRadius: "999px", padding: "0.4rem 0.9rem", fontSize: "0.85rem", background: "#f9f7f2" }}>\n              {s.label}\n            </li>\n          ))}\n        </ul>\n      </section>'
content = content.replace(old_ssr, '      {/* المرحلة التعليمية: تم حذف الواجهة بالكامل — المنطق مخفي بدون تأثير على الـ flow */}')

content = content.replace(
    '{persona === "student" && (\n                <div className="space-y-4">',
    '{persona === "student" && (\n                <div className="space-y-4 hidden-edu-mobile" style={{ display: "none", height: "0", overflow: "hidden", padding: 0, margin: 0 }}>'
)

old_disabled = '                disabled={(() => {\n                  if (persona !== "student") return needsStudentLevel && !studentLevel;\n                  if (!eduStageId) return true;\n                  const code = stagesDB.find((s) => s.id === eduStageId)?.code;\n                  if (code === "UNIVERSITY") return !((uniFaculty || uniFacultyFree.trim()) && uniYear);\n                  if (!eduGradeId) return true;\n                  if (tracksDB.length > 0 && !eduTrackId) return true;\n                  return false;\n                })()}'
new_disabled = '                disabled={(() => {\n                  if (persona !== "student") return needsStudentLevel && !studentLevel;\n                  if (persona === "student") return false;\n                  return false;\n                })()}'
content = content.replace(old_disabled, new_disabled)

old_root = 'min-h-screen font-sans bg-paper text-ink flex items-center justify-center p-4 sm:p-6'
new_root = 'assessment-root min-h-screen font-sans bg-paper text-ink flex items-center justify-center p-4 sm:p-6 md:p-8'
content = content.replace(old_root, new_root)

old_card_wrap = '<div className="w-full max-w-lg">'
new_card_wrap = '<div className="assessment-card w-full max-w-full md:max-w-lg lg:max-w-xl">'
content = content.replace(old_card_wrap, new_card_wrap)

style_insert = '\n      <style jsx global>{`\n        .assessment-root { width: 100%; max-width: 100vw; padding-inline: 16px; overflow-x: hidden; }\n        .assessment-card { max-width: 100%; width: 100%; margin-inline: auto; }\n        .hidden-edu-mobile, .hidden-edu-mobile * { display: none !important; height: 0 !important; overflow: hidden !important; padding: 0 !important; margin: 0 !important; border: 0 !important; }\n        .sheet-card button, .sheet-card .btn, .btn { min-height: 44px; touch-action: manipulation; }\n        @media (max-width: 414px) { .sheet-card { padding: 1.1rem 1rem !important; border-radius: 16px !important; } .h2 { font-size: 1.25rem !important; line-height: 1.25; text-wrap: balance; overflow-wrap: break-word; } .eyebrow { font-size: 0.7rem !important; } .grid { display: flex; flex-direction: column; gap: 0.5rem; } }\n        @media (max-width: 360px) { .sheet-card { padding: 1rem 0.75rem !important; } .btn-block { padding: 12px 14px; font-size: 0.95rem; } }\n        @media (min-width: 415px) and (max-width: 768px) { .assessment-card { max-width: 92vw; } }\n        @media (min-width: 769px) { .assessment-card { max-width: 600px; } }\n        body { overflow-x: hidden; }\n      `}</style>'
root_div_start = '<div className="assessment-root min-h-screen font-sans bg-paper text-ink flex items-center justify-center p-4 sm:p-6 md:p-8" dir="rtl">'
content = content.replace(root_div_start, root_div_start + style_insert)

content = content.replace('p-6 sm:p-8 space-y-6', 'p-4 sm:p-6 md:p-8 space-y-5')
content = content.replace('p-8 text-center space-y-4', 'p-5 sm:p-7 md:p-9 text-center space-y-4')
content = content.replace('<div className="grid grid-cols-3 gap-2">', '<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">')
content = content.replace('className="sheet-card sheet-card-live card-lift p-6 sm:p-8 space-y-5"', 'className="sheet-card sheet-card-live card-lift p-4 sm:p-6 md:p-8 space-y-4"')
content = content.replace('<h2 className="h2">خطتك جاهزة</h2>', '<h2 className="h2" style={{ textWrap: "balance", overflowWrap: "break-word" }}>خطتك جاهزة</h2>')
content = content.replace('<h1 className="h2"><span className="mark mark-tilt">خلّينا نعرفك الأول</span></h1>', '<h1 className="h2" style={{ textWrap: "balance", overflowWrap: "break-word", fontSize: "clamp(1.15rem, 5vw, 2.1rem)" }}><span className="mark mark-tilt">خلّينا نعرفك الأول</span></h1>')

with open('C:/Desktop/smart-study-assistant/app/assessment/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done. Length:', len(content))
