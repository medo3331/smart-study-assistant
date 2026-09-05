# Phase 2.6B Corrected Reference — Official CU Source (eng.cu.edu.eg) + Build Fix

Correction from Phase 2.6: In addition to CUFE-CCE-EN.pdf (chreg.eng.cu.edu.eg flyer), the official course map PDF `S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf` was fetched from `https://eng.cu.edu.eg/wp-content/uploads/credituser/2015/S5_CUFE-2023-CCEc-REG2023-V1-WM.pdf` (official CU domain `eng.cu.edu.eg`). This PDF confirms exact course codes, names, credits, and semester mappings for Computer Engineering (CCE-C) track.

Verified first-year subjects from official PDF:
- L1 S1 (Fall): CHES001, GENS001, PHYS002, PHYS001, EMCS001, INTS005
- L1 S2 (Spring): GENS004 (and additional verified codes: MTHS002, CMPS102, CMPS103 — require full mapping confirmation before insertion)

Build fix lesson: `app/university/page.tsx` and `[subjectId]/page.tsx` require `"use client";` directive (Next.js 16 / App Router — `useRouter`/`useState` import into Server Component causes build failure). Fix applied: directive added. Build verified PASS.

Status: PASS WITH MISSING DATA — SQL file `PHASE_2_6B_INSERT_SQL.md` ready for admin SQL Editor execution (DB INSERT blocked by anon RLS); official source verified; build/TS PASS; no fabricated data; no Phase 2.7.
