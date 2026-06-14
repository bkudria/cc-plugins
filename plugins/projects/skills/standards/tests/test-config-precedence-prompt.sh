#!/usr/bin/env bash
# The cli/config-precedence standard is about *per-setting overlap*: when the
# same setting is accepted from more than one config layer, users need to know
# which layer wins. That criterion must live in the binding check.prompt — not
# only in the notes, which the audit pipeline renders under a header framing them
# as "background context, not new verification directives". This pins the
# per-setting framing into the prompt so a future reword can't silently drop it
# back to a bare "how many layers exist" count.
set -uo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_SKILL_DIR="$(cd "$TEST_DIR/.." && pwd)"

# shellcheck source=lib.sh
source "$TEST_DIR/lib.sh"

echo "test-config-precedence-prompt.sh"

yaml="$REAL_SKILL_DIR/profiles/cli/config-precedence.yaml"
prompt=$(yq -r '.check.prompt // ""' "$yaml" 2>/dev/null || echo "")
# Collapse whitespace so phrases split across YAML literal-block lines still match.
prompt=$(printf '%s' "$prompt" | tr '\n' ' ' | tr -s ' ')

assert_contains "config-precedence prompt tests the same setting, not just layer types" \
  "same setting" "$prompt"
assert_contains "config-precedence prompt ties overlap to more than one layer" \
  "more than one layer" "$prompt"

summary
