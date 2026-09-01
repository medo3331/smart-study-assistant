#!/usr/bin/env python3
"""Generate insert SQL for chunks (with 1536-dim embeddings) from chunks.json."""
import json

chunks = json.load(open("chunks.json"))
lines = []
lines.append("-- Insert first source content (sample-lecture.txt chunks) into knowledge_base")
lines.append("-- Requires table knowledge_base (Step 2) to exist.")
lines.append("BEGIN;")
for c in chunks:
    emb_str = "[" + ",".join(f"{v:.7f}" for v in c["embedding"]) + "]"
    content_esc = c["content"].replace("'", "''").replace("\\", "\\\\")
    # Truncate very long content to avoid SQL length issues (keep ~800 chars for demo)
    content_short = content_esc[:800] + ("..." if len(content_esc) > 800 else "")
    sql = (f"INSERT INTO knowledge_base (content, source_name, source_page, subject, embedding) VALUES ("
           f"'{content_short}', '{c['source_name']}', '{c.get('source_page','')}', '{c['subject']}', '{emb_str}'::vector(1536))")
    lines.append(sql + ";")
lines.append("COMMIT;")
open("insert-chunks.sql","w",encoding="utf-8").write("\n".join(lines))
print("Wrote insert-chunks.sql with", len(chunks), "INSERT statements.")
# Show first line
print("First INSERT snippet:", lines[3][:200])
