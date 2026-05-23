#!/usr/bin/env bash
# quick-validate.sh — root-level shim.
# Delegates to the canonical script inside the plugincraft skill. The shim
# exists so CI workflows reference a stable path that survives plugincraft
# restructuring (see Finding 15 / task #41). Run `--help` for usage.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../plugins/claudecraft/skills/plugincraft/scripts/quick-validate.sh" "$@"
