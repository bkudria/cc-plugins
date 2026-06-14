#!/usr/bin/env bash
# Tests the SKILL_DIR fallback resolution.
#
# When CLAUDE_SKILL_DIR is unset, the runner (and the linter it shells out to)
# must resolve its profiles/ directory under ${CLAUDE_PLUGIN_ROOT}/skills/standards
# — the plugin install layout. This pins the plugin-relative default so the audit
# works once installed as a plugin, not just under the legacy ~/.claude path.
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_SKILL_DIR="$(cd "$TEST_DIR/.." && pwd)"
RUNNER="$REAL_SKILL_DIR/scripts/run-audit.sh"

# shellcheck source=lib.sh
source "$TEST_DIR/lib.sh"

echo "test-skill-dir-default.sh"

# --- Build a fake plugin root with a tiny standards skill + probe profile -----
PLUGIN_ROOT=$(mktemp -d)
trap 'rm -rf "$PLUGIN_ROOT"' EXIT
mkdir -p "$PLUGIN_ROOT/skills/standards/profiles/probe"
cat > "$PLUGIN_ROOT/skills/standards/profiles/probe/marker.yaml" <<'EOF'
required: true
description: "Probe standard used to verify CLAUDE_PLUGIN_ROOT path resolution."
check:
  script: |
    cd "$PROJECT_ROOT"
    exit 0
EOF

# --- A project selecting that profile ----------------------------------------
proj=$(mktemp -d)
state=$(mktemp -d)
trap 'rm -rf "$PLUGIN_ROOT" "$proj" "$state"' EXIT
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF

# Run with CLAUDE_SKILL_DIR explicitly unset so the fallback is exercised, and
# CLAUDE_PLUGIN_ROOT pointing at the fake plugin root.
rc=0
env -u CLAUDE_SKILL_DIR CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" \
  "$RUNNER" --collect "$proj" "$state" --scope required >/dev/null 2>&1 || rc=$?
assert_exit_code "collect resolves profiles under \${CLAUDE_PLUGIN_ROOT}/skills/standards" 0 "$rc"

if [[ -f "$state/collect-required.json" ]]; then
  ids=$(jq -r '.resolved[].id' "$state/collect-required.json" 2>/dev/null | tr '\n' ' ')
  assert_contains "probe/marker standard collected via fallback path" "probe/marker" "$ids"
else
  assert_contains "collect-required.json written via fallback path" "collect-required.json" "missing"
fi

# --- Both CLAUDE_SKILL_DIR and CLAUDE_PLUGIN_ROOT unset → actionable error ----
# With both vars unset, SKILL_DIR collapses to the bare /skills/standards (which
# does not exist), so collect cannot find the profile. It must fail AND name the
# unset env var + the resolved looked-in path — not a cryptic "profile not found:
# probe" that reads like a path bug.
state2=$(mktemp -d)
trap 'rm -rf "$PLUGIN_ROOT" "$proj" "$state" "$state2"' EXIT
rc=0
err=$(env -u CLAUDE_SKILL_DIR -u CLAUDE_PLUGIN_ROOT \
  "$RUNNER" --collect "$proj" "$state2" --scope required 2>&1 >/dev/null) || rc=$?
assert_exit_code "collect fails when both skill-dir vars are unset" 1 "$rc"
assert_contains  "error names CLAUDE_PLUGIN_ROOT when both vars unset" "CLAUDE_PLUGIN_ROOT" "$err"
assert_contains  "error shows the resolved looked-in path" "skills/standards/profiles/probe" "$err"

summary
