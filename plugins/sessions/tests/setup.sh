#!/bin/bash
# shellcheck disable=SC2034 # the test documents read the fixture path variables
# Sourced by setup.md, which every test document prepends. Requires scrut's TESTDIR and TMPDIR.

export TZ=UTC LC_ALL=C
# Exported empty rather than unset: scrut's saved shell state cannot unset an inherited variable.
export CLAUDE_CODE_SESSION_ID=

CC_TEST_ROOT=$(cd "$TESTDIR/.." && pwd -P)
CC_TEST_TMP=$(cd "$TMPDIR" && pwd -P)

cc_test_install_config() {
  local dest=$1 rel stamp
  mkdir -p "$dest"
  cp -R "$TESTDIR/fixtures/config/." "$dest/"
  while IFS=$'\t' read -r rel stamp; do
    [ -n "$rel" ] && touch -t "$stamp" "$dest/$rel"
  done < "$TESTDIR/fixtures/mtimes.tsv"
}

export HOME="$CC_TEST_TMP/homedir"
cc_test_install_config "$HOME/.claude"
export CLAUDE_CONFIG_DIR="$HOME/.claude"

CC_TEST_SPACE_CONFIG="$CC_TEST_TMP/config dir with space"
cc_test_install_config "$CC_TEST_SPACE_CONFIG"

export PATH="$CC_TEST_ROOT/bin:$PATH"

P=$CLAUDE_CONFIG_DIR/projects
ALPHA=$P/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e
STUB=$P/-tmp-sessions-fixture-alpha/b5a7c9e1-0d2f-4a4b-9c6e-8f0a2b4c6d8e
BETA=$P/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e
RESUMED=$P/-tmp-sessions-fixture-beta/b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c
FLAT=$P/-tmp-sessions-fixture-flat/c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a
SDK=$P/-tmp-sessions-fixture-scuttlerun-project-Xy12/d1f3b5d7-9e0a-4c2e-a4b6-c8d0e2f4a6b8
RELOC=$P/-tmp-sessions-fixture-reloc/e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d
UNDER=$P/-tmp-sessions-fixture-under-score/f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4
WF=$ALPHA/subagents/workflows/wf_5d1c9a7e-3b2

# Prints its input with the data root replaced by "<root>", so expectations stay independent of TMPDIR.
cc_test_rel() {
  local root=${1:-$CLAUDE_CONFIG_DIR}
  awk -v root="$root" '{ while ((i = index($0, root)) > 0) $0 = substr($0, 1, i - 1) "<root>" substr($0, i + length(root)); print }'
}
