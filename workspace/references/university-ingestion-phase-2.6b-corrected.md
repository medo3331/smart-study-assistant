# Phase 2.6B Corrected Reference — Official CU Source (eng.cu.edu.eg) + Build Fix

Correction from Phase 2.6: In addition to CUFE-CCE-EN.pdf (chreg.eng.cu.edu.eg flyer), the official course map PDF `S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf` was fetched from `https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf` (official CU domain `eng.cu.edu.eg`). This PDF confirms exact course codes, names, credits, and semester mappings for Computer Engineering (CCE-C) track.

Verified first-year subjects from official PDF:
- L1 S1 (Fall): CHES001, GENS001, PHYS002, PHYS001, EMCS001, INTS005
- L1 S2 (Spring): GENS004 (and additional verified codes: MTHS002, CMPS102, CMPS103 — require full mapping confirmation before insertion)

Build fix lesson: `app/university/page.tsx` and `[subjectId]/page.tsx` require `"use client";` directive (Next.js 16 / App Router — `useRouter`/`useState` import into Server Component causes build failure). Fix applied: directive added. Build verified PASS.

Status: PASS WITH MISSING DATA — SQL file `PHASE_2_6B_INSERT_SQL.md` ready for admin SQL Editor execution (DB INSERT blocked by anon RLS); official source verified; build/TS PASS; no fabricated data; no Phase 2.7.

## Lesson Embedded: University Student Classification + Build Fix Workflow (Phase 2.6B)

When a user demands a university-level education classification split (e.g., "Student" → "School Student" / "University Student"), the working pattern is: audit first (DB taxonomy + RLS + existing subjects), source first (official verified PDF only), code second (only verified codes/names from source), build fix embedded (`"use client"` directive for Next.js 16 Server Components using useRouter/useState), dictionary keys for both languages, profile persistence via university fields (`university_id`, `faculty_id`, `department_id`, `academic_level_id`, `semester_id`), server-side validation of university taxonomy FK relations, no fabricated data, no Phase 2.7.
