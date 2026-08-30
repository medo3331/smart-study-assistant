#!/usr/bin/env python3
"""
ingest-source.py — Reusable pipeline to add ANY text source to knowledge_base.
License-safe: only use with open-license sources (OpenStax, Wikipedia, ministry PDFs).

Usage:
  python scripts/ingest-source.py <path-to-txt> <subject> <source_name>
  python scripts/ingest-source.py --wiki-title "TITLE" <subject> <source_name>

Examples (open-license only — verify before running):
  python scripts/ingest-source.py public/openstax-cs-intro.txt "هياكل البيانات" "OpenStax CS Intro"
  python scripts/ingest-source.py --wiki-title "كيمياء عضوية" "الكيمياء العضوية" "Wikipedia Arabic - كيمياء عضوية"

Outputs:
  - <filename>-insert.sql (ready SQL INSERT statements)
  - Uses full 1536-dim embeddings via OpenRouter (no truncation).
"""
import argparse, os, re, json, textwrap, time, sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

WIKI_API_URL = "https://ar.wikipedia.org/w/api.php"
WIKI_FILTER_SECTIONS = ["انظر أيضاً", "انظر أيضًا", "مراجع", "وصلات خارجية", "روابط خارجية"]

# ------------------------------------------------------------------
# Config / keys (same pattern as embed-chunks.py)
# ------------------------------------------------------------------
def _read_env(name):
    try:
        for line in open(".env.local", encoding="utf-8"):
            if line.startswith(name + "="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                return val
    except Exception:
        pass
    return os.environ.get(name, "")

OPENROUTER_KEY = _read_env("OPENROUTER_API_KEY") or os.environ.get("OPENROUTER_API_KEY", "")
API_KEY = OPENROUTER_KEY
API_URL = "https://openrouter.ai/api/v1/embeddings"
MODEL = "openai/text-embedding-3-small"  # 1536 dims, full (no truncation)
DIMS = 1536

if not API_KEY:
    sys.exit("ERROR: OPENROUTER_API_KEY not found in .env.local or env. Set it before ingesting.")

# ------------------------------------------------------------------
# Chunking logic (same concept as embed-chunks.py: split by headers,
# fallback to ~400-word windows if no clear headers)
# ------------------------------------------------------------------
HEADER_KEYWORDS = [
    "محاضرة", "مادة:", "مقدمة", "تعريف", "الدرجات", "التعقيد",
    "المفاضلة", "أخطاء", "خلاصة", "فصل", "باب", "قسم", "Section",
    "Chapter", "Intro", "Overview", "Definition", "Theorem", "Proof",
]


# ------------------------------------------------------------------
# Wikipedia fetch (official API; CC BY-SA / public domain — safe)
# ------------------------------------------------------------------
def fetch_wiki(title_text):
    params = {
        "action": "query",
        "prop": "extracts",
        "explaintext": "true",
        "exlimit": 1,
        "titles": title_text,
        "format": "json",
        
    }
    from urllib.parse import urlencode; url = WIKI_API_URL + "?" + urlencode(params)
    try:
        req = Request(url, headers={"User-Agent": "smart-study-assistant/1.0"});
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except (URLError, HTTPError, Exception) as e:
        sys.exit(f"ERROR: Wikipedia connection failed ({e}). Check internet / article title.")
    pages = data.get("query",{}).get("pages",{})
    for pid, p in pages.items():
        if p.get("missing"):
            sys.exit(f"ERROR: Wikipedia article '{title_text}' not found (missing page).")
        extract = p.get("extract", "").strip()
        if not extract:
            sys.exit(f"ERROR: Wikipedia article '{title_text}' returned empty extract.")
        lines = extract.splitlines()
        filtered = []
        for ln in lines:
            s = ln.strip()
            # Drop section-header lines that match the unhelpful sections (exact or with == markers)
            drop = False
            for bad in WIKI_FILTER_SECTIONS:
                if s == bad or s.startswith("== "+bad) or s.startswith("=== "+bad) or s.startswith("==== "+bad):
                    drop = True
                    break
            if drop:
                continue
            # Also drop lines that are just the bad names without markers (defensive)
            if s in ("انظر أيضاً", "انظر أيضًا", "مراجع", "وصلات خارجية", "روابط خارجية"):
                continue
            filtered.append(ln)
        clean_text = "\n".join(filtered)
        return clean_text
    sys.exit(f"ERROR: Wikipedia response had no page for '{title_text}'.")

def save_wiki_text(title_text, content):
    safe = "".join(c if c.isalnum() or c in (" ","-","_") else "_" for c in title_text).strip().strip("_")
    fname = f"public/wiki-{safe}.txt"
    open(fname, "w", encoding="utf-8").write(content)
    return fname

def split_text(text, max_words=450):
    lines = text.splitlines()
    # First pass: header-based split (same logic as embed-chunks.py)
    sections = []
    current = []
    current_header = None

    def flush():
        if current:
            content = "\n".join(current).strip()
            if len(content) > 30:
                sections.append({
                    "subject": current_header or "Untitled",
                    "header": current_header or "Section",
                    "content": content,
                })

    for ln in lines:
        stripped = ln.strip()
        is_header = (
            any(stripped.startswith(k) for k in HEADER_KEYWORDS)
            or (len(stripped) < 60 and stripped and not stripped.startswith("-")
                and not stripped.startswith("•") and not stripped.startswith("=")
                and not stripped[0].isdigit() and stripped[0].isalpha())
        )
        # Heuristic: if line is very short, standalone, looks like a title -> section break
        if is_header and (stripped.startswith("محاضرة") or stripped.startswith("مادة:")
                           or stripped in HEADER_KEYWORDS or (len(stripped) < 50 and stripped not in ("", "---"))):
            if current and current_header is not None:
                flush()
                current = []
            current_header = stripped if stripped else current_header
            current.append(stripped)
        else:
            current.append(ln)
    flush()

    # If no sections found (or very few), fall back to fixed-size windows
    sections = [s for s in sections if len(s["content"]) > 30]
    if len(sections) < 2:
        words = text.split()
        sections = []
        for i in range(0, len(words), max_words):
            chunk_words = words[i:i + max_words]
            chunk_text = " ".join(chunk_words)
            sections.append({
                "subject": "Untitled",
                "header": f"Window {len(sections)+1}",
                "content": chunk_text,
            })
    return sections

# ------------------------------------------------------------------
# Embedding via OpenRouter (full 1536, no truncation)
# ------------------------------------------------------------------
def embed_text(text):
    payload = json.dumps({"input": text, "model": MODEL, "encoding_format": "float"}).encode()
    req = Request(API_URL, data=payload,
                  headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
                  method="POST")
    try:
        with urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read())
            emb = data["data"][0]["embedding"]
            # Verify full dimension (no truncation/padding)
            if len(emb) != DIMS:
                print(f"  WARNING: embedding dims={len(emb)} (expected {DIMS}). Keeping as-is.")
            return emb
    except HTTPError as e:
        body = e.read().decode()[:400]
        print(f"  ERROR embedding (HTTP {e.code}): {body}")
        return [0.0] * DIMS  # zero-fill so SQL stays valid; user should retry
    except Exception as e:
        print(f"  ERROR embedding ({e})")
        return [0.0] * DIMS

# ------------------------------------------------------------------
# SQL generation (same column order / format as generate-insert.py)
# ------------------------------------------------------------------
def generate_sql(sections, subject, source_name, out_path):
    lines = []
    lines.append(f"-- Ingest: {source_name} | subject={subject}")
    lines.append("-- Source: open-license only (verify before use).")
    lines.append("BEGIN;")
    for s in sections:
        emb = s["embedding"]
        emb_str = "[" + ",".join(f"{v:.7f}" for v in emb) + "]"
        content_raw = s["content"]
        # Escape SQL single quotes; keep full content (no arbitrary truncation)
        content_esc = content_raw.replace("'", "''").replace("\\", "\\\\")
        # Keep full content (pipeline is meant to hold full chunks; trim only if >8000 chars for SQL line health)
        if len(content_esc) > 8000:
            content_esc = content_esc[:7990] + "...[truncated for SQL line limit]"
        sql = (f"INSERT INTO knowledge_base (content, source_name, source_page, subject, embedding) VALUES ("
               f"'{content_esc}', '{source_name.replace(chr(39), chr(39)+chr(39))}', '{s['header'].replace(chr(39),chr(39)+chr(39))}', '{subject.replace(chr(39),chr(39)+chr(39))}', '{emb_str}'::vector({DIMS}))")
        lines.append(sql + ";")
    lines.append("COMMIT;")
    open(out_path, "w", encoding="utf-8").write("\n".join(lines))
    print(f"Wrote SQL: {out_path} ({len(sections)} INSERTs)")

# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Ingest any txt source (or Wikipedia article) into knowledge_base SQL.")
    parser.add_argument("txt_path", nargs="?", default=None, help="Path to .txt file (required unless --wiki-title)")
    parser.add_argument("subject", help="Subject / material name, e.g. 'هياكل البيانات'")
    parser.add_argument("source_name", help="Source identifier, e.g. 'OpenStax CS Intro' or 'Wikipedia Arabic - ...'")
    parser.add_argument("--wiki-title", dest="wiki_title", default=None, help="Wikipedia Arabic article title (fetches automatically; skips manual txt_path)")
    args = parser.parse_args()
    if args.wiki_title is None and args.txt_path is None:
        parser.error("provide either txt_path or --wiki-title")

    if args.wiki_title:
        print("WIKI FETCH: title='" + args.wiki_title + "' (CC BY-SA / public domain — open license)")
        content = fetch_wiki(args.wiki_title)
        fname = save_wiki_text(args.wiki_title, content)
        args.txt_path = fname
        print("  Saved to:", fname, "| chars:", len(content))

    if not os.path.isfile(args.txt_path):
        sys.exit(f"ERROR: file not found: {args.txt_path}")

    # License reminder (the user insisted on this)
    print("=" * 60)
    print("LICENSE CHECK — only proceed if source is open-license:")
    print("  • OpenStax  • Wikipedia  • Ministry PDF (public)  • CC-BY / CC0  • Public domain")
    print("DO NOT use copyrighted educational sites (summaries, paid books, protected PDFs).")
    print("=" * 60)
    print(f"Reading {args.txt_path} ...")
    raw = open(args.txt_path, encoding="utf-8").read()

    print("Splitting into chunks ...")
    sections = split_text(raw)
    # Fix: OpenRouter text-embedding-3-small has ~8192 token limit (~6000-7000 words).
    # If a chunk is enormous, split it further to avoid HTTP 400.
    max_words = 600
    def split_large(s):
        words = s["content"].split()
        if len(words) <= max_words:
            return [s]
        parts = []
        for i in range(0, len(words), max_words):
            chunk_text = " ".join(words[i:i+max_words])
            parts.append({"subject": s["subject"], "header": s["header"] + f" (part {len(parts)+1})", "content": chunk_text})
        return parts
    expanded = []
    for s in sections:
        expanded.extend(split_large(s))
    sections = expanded
    if len(sections) > len([s for s in sections]):
        pass  # just keep expanded
    print(f"  Chunks: {len(sections)} (header-based split; fallback windows if <2)")

    print("Embedding via OpenRouter (openai/text-embedding-3-small, 1536 dims, no truncation) ...")
    for i, s in enumerate(sections):
        s["embedding"] = embed_text(s["content"])
        dims = len(s["embedding"])
        print(f"  [{i+1}/{len(sections)}] header={s['header'][:40]!r} dims={dims}")
        time.sleep(0.35)  # gentle rate limit

    base = args.txt_path
    if base.endswith(".txt"):
        base = base[:-4]
    out_sql = base + "-insert.sql"
    generate_sql(sections, args.subject, args.source_name, out_sql)
    print(f"\nDone. To load into DB:")
    print(f"  psql ... -f {out_sql}")

if __name__ == "__main__":
    main()
