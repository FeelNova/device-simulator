#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This script must be run from Linux or WSL, not from Windows." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/cup-simulator"

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "Cannot find cup-simulator/package.json under: $SCRIPT_DIR" >&2
  exit 1
fi

cd "$APP_DIR"

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting Cup Simulator at http://localhost:3000"
exec npm run dev
