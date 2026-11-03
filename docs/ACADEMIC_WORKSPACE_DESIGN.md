# Magicly Academic Workspace — Architecture & UX Design

> Read-only audit + design. No code, migrations, or schema changes in this document.

## 1. Existing architecture summary

- **Materials**: `public.materials` (user_id, title, file_type, file_size, content, summary, note, created_at). RLS owner-only. Used by dashboard workspace page. Content is extracted text (up to ~60k chars).
- **Lectures**: `public.lectures` (user_id, title, original_filename, source_type, status, transcript_text, transcript_data, created_at, ...). RLS owner-only. Stores full transcript + timestamped segments.
- **AI**: `/api/unified-ai` and `/api/chat`; Magicly brain builds student context from study_configs/study_days/ai_memories. Workspace Source Resolver (Batch 4D) resolves lectures/materials by NL.
- **Storage**: No object storage for files; text extracted and stored in DB. Lecture uploads use `lecture-uploads` bucket (transcription flow).

## 2. Existing tables and relationships

- `materials` ↔ `lectures`: none (independent).
- `study_configs`/`study_days`: course plans, separate from workspace.
- `ai_memories`: user preferences, not source-linked.

## 3. Recommended target schema (ER)

```
subjects (user_id, name, institution, program, term)
  └── lectures (subject_id nullable, user_id, ...)
        ├── materials (subject_id, lecture_id nullable)
        ├── lecture_questions (subject_id, lecture_id nullable, kind, payload)
        └── student_notes (subject_id, lecture_id nullable)
  └── materials (subject_id, lecture_id null)  -- general subject resources
  └── lecture_questions (subject_id, lecture_id null)
  └── student_notes (subject_id, lecture_id null)
```

- All new tables: `user_id` + RLS owner-only.
- FKs nullable for backward compatibility.
- Indexes: `(user_id, subject_id, created_at)`, `(user_id, lecture_id)`.

## 4. RLS/security design

- Reuse existing owner-only policy pattern.
- Every query filters by `user_id` explicitly (defense in depth).
- No cross-user joins exposing other users' data.
- Client never provides ownership proof.

## 5. UX specification

### A. Academic Workspace home
- Subject cards with name, institution/program, counts (lectures, materials, questions).
- Search across subjects.
- "Add subject" action.
- Empty state: prompt to create first subject.
- Legacy records appear under "Unorganized" pseudo-group (no subject_id) until student assigns.

### B. Subject details
- Tabs/sections: Lectures, Recordings, Questions, Resources.
- Upload into subject; optionally attach to lecture.
- Create lecture during upload.

### C. Lecture details
- Title, order index, status.
- Related slides/files, recordings+transcripts, questions.
- Ask Magic about this lecture (scoped context).

### D. Upload workflow
- Select subject (or create).
- Select type (Slides/Recording/Questions/Resource).
- Optionally select/create lecture.
- Recording → transcription flow (existing).
- Handle duplicates/failed uploads with clear status.

### E. Mobile/desktop
- Mobile: single-column, collapsible sections, bottom action bar.
- Desktop: sidebar subject list + main content.

## 6. Upload and recording workflow

- Reuse existing `/api/lecture-transcription/transcribe` and `/api/analyze-file`.
- Do not duplicate upload/transcription systems.
- Link records by IDs, not content copies.
- Recording keeps transcript + segments + timing in `lectures.transcript_data`.

## 7. Magic context integration

- When opened from subject/lecture, pass `subjectId`/`lectureId` to AI context.
- Resolver filters by subject when identified.
- Distinguish: single source vs lecture-all vs subject-all vs workspace-wide search.
- Never mix subjects; never claim reading unavailable sources.

## 8. Backward compatibility & migration plan

1. Create `subjects`.
2. Add nullable `subject_id` to `lectures`, `materials`.
3. Add nullable `lecture_id` to `materials`.
4. Create `lecture_questions`, `student_notes`.
5. Backfill: none automatic; legacy records remain ungrouped ("Unorganized").
6. Existing routes continue with null links.

## 9. Performance risks

- Avoid reading full transcripts in listing pages (select metadata only).
- Paginate subjects/lectures/materials.
- Bound retrieval (already 8k chars).
- Indexes on user_id + subject_id + created_at.
- Background transcription states (processing/failed).

## 10. Implementation batches

- **Batch A**: Audit (done by this doc).
- **Batch B**: Schema design review + migration draft (subjects + nullable FKs).
- **Batch C**: UX pages (subject list, subject detail, lecture detail) — read-only first.
- **Batch D**: Upload/attach workflow linking.
- **Batch E**: Magic context integration (subject/lecture scoping).
- **Batch F**: Search/retrieval within subject.

## 11. Open decisions requiring approval

1. Subject creation: manual vs auto-suggested from filenames?
2. Active subject per session vs explicit selection?
3. Questions stored per-lecture or per-subject primarily?
4. Should legacy ungrouped records be auto-grouped by title similarity (risky) or left manual?

---
*Stop: design only. No code or migration executed.*
## 12. Approved product decisions (binding)

### 12.1 User scope — all educational stages
- Supports basic, secondary, university, and future postgraduate.
- Single unified workspace; stage/curriculum/terminology are Subject (or profile) attributes, not separate schemas.
- Magic adapts explanation style and vocabulary by stage/subject.

### 12.2 Legacy content — "Unorganized Files" inbox
- All existing materials and lectures remain accessible and unchanged.
- Records with no subject_id appear in "Unorganized Files" (Inbox).
- No automatic assignment; Magic may suggest, student must confirm.
- Organizing preserves original content, storage object, ownership, history (link by ID only).

### 12.3 Schema implications
- `subjects` includes `stage` (basic|secondary|university|postgraduate) and `curriculum` (nullable).
- `lectures`/`materials` keep nullable `subject_id`/`lecture_id`; null = unorganized.
- Inbox query: `WHERE subject_id IS NULL` scoped by `user_id`.

### 12.4 UX implications
- Workspace home shows "Unorganized Files" section with count.
- Subject creation captures stage + curriculum + name.
- Upload flow allows "leave unorganized".
- Magic suggestions are confirmable chips, never auto-applied.

### 12.5 Acceptance criteria updates
- Legacy records visible in Inbox without data loss.
- No auto-assignment in any code path.
- Stage-aware prompts in Magic context.
- Explicit confirmation required for any subject/lecture linking.

