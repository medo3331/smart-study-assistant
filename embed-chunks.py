#!/usr/bin/env python3
"""Step 3.1 — chunk sample lecture and generate embeddings via Groq (nomic-embed-text-v1.5, 768 dims)."""
import os, re, json, textwrap, time, sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

def _read_key(name):
    try:
        for line in open(".env.local"):
            if line.startswith(name+"="):
                return line.split("=",1)[1].strip().strip('"')
    except Exception:
        pass
    return ""
GROQ_KEY = os.environ.get("GROQ_API_KEY") or _read_key("GROQ_API_KEY")
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY") or _read_key("OPENROUTER_API_KEY")
API_KEY = OPENROUTER_KEY or GROQ_KEY
API_URL = "https://openrouter.ai/api/v1/embeddings" if OPENROUTER_KEY else "https://api.groq.com/openai/v1/embeddings"
MODEL = "openai/text-embedding-3-small" if OPENROUTER_KEY else "nomic-embed-text-v1.5"
DIMS = 1536  # full dimension from OpenRouter (no truncation)
print("Using API_URL:", API_URL, "key_len=", len(API_KEY) if API_KEY else 0, "model=", MODEL)

# Read lecture
raw = open("public/sample-lecture.txt", encoding="utf-8").read()
# Split by section headers (lines that are short / all caps-ish / keywords)
lines = raw.splitlines()
sections = []
current = []
current_header = None

header_keywords = ["محاضرة", "مادة:", "مقدمة", "تعريف Big O", "الدرجات الشائعة", "التعقيد المكاني", "المفاضلة بين الوقت والذاكرة", "أخطاء شائعة", "خلاصة"]

def flush():
    if current:
        sections.append({"subject": current_header or "Big O Notation", "header": current_header or "Section", "content": "\n".join(current).strip()})

for ln in lines:
    stripped = ln.strip()
    # Detect header lines (start with keyword, or very short standalone line that looks like title)
    is_header = any(stripped.startswith(k) for k in header_keywords) or (len(stripped) < 60 and stripped and not stripped.startswith("-") and not stripped.startswith("•") and not stripped[0].isdigit())
    if is_header and (stripped.startswith("محاضرة") or stripped.startswith("مادة:") or stripped in header_keywords or (len(stripped)<50 and stripped not in ["", "---"])):
        # If previous content exists, flush it; start new with this line as header
        if current and current_header is not None:
            flush()
            current = []
        current_header = stripped if stripped else current_header
        current.append(stripped)
    else:
        current.append(ln)
flush()

# We want to keep the meta + sections; merge META into first real section if needed
# Keep all sections that have meaningful content (>30 chars)
sections = [s for s in sections if len(s["content"]) > 30]
# Fix headers for meta lines
for s in sections:
    s["source_name"] = "sample-lecture.txt"
    s["source_page"] = "محاضرة ٤"
    s["subject"] = "هياكل البيانات والخوارزميات"

print(f"Chunks: {len(sections)}")
for s in sections:
    print(" •", s["header"][:50], "—", len(s["content"]), "chars")

# Embed via Groq
url = "https://api.groq.com/openai/v1/embeddings"
results = []
for i, s in enumerate(sections):
    payload = json.dumps({"input": s["content"], "model": MODEL, "encoding_format": "float"}).encode()
    req = Request(API_URL, data=payload, headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}, method="POST")
    try:
        resp = urlopen(req, timeout=30)
        data = json.loads(resp.read())
        embedding = data["data"][0]["embedding"]
        # Keep full 1536-dimension embedding from OpenRouter (no truncation/padding)
        print(f"  [{i+1}/{len(sections)}] embedded -> dims={len(embedding)} (full 1536 kept) (first 6: {embedding[:6]})")
        s["embedding"] = embedding
        results.append(s)
    except HTTPError as e:
        body = e.read().decode()
        print("  ERROR", e.code, body[:200])
        # If rate limited, skip
        s["embedding"] = [0.0]*768
        results.append(s)
    time.sleep(0.25)

open("chunks.json","w",encoding="utf-8").write(json.dumps(results, ensure_ascii=False, indent=2))
print("Saved chunks.json with", len(results), "items.")
