#!/usr/bin/env bash
# Tests the SKILL_DIR fallback resolution.
#
# Scenario 1: when CLAUDE_SKILL_DIR is unset but CLAUDE_PLUGIN_ROOT is set, the
# runner (and the linter it shells out to) must resolve its profiles/ directory
# under ${CLAUDE_PLUGIN_ROOT}/skills/standards — the plugin install layout.
#
# Scenario 2: when BOTH CLAUDE_SKILL_DIR and CLAUDE_PLUGIN_ROOT are unset, the
# runner must self-locate its skill dir from the script's own path rather than
# collapsing to the literal filesystem-root path /skills/standards. Together
# these pin the resolution order so the audit works whether the env vars are
# exported or not.
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

# --- Scenario 2: both CLAUDE_SKILL_DIR and CLAUDE_PLUGIN_ROOT unset -----------
# With neither override set, the runner (and the linter it shells out to) must
# locate its own skill dir from the script's path, NOT collapse to the literal
# filesystem-root path /skills/standards. Invoke through a symlinked fake skill
# whose scripts/ holds links to the real scripts and whose profiles/ holds a
# probe standard; self-location must resolve profiles under that fake skill.
fake_skill=$(setup_fake_skill)
mkdir -p "$fake_skill/profiles/probe"
cat > "$fake_skill/profiles/probe/marker.yaml" <<'EOF'
required: true
description: "Probe standard used to verify BASH_SOURCE self-location."
check:
  script: |
    cd "$PROJECT_ROOT"
    exit 0
EOF

proj2=$(mktemp -d)
state2=$(mktemp -d)
trap 'rm -rf "$PLUGIN_ROOT" "$proj" "$state" "$fake_skill" "$proj2" "$state2"' EXIT
cat > "$proj2/project.yaml" <<'EOF'
profiles: [probe]
EOF

rc2=0
env -u CLAUDE_SKILL_DIR -u CLAUDE_PLUGIN_ROOT \
  "$fake_skill/scripts/run-audit.sh" --collect "$proj2" "$state2" --scope required >/dev/null 2>&1 || rc2=$?
assert_exit_code "collect self-locates skill dir when both env vars unset" 0 "$rc2"

if [[ -f "$state2/collect-required.json" ]]; then
  ids2=$(jq -r '.resolved[].id' "$state2/collect-required.json" 2>/dev/null | tr '\n' ' ')
  assert_contains "probe/marker collected via BASH_SOURCE self-location" "probe/marker" "$ids2"
else
  assert_contains "collect-required.json written via self-location" "collect-required.json" "missing"
fi

summary
