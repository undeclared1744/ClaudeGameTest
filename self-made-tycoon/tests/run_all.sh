#!/bin/sh
# Run every Self-Made Tycoon test against the built index.html.
# Set CHROME_PATH to use an installed Chrome instead of Playwright's own.
set -e
cd "$(dirname "$0")/.."
python3 build.py --check
for t in tests/play.py tests/business.py tests/scouting.py tests/look.py tests/runit.py tests/invest_host.py tests/invest_*.py tests/sim.py; do
  [ -f "$t" ] || continue
  case "$t" in tests/invest_host.py) [ "$seen_host" ] && continue; seen_host=1 ;; esac
  echo "== $t"
  python3 "$t" | grep -E "^FAIL|checks passed|page errors|^== " || true
done
