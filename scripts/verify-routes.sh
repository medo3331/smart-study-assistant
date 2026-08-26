#!/usr/bin/env bash
# PART 19 — route verification on the running dev server (fresh build).
for p in /dashboard /worship /worship/quran /worship/adhkar /worship/prayer-times /worship/settings /shop /rewards; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "http://localhost:3000$p")
  echo "$code $p"
done
