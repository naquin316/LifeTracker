#!/usr/bin/env bash
#
# release.sh — publish LifeTracker changes live to lifetracker.handlane.dev.
#
# The app is a Home Assistant add-on that builds from GitHub `main`. Releasing =
# verify → bump the add-on version (busts the Docker cache) → commit → push.
# HA then rebuilds (auto if the add-on's "Auto update" is on, or via the UI).
#
# Usage:  scripts/release.sh "commit message"
#         scripts/release.sh "message" minor|major   (default: patch bump)

set -euo pipefail
cd "$(dirname "$0")/.."

MSG="${1:-Release}"
LEVEL="${2:-patch}"
CFG="lifetracker/config.yaml"

echo "==> Verifying (tsc · tests · build)…"
npx tsc --noEmit
npx vitest run
env -u NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY -u GOOGLE_MAPS_SERVER_KEY npm run build >/dev/null
echo "    ✓ verification passed"

echo "==> Bumping add-on version ($LEVEL)…"
CUR="$(grep -E '^version:' "$CFG" | sed -E 's/version:[[:space:]]*"?([^"]+)"?/\1/')"
IFS='.' read -r MAJ MIN PAT <<< "$CUR"
case "$LEVEL" in
  major) MAJ=$((MAJ+1)); MIN=0; PAT=0 ;;
  minor) MIN=$((MIN+1)); PAT=0 ;;
  *)     PAT=$((PAT+1)) ;;
esac
NEW="$MAJ.$MIN.$PAT"
sed -i '' -E "s/^version:.*/version: \"$NEW\"/" "$CFG"
echo "    $CUR -> $NEW"

echo "==> Commit + push…"
git add -A
git commit -m "$MSG (v$NEW)"
git push origin main

cat <<EOF

✅ Pushed v$NEW to GitHub (main).

To go live on https://lifetracker.handlane.dev:
  • If the add-on's "Auto update" is ON  → HA rebuilds automatically within its
    next check (you can force it: Add-ons → Store → ⋮ → Check for updates).
  • Otherwise → HA → Settings → Add-ons → Store → ⋮ → Check for updates →
    LifeTracker → Update  (rebuilds + restarts, ~2-4 min).
Then hard-refresh the browser (Cmd-Shift-R).

No rebuild needed for: geofences (in-app), Google keys (add-on Options → Restart),
or live positions (automatic).
EOF
