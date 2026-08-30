# Ingest-source pipeline — reusable for ANY open-license text source

> **License rule first (agreed 2026-08-30):** only use sources that are genuinely open-license — OpenStax (CC-BY), Wikipedia (CC BY-SA / public domain), ministry curriculum PDFs published freely, CC0, or public domain. Do NOT ingest from paid-summary sites, copyrighted books, or protected PDFs. If a site is unclear, ask before running.

## What this does (general — works for any txt file, any subject, any source name)

`scripts/ingest-source.py` takes a plain `.txt` file and turns it into `filename-insert.sql` — ready-to-run `INSERT` statements for `knowledge_base` (content + source_name + source_page + subject + 1536-dim embedding via OpenRouter `openai/text-embedding-3-small`, **no truncation**). It splits by section headers (same concept as `embed-chunks.py`) and falls back to ~450-word windows if no clear headers.

## Before you run — license check

Confirm the file came from an open source. Examples that are safe (verify the specific page/page PDF first):
- `https://openstax.org/` (books — check each book's license; usually CC BY)
- `https://ar.wikipedia.org/` / `https://en.wikipedia.org/` (CC BY-SA / public domain)
- Ministry of Education PDF links that say "للعامة مجاناً" / public curriculum
- Your own notes / public-domain texts

If you are unsure about a site name, say the URL here and I verify before you run.

## Requirements

- Python 3.11+ (repo root)
- `.env.local` with `OPENROUTER_API_KEY=...` (same key `embed-chunks.py` uses)
- The `.txt` file already saved in repo (e.g. `public/openstax-cs-intro.txt`, `public/ministry-math-2026.txt`, etc.)

## The exact command (copy/paste per new file)

From repo root (`C:\Desktop\smart-study-assistant` on this machine):

```bash
# Manual file (any open-license txt)
python scripts/ingest-source.py <path-to-txt> "<subject>" "<source_name>"
# Direct from Wikipedia Arabic (CC BY-SA)
python scripts/ingest-source.py --wiki-title "<article title>" "<subject>" "<source_name>"
```

**Real examples (replace with your actual file + verified-open source):**

```bash
# 1) OpenStax CS intro (only after confirming the specific OpenStax book is CC-BY)
python scripts/ingest-source.py public/openstax-cs-intro.txt "هياكل البيانات والخوارزميات" "OpenStax CS Intro"

# 2) Ministry of Education PDF extracted to txt (only if the PDF is public/free)
python scripts/ingest-source.py public/ministry-math-2026.txt "الرياضيات - الصف الثاني" "وزارة التعليم - مناهج 2026"

# 3) Wikipedia Arabic extract (CC BY-SA — safe)
python scripts/ingest-source.py public/wiki-ar-data-structures.txt "هياكل البيانات" "Wikipedia Arabic - Data Structures"
```

The script writes `<filename>-insert.sql` in the same folder as the txt. After it finishes:

```bash
# Load into Supabase (or local Postgres with pgvector)
psql $DATABASE_URL -f public/openstax-cs-intro-insert.sql
```


## New option: fetch directly from Wikipedia Arabic (CC BY-SA / public domain)

Instead of copying .txt manually, use `--wiki-title` to pull the article via the official API (`https://ar.wikipedia.org/w/api.php`), filter out non-useful sections (`انظر أيضاً`, `مراجع`, `وصلات خارجية`), save it to `public/`, then run the rest of the pipeline automatically.

```bash
# Example (verified open-license source — Wikipedia Arabic is CC BY-SA):
python scripts/ingest-source.py --wiki-title "كيمياء عضوية" "الكيمياء العضوية" "Wikipedia Arabic - كيمياء عضوية"
```

What happens:
1. Connects to Wikipedia API (real request; fails clearly if no internet / missing article).
2. Saves `public/wiki-<title>.txt` automatically (filename based on title).
3. Removes unhelpful sections (see filter list above).
4. Continues: chunking → embedding (1536 dims) → `<filename>-insert.sql`.

Requirements for `--wiki-title`: same as before (`.env.local` key, Python 3.11+). The old `txt_path` method stays fully working for PDF extracts, personal notes, OpenStax, etc.

## What the script prints

- License reminder (always, so you don't accidentally run on protected content)
- Chunk count (header-based, or window-based fallback)
- Per-chunk embedding size (`dims=1536` = good; `dims=768` or `dims=0` = rate-limit / error — retry)
- Final SQL path

If `dims=0` appears, that's the zero-fill fallback (HTTP error / rate limit). Re-run after a short wait; the SQL will be valid either way but a zero embedding won't match well.

## How chunking works (same idea as embed-chunks.py, generalized)

1. Read all lines.
2. Detect section headers by keywords (`محاضرة`, `مقدمة`, `تعريف`, `Chapter`, etc.) or very-short standalone lines.
3. If that yields <2 sections → fall back to ~450-word windows so nothing gets lost.
4. Each chunk gets embedded independently (full 1536 dims, `openai/text-embedding-3-small` via OpenRouter).

No content is hard-coded — `subject`, `source_name`, and chunk headers come from arguments / file, not from the script.

## Notes / troubleshooting

- The script is **general** — it doesn't know about Big O, math, or CS specifically. It just splits, embeds, writes SQL.
- Keep full chunk content (only trimmed if >8000 chars for SQL line length); embeddings are always full 1536.
- Rate limit: `time.sleep(0.35)` between chunks. For very large files with 50+ chunks, consider splitting into smaller txt files first.
- To verify embedding quality after run: `grep -o 'dims=[0-9]*' ...` or open the `.sql` and check the vector array length (`...::vector(1536)` with ~1536 numbers).

## File layout

```
scripts/ingest-source.py      # pipeline
README-ingest.md              # this file
public/                       # your open-license .txt sources (add, don't edit existing protected ones)
<filename>-insert.sql         # output per run
```

---
*Created 2026-08-30 — reusable pipeline, license-safe, full 1536-dim embeddings, no truncation.*
