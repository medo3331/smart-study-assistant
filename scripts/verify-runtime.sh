#!/usr/bin/env bash
# Final runtime verification for the worship→coins task.
cd "$HOME" || exit 1
for p in /worship /worship/quran /worship/adhkar /worship/prayer-times /worship/settings /shop /rewards; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "http://localhost:3000$p")
  echo "$code $p"
done
echo "--- worship SSR shell: mock-free + reward hint present ---"
curl -s --max-time 60 -o w6.html http://localhost:3000/worship
echo "mock-name hits: $(grep -c 'ليلى أحمد' w6.html || true)"
grep -o 'الصلاة +' w6.html | head -1
rm -f w6.html
echo "--- shipped chunks call the EXISTING economy RPC only ---"
cd "/c/Desktop/smart-study-assistant"
echo "award_coins refs:      $(grep -rl 'award_coins' .next/static/chunks/ | wc -l) chunk files"
echo "old wrapper remnants:  $(grep -rl 'award_worship_coins' .next/static/chunks/ | wc -l) chunk files (must be 0)"
