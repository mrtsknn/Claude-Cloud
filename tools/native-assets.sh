#!/usr/bin/env bash
# Generates native icons/splash for one game WITHOUT losing files the tool clobbers:
# `capacitor-assets generate` deletes public/icon.svg and rewrites public/manifest.webmanifest.
# Usage: tools/native-assets.sh <game> <background color>
set -euo pipefail
game="$1"; bg="$2"; dir="games/$game"
tmp="$(mktemp -d)"
cp "$dir/public/icon.svg" "$dir/public/manifest.webmanifest" "$tmp/"
(cd "$dir" && npx capacitor-assets generate --iconBackgroundColor "$bg" --splashBackgroundColor "$bg")
cp "$tmp/icon.svg" "$tmp/manifest.webmanifest" "$dir/public/"
rm -rf "$dir/icons" "$tmp"
echo "native assets generated for $game; icon.svg and manifest preserved"
