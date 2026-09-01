#!/usr/bin/env python3
"""test-search.py — test match_knowledge query embedding (OpenRouter, full 1536)."""
import os, json, sys
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

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY") or _read_key("OPENROUTER_API_KEY")
API_KEY = OPENROUTER_KEY
API_URL = "https://openrouter.ai/api/v1/embeddings"
MODEL = "openai/text-embedding-3-small"
QUERY = "ايه هو Big O؟"

print("Query:", QUERY)
print("API:", API_URL, "| model:", MODEL)

payload = json.dumps({"input": QUERY, "model": MODEL, "encoding_format": "float"}).encode()
req = Request(API_URL, data=payload, headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}, method="POST")
try:
    resp = urlopen(req, timeout=30)
    data = json.loads(resp.read())
    embedding = data["data"][0]["embedding"]
    dims = len(embedding)
    print("Embedding dims:", dims, "(expected 1536)")
    # Build SQL string: array literal then cast
    arr_str = "[" + ",".join(str(v) for v in embedding) + "]"
    sql = f"SELECT * FROM match_knowledge('{arr_str}'::vector(1536), 3, NULL);"
    sql_path = "test-query.sql"
    open(sql_path, "w", encoding="utf-8").write(sql)
    print("\n--- SQL saved to:", sql_path, "(length chars:", len(sql), ") ---")
    print("\n--- Full SQL to copy-paste into Supabase SQL Editor ---")
    print(sql)
    # Verify dims from array string (count commas + 1)
    count = arr_str.count(",") + 1
    print("\n=== VERIFICATION ===")
    print("Array elements:", count, "| expected 1536 | match:", count == 1536)
except HTTPError as e:
    body = e.read().decode()
    print("ERROR", e.code, body[:200])
