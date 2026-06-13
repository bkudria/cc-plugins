#!/usr/bin/env bash
# Integration test: the real --collect → --merge seam under partial verifier
# dispatch. When some prompt-based standards never get a response file written,
# merge must mark exactly those FAIL ("no response") while standards that did get
# a response resolve normally. test-merge.sh covers this against a hand-built
# collect.json; this exercises it through genuine --collect output, so any drift
# between collect's emitted pending format and merge's missing-response detection
# is caught.
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_SKILL_DIR="$(cd "$TEST_DIR/.." && pwd)"
RUNNER="$REAL_SKILL_DIR/scripts/run-audit.sh"

# shellcheck source=lib.sh
source "$TEST_DIR/lib.sh"

echo "test-collect-merge-partial.sh"

TMPDIRS=()
cleanup() {
  for d in "${TMPDIRS[@]:-}"; do
    if [[ -n "$d" && -d "$d" ]]; then
      rm -rf "$d"
    fi
  done
  return 0
}
trap cleanup EXIT

# --- A fake skill dir: one profile, two prompt-based required standards --------
# Prompt-based (check.prompt) standards become *pending* at collect time — they
# need a verifier response file — which is exactly what this test withholds.
skill=$(mktemp -d); TMPDIRS+=("$skill")
mkdir -p "$skill/profiles/probe"
cat > "$skill/profiles/probe/alpha.yaml" <<'EOF'
required: true
description: "Alpha prompt-based standard."
check:
  prompt: |
    Verify alpha holds in $PROJECT_ROOT.
EOF
cat > "$skill/profiles/probe/beta.yaml" <<'EOF'
required: true
description: "Beta prompt-based standard."
check:
  prompt: |
    Verify beta holds in $PROJECT_ROOT.
EOF

# --- A project selecting that profile -----------------------------------------
proj=$(mktemp -d); TMPDIRS+=("$proj")
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
state=$(mktemp -d); TMPDIRS+=("$state")

# --- Collect (real run): both standards are prompt-based → two pending entries -
env CLAUDE_SKILL_DIR="$skill" "$RUNNER" --collect "$proj" "$state" --scope required >/dev/null
pend=$(jq -r '.pending | length' "$state/collect-required.json")
assert_eq "collect produced two pending prompt standards" "2" "$pend"

# --- Seed a response for ONE standard; leave the other's response file absent --
mkdir -p "$state/responses/probe"
printf '%s' '{"met": true, "detail": "alpha ok"}' > "$state/responses/probe/alpha.txt"

# --- Merge: responded → PASS, absent → FAIL with a "no response" detail --------
"$RUNNER" --merge "$state" >/dev/null
alpha_status=$(jq -r '.resolved[] | select(.id=="probe/alpha") | .status' "$state/merged.json")
beta_status=$(jq -r '.resolved[] | select(.id=="probe/beta") | .status' "$state/merged.json")
beta_detail=$(jq -r '.resolved[] | select(.id=="probe/beta") | .detail' "$state/merged.json")
assert_eq       "responded standard resolves PASS" "PASS" "$alpha_status"
assert_eq       "absent-response standard resolves FAIL" "FAIL" "$beta_status"
assert_contains "absent-response detail names the missing file" "no response" "$beta_detail"

summary
