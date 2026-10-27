#!/usr/bin/env bash
# Tests for scripts/quick-validate.sh frontmatter field validation (S4).
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="$TEST_DIR/../scripts/quick-validate.sh"

PASS_COUNT=0
FAIL_COUNT=0

check() {
  local name="$1" condition="$2"
  if eval "$condition"; then
    PASS_COUNT=$((PASS_COUNT + 1))
    printf '  ok   %s\n' "$name"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf '  FAIL %s\n' "$name"
    printf '%s\n' "$output" | sed 's/^/       /'
  fi
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Writes a minimal skill named after its directory, with extra frontmatter lines.
make_skill() {
  local name="$1" extra="$2"
  mkdir -p "$WORK/$name"
  {
    printf -- '---\nname: %s\ndescription: Fixture skill used to exercise frontmatter validation.\n' "$name"
    printf '%s\n' "$extra"
    printf -- '---\n\n# %s\n\n## When to Use\n\n- Testing\n' "$name"
  } > "$WORK/$name/SKILL.md"
}

s4_line() { printf '%s\n' "$output" | grep -E ' S4: ' || true; }

echo "test-quick-validate.sh"

make_skill when-to-use "when_to_use: Use when testing the validator."
output=$("$VALIDATOR" "$WORK/when-to-use" 2>&1 || true)
check "accepts when_to_use" '[[ "$(s4_line)" == *PASS* ]]'

make_skill all-documented "$(cat <<'FIELDS'
when_to_use: Use when testing.
argument-hint: "[file]"
arguments: file
disable-model-invocation: false
user-invocable: true
allowed-tools: Read
disallowed-tools: AskUserQuestion
model: inherit
effort: high
context: fork
agent: general-purpose
background: false
hooks: {}
paths: "src/**"
shell: bash
metadata:
  owner: tests
license: MIT
compatibility: Claude Code
FIELDS
)"
output=$("$VALIDATOR" "$WORK/all-documented" 2>&1 || true)
check "accepts every documented field" '[[ "$(s4_line)" == *PASS* ]]'

make_skill unknown-field "triggers: audit"
output=$("$VALIDATOR" "$WORK/unknown-field" 2>&1 || true)
check "rejects an unknown field" '[[ "$(s4_line)" == *FAIL*triggers* ]]'

make_skill unknown-underscore "trigger_phrases: audit"
output=$("$VALIDATOR" "$WORK/unknown-underscore" 2>&1 || true)
check "names an unknown underscored field in full" '[[ "$(s4_line)" == *"trigger_phrases"* ]]'

echo ""
echo "$PASS_COUNT passed, $FAIL_COUNT failed"
[[ $FAIL_COUNT -eq 0 ]]
