#!/usr/bin/env bash
# Tests for project-context detection during --collect.
#
# The runner detects language / runtime / package manager once from manifest
# files in the project root and prepends a "Detected project context" block to
# every prompt-based standard's rendered_prompt. It also surfaces the detected
# context as a top-level `project_context` field in collect-<scope>.json.
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_SKILL_DIR="$(cd "$TEST_DIR/.." && pwd)"
RUNNER="$REAL_SKILL_DIR/scripts/run-audit.sh"

# shellcheck source=lib.sh
source "$TEST_DIR/lib.sh"

echo "test-context-detect.sh"

# A fake skill root with a prompt-based standard, so we can inspect what the
# runner injects into rendered_prompt without bringing in any real standards.
SKILL_TMP=$(mktemp -d)
trap 'rm -rf "$SKILL_TMP"' EXIT
mkdir -p "$SKILL_TMP/profiles/probe"
cat > "$SKILL_TMP/profiles/probe/manual.yaml" <<'EOF'
required: true
description: "Probe standard verified by prompt."
check:
  prompt: |
    Verify thingy at $PROJECT_ROOT.
EOF
cat > "$SKILL_TMP/profiles/probe/script.yaml" <<'EOF'
required: true
description: "Script-based probe."
check:
  script: |
    exit 0
EOF

run_collect_required() {
  local project_root="$1"
  local state; state=$(mktemp -d)
  CLAUDE_SKILL_DIR="$SKILL_TMP" "$RUNNER" --collect "$project_root" "$state" --scope required >/dev/null
  cat "$state/collect-required.json"
  rm -rf "$state"
}

# --- Test 1: Node.js project (package.json) detected and surfaced ---
# Detected-context block is baked into the per-entry prompt file (read via
# prompt_path), not into the JSON.
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
cat > "$proj/package.json" <<'EOF'
{"name": "x", "version": "0.0.0"}
EOF
state=$(mktemp -d)
CLAUDE_SKILL_DIR="$SKILL_TMP" "$RUNNER" --collect "$proj" "$state" --scope required >/dev/null
out=$(cat "$state/collect-required.json")
context=$(printf '%s' "$out" | jq -r '.project_context // ""')
prompt_path=$(printf '%s' "$out" | jq -r '.pending[0].prompt_path')
prompt=$(cat "$prompt_path" 2>/dev/null || echo "")
assert_contains "project_context names Node.js" "Node.js" "$context"
assert_contains "prompt file carries detected-context block" "Detected project context" "$prompt"
assert_contains "prompt file names Node.js"          "Node.js"                     "$prompt"
assert_contains "prompt file names primary manifest" "package.json"                "$prompt"
assert_contains "Node defaults package manager to npm" "Package manager: npm"      "$prompt"
rm -rf "$proj" "$state"

# --- Test 2: Node + pnpm-lock.yaml → package manager identified ---
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
cat > "$proj/package.json" <<'EOF'
{"name": "x", "version": "0.0.0"}
EOF
touch "$proj/pnpm-lock.yaml"
state=$(mktemp -d)
CLAUDE_SKILL_DIR="$SKILL_TMP" "$RUNNER" --collect "$proj" "$state" --scope required >/dev/null
out=$(cat "$state/collect-required.json")
prompt_path=$(printf '%s' "$out" | jq -r '.pending[0].prompt_path')
prompt=$(cat "$prompt_path" 2>/dev/null || echo "")
assert_contains "prompt file names pnpm package manager" "Package manager: pnpm" "$prompt"
rm -rf "$proj" "$state"

# --- Test 3: Ruby project (Gemfile) ---
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
echo "source 'https://rubygems.org'" > "$proj/Gemfile"
out=$(run_collect_required "$proj")
context=$(printf '%s' "$out" | jq -r '.project_context // ""')
assert_contains "project_context names Ruby" "Ruby" "$context"
assert_contains "project_context names Bundler" "Package manager: Bundler" "$context"
rm -rf "$proj"

# --- Test 4: Python project (pyproject.toml) ---
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
echo "[project]" > "$proj/pyproject.toml"
out=$(run_collect_required "$proj")
context=$(printf '%s' "$out" | jq -r '.project_context // ""')
assert_contains "project_context names Python" "Python" "$context"
assert_contains "Python defaults package manager to pip" "Package manager: pip" "$context"
rm -rf "$proj"

# --- Test 5: Rust project (Cargo.toml) ---
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
echo "[package]" > "$proj/Cargo.toml"
out=$(run_collect_required "$proj")
context=$(printf '%s' "$out" | jq -r '.project_context // ""')
assert_contains "project_context names Rust" "Rust" "$context"
assert_contains "project_context names Cargo" "Package manager: Cargo" "$context"
rm -rf "$proj"

# --- Test 6: Go project (go.mod) ---
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
echo "module example.com/x" > "$proj/go.mod"
out=$(run_collect_required "$proj")
context=$(printf '%s' "$out" | jq -r '.project_context // ""')
assert_contains "project_context names Go" "Go" "$context"
assert_contains "project_context names go modules" "Package manager: go modules" "$context"
rm -rf "$proj"

# --- Test 7: Project with no recognised manifest → context_block is empty,
#             prompt file has no "Detected project context" header ---
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
state=$(mktemp -d)
CLAUDE_SKILL_DIR="$SKILL_TMP" "$RUNNER" --collect "$proj" "$state" --scope required >/dev/null
out=$(cat "$state/collect-required.json")
context=$(printf '%s' "$out" | jq -r '.project_context // ""')
prompt_path=$(printf '%s' "$out" | jq -r '.pending[0].prompt_path')
prompt=$(cat "$prompt_path" 2>/dev/null || echo "")
assert_eq "project_context is empty when no manifest" "" "$context"
assert_not_contains "prompt file has no context header" "Detected project context" "$prompt"
rm -rf "$proj" "$state"

# --- Test 8: Detection happens once; same context appears in collect-required.json
#             top-level field and in every pending entry's prompt file across both scopes. ---
mkdir -p "$SKILL_TMP/profiles/probe2"
cat > "$SKILL_TMP/profiles/probe2/manual2.yaml" <<'EOF'
required: false
description: "Second probe verified by prompt."
check:
  prompt: |
    Second verification at $PROJECT_ROOT.
EOF
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe, probe2]
EOF
cat > "$proj/package.json" <<'EOF'
{"name": "x"}
EOF
state=$(mktemp -d)
CLAUDE_SKILL_DIR="$SKILL_TMP" "$RUNNER" --collect "$proj" "$state" --scope required >/dev/null
CLAUDE_SKILL_DIR="$SKILL_TMP" "$RUNNER" --collect "$proj" "$state" --scope suggested >/dev/null
combined=$(jq -n --slurpfile r "$state/collect-required.json" --slurpfile s "$state/collect-suggested.json" \
  '{pending: ($r[0].pending + $s[0].pending)}')
pending_count=$(printf '%s' "$combined" | jq '.pending | length')
assert_eq "two prompt-based pending entries (combined across scopes)" "2" "$pending_count"
all_have_context=0
while IFS= read -r ppath; do
  if [[ -n "$ppath" ]] && grep -q "Detected project context" "$ppath" 2>/dev/null; then
    all_have_context=$((all_have_context + 1))
  fi
done < <(printf '%s' "$combined" | jq -r '.pending[].prompt_path')
assert_eq "both pending entries' prompt files include the context block" "2" "$all_have_context"
rm -rf "$proj" "$state"
rm -rf "$SKILL_TMP/profiles/probe2"

# --- Test 9: Script-based standards are unaffected (no rendered_prompt is
#             generated for them; resolved entries are unchanged) ---
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
cat > "$proj/package.json" <<'EOF'
{"name": "x"}
EOF
out=$(run_collect_required "$proj")
script_status=$(printf '%s' "$out" | jq -r '.resolved[] | select(.id=="probe/script") | .status')
assert_eq "script-based standard resolves normally" "PASS" "$script_status"
rm -rf "$proj"

# --- Test 10: project_context includes a git-derived file listing ---
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
cat > "$proj/package.json" <<'EOF'
{"name": "x"}
EOF
mkdir -p "$proj/src" "$proj/bin"
touch "$proj/src/cli.ts" "$proj/bin/foo" "$proj/README.md"
git -C "$proj" init -q
git -C "$proj" add -A
out=$(run_collect_required "$proj")
context=$(printf '%s' "$out" | jq -r '.project_context // ""')
assert_contains "project_context has file-listing header" "Project file listing" "$context"
assert_contains "project_context lists package.json" "package.json" "$context"
assert_contains "project_context lists src/cli.ts"   "src/cli.ts"    "$context"
assert_contains "project_context lists bin/foo"      "bin/foo"       "$context"
rm -rf "$proj"

# --- Test 11: Deno project (deno.json) ---
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
echo '{}' > "$proj/deno.json"
out=$(run_collect_required "$proj")
context=$(printf '%s' "$out" | jq -r '.project_context // ""')
assert_contains "project_context names Deno" "Deno" "$context"
assert_contains "project_context names deno package manager" "Package manager: deno" "$context"
rm -rf "$proj"

# --- Test 12: Dart project (pubspec.yaml) ---
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
echo "name: x" > "$proj/pubspec.yaml"
out=$(run_collect_required "$proj")
context=$(printf '%s' "$out" | jq -r '.project_context // ""')
assert_contains "project_context names Dart" "Dart" "$context"
assert_contains "project_context names pub package manager" "Package manager: pub" "$context"
rm -rf "$proj"

# --- Test 13: Swift project (Package.swift) ---
proj=$(mktemp -d)
cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
echo "// swift-tools-version:5.9" > "$proj/Package.swift"
out=$(run_collect_required "$proj")
context=$(printf '%s' "$out" | jq -r '.project_context // ""')
assert_contains "project_context names Swift" "Swift" "$context"
assert_contains "project_context names SwiftPM package manager" "Package manager: SwiftPM" "$context"
rm -rf "$proj"

# --- Test 14: Python package-manager disambiguation by lockfile ---
for pair in "uv.lock:uv" "poetry.lock:Poetry" "pdm.lock:PDM" "Pipfile.lock:Pipenv"; do
  lock="${pair%%:*}"; expected="${pair##*:}"
  proj=$(mktemp -d)
  cat > "$proj/project.yaml" <<'EOF'
profiles: [probe]
EOF
  echo "[project]" > "$proj/pyproject.toml"
  touch "$proj/$lock"
  out=$(run_collect_required "$proj")
  context=$(printf '%s' "$out" | jq -r '.project_context // ""')
  assert_contains "Python with $lock names $expected" "Package manager: $expected" "$context"
  rm -rf "$proj"
done

summary
