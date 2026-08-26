#!/usr/bin/env bash
# Bundle-level verification: the running server must ship the NEW worship
# wiring (real Supabase identity, RPC calls, no mock user).
cd "/c/Desktop/smart-study-assistant" || exit 1
OUT="$LOCALAPPDATA/Temp/worship-verify"
mkdir -p "$OUT"

echo "=== 1. worship pages contain zero mockUser references ==="
for p in /worship /worship/adhkar /worship/quran /worship/prayer-times /worship/settings; do
  curl -s "http://localhost:3000$p" -o "$OUT/page.html"
  n=$(grep -c "ليلى أحمد" "$OUT/page.html" || true)
  echo "$p mock-name-hits: $n"
done

echo "=== 2. worship page SSR shell ==="
curl -s "http://localhost:3000/worship" -o "$OUT/worship.html"
grep -o "عباداتي اليوم" "$OUT/worship.html" | head -1

echo "=== 3. client chunks carry the new logic ==="
grep -rl "award_worship_coins" .next/static/chunks/ | head -3
echo "--- upsert_worship_progress ---"
grep -rl "upsert_worship_progress" .next/static/chunks/ | head -3
echo "--- worship_daily_summary ---"
grep -rl "worship_daily_summary" .next/static/chunks/ | head -3
echo "--- save_worship_settings ---"
grep -rl "save_worship_settings" .next/static/chunks/ | head -3

echo "=== 4. no hardcoded mock name in any shipped chunk ==="
grep -rl "ليلى أحمد" .next/static/chunks/ | head -5
echo "(empty above = clean)"
