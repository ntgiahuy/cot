#!/usr/bin/env bash
# Replace DEST/docs with this repo's docs/, including hashed JS/CSS.
# Do NOT use `tar --exclude=assets` — that also drops docs/assets and blanks GitHub Pages.
set -euo pipefail
DEST="${1:?Usage: scripts/sync-pages-docs.sh /path/to/ntgiahuy/cot}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -f "$ROOT/docs/index.html" ]]; then
  echo "Missing $ROOT/docs/index.html — run npm run build first" >&2
  exit 1
fi
mkdir -p "$DEST"
rm -rf "$DEST/docs"
cp -a "$ROOT/docs" "$DEST/docs"
node "$ROOT/scripts/check-docs-assets.mjs" "$DEST/docs"
echo "Synced docs/ -> $DEST/docs"
