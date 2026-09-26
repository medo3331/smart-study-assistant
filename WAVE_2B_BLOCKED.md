# Wave 2B — CLOSED AS BLOCKED (no code written)

**Status:** BLOCKED — deferred
**Date:** 2026-09-27
**Branch:** `feat/wave-2b-medical-hotspots` (documentation only, never merged)
**Base:** `origin/main` @ `058269f` (includes Wave 2A: `5cadbeb`, `04ce2cc`, `446e6b0`, `57ff660`)

---

## 1. Reason

Wave 2B was scoped as **Interactive Hotspots**: clickable points on an educational
medical image, each revealing an explanation tied to that exact region.

**There is no real data source for it anywhere in the system.** Neither of the two
required inputs exists:

- **No educational images** attached to lesson data.
- **No hotspot data** (coordinates + labels) in any form.

Per the project's standing rule — established in Wave 2A, where `uploadFile()` was
left as a visible placeholder because its `storage_path` stores nothing — the absence
of real data means showing a clear fallback, **never inventing data**. Inventing
anatomical coordinates or labels is explicitly out of bounds, as is using computer
vision or AI to derive them.

**Decision: Wave 2B is deferred, not implemented.**

---

## 2. Evidence — Discovery findings (zero results)

### 2.1 Image sources — none

| Check | Result |
|---|---|
| Image-like columns across all `db/*.sql` (searched `image`, `thumbnail`, `picture`, `photo`, `media`, `diagram`, `figure`, `hotspot`, `annotation`, `overlay`) | **0 matches** |
| `study_days` — columns actually used in app code | `id, config_id, user_id, day_number, title, topic, description, is_completed, xp_reward, learning_style, resource_links` — **no image column** |
| `curriculum_lessons` | `lesson_code, lesson_title, total/completed_lessons_in_unit, study_day_id` — no image |
| `university_subjects` | `name, name_en, code, type, source_url` — no image |
| `resource_links` | `{ title, url }[]` — plain links, not media; no image-extension filtering exists |
| `files` table | exists (via `app/api/upload`) — but `storage_path` is a **placeholder** and stores no bytes; `supabase.storage.from(...)` is **never called anywhere in the codebase** |
| `public/` assets | `sw.js`, `manifest.json`, brand assets only — no educational images |

The only image-producing code in the project is `components/ai/ImageGenerator.tsx`,
which **generates** images from a prompt. It does not read or serve educational
imagery. `DiagramGenerator` renders Mermaid SVG, not photographic content.

### 2.2 Hotspot data — none

Searched `hotspot`, `hotSpot`, `annotation`, `pin`, `marker`, `overlay`, `region`
across the codebase: **no data type, no table, no column, no seed, no coordinate
pairs, no x/y/percent fields, no labels-on-points** — and no prior example in any
existing report.

**The feature has no data foundation in this system at all.**

### 2.3 The YouTube thumbnail was considered and rejected

`VideoCandidate.thumbnail` (`https://img.youtube.com/vi/{id}/mqdefault.jpg`) is the
only image-like asset reachable from lesson data, and using it was evaluated and
**rejected** for two reasons:

1. **Geometrically wrong** — it is a 320×180 YouTube landscape still. Any hotspot
   placed on it would be meaningless on real anatomical or diagrammatic content.
2. **Rights** — annotating a third party's thumbnail with labels is a modification
   of someone else's copyrighted material.

### 2.4 Git situation (noted for the record)

`git checkout main` failed — `main` is checked out in another worktree
(`C:/Users/hp/.cline/worktrees/5f774/smart-study-assistant`). The subsequent
`git pull origin main` advanced the Wave 2A branch locally; it was restored with
`reset --hard origin/feat/wave-2a-medical-tools` after confirming those merge
commits already exist in `origin/main`. No work was lost. Wave 2B was branched
directly from `origin/main` to avoid the issue.

---

## 3. Decision — conditions to resume

Wave 2B may resume when **either** of these becomes available:

**(أ) A curated, properly-licensed image set**
Educational images collected **manually** from permissively-licensed sources
(e.g. OpenStax, Wikimedia Commons), each with its licence and source URL
recorded alongside it — plus human-verified hotspot coordinates and labels for
those specific images.

**(ب) A complete RAG / Sources structure**
A proper sources pipeline (separate project, its own scope and decisions).

Neither condition is met today.

---

## 4. Proposed next step

Return to Wave 2B once **either** source above exists. When resuming, the first
step should be re-running this discovery, not writing code — the data landscape
may have changed.

### Deliberately not done in this wave

The following were all ruled out and are recorded so a future wave does not
re-litigate them:

- **No placeholder UI shipped.** A "Hotspots" tab that can never render anything
  real would be a promise the product cannot keep — the same reasoning that
  produced Wave 2A's honest upload placeholder, applied in the stricter direction.
- **No invented coordinates or labels.** Explicitly forbidden.
- **No computer vision or AI** to extract points from an image. Explicitly forbidden.
- **No database migration.** Not justified while no source of truth exists.
- **No AI pipeline, no 3D/anatomy explorer, no image-based quiz** — those belong to
  later waves and remain out of scope.

### Wave 2A is unaffected

Wave 2A (`feat/wave-2a-medical-tools`, merged into `main` as `058269f`) is
**complete and untouched** by this closure. Its three tabs — Video, Upload, AI —
behave exactly as shipped and tested (34/34 regression cases, `tsc --noEmit` clean,
`next build` exit 0).
