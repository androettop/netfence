#!/usr/bin/env bash
# Builds the frontend and packages the plugin as out/NetFence.zip,
# the layout expected by Decky Loader's "Install from ZIP".
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="NetFence"
[ "${SKIP_BUILD:-0}" = "1" ] || pnpm run build

rm -rf out && mkdir -p "out/$NAME/dist"
cp plugin.json package.json main.py README.md LICENSE "out/$NAME/"
cp dist/index.js "out/$NAME/dist/"
(cd out && python3 -m zipfile -c "$NAME.zip" "$NAME")
echo "Packaged out/$NAME.zip"
