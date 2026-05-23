#!/usr/bin/env bash
# quick-validate.sh — Fast structural validation for Claude Code plugins
#
# Usage:
#   quick-validate.sh <plugin-directory>
#   quick-validate.sh --all [<base-path>]
#
# Runs automated structural checks (subset of the full 32-item checklist).
# Use this for fast pre-flight; use the full improve-standard workflow for deep audits.
#
# Checks performed:
#   PM1: plugin.json exists at .claude-plugin/
#   PM2: Valid JSON
#   PM3: Required name field
#   PM4: Name is kebab-case
#   PM5: Description length 10-1024
#   PM6: Version is semver (if present)
#   PS1: Standard component directories (only canonical names)
#   PS2: Components at plugin root, NOT inside .claude-plugin/
#   PS3: ${CLAUDE_PLUGIN_ROOT} in hooks.json/.mcp.json path references
#   PS5: Component dirs/files use kebab-case
#   PR1: README.md exists at plugin root
#
# Optional (only when applicable):
#   MK1: Plugin appears in parent marketplace.json's plugins[] (when parent marketplace exists)
#
# Deferred to improve-standard.md (not in pre-flight): PC, PX, PR2-4, MK2-3, PB.

set -euo pipefail
shopt -s nullglob

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}PASS${NC} $1: $2"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}FAIL${NC} $1: $2"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}WARN${NC} $1: $2"; WARN=$((WARN + 1)); }

if ! command -v jq &>/dev/null; then
    echo "Error: jq is required (brew install jq)"
    exit 2
fi

# Find the nearest marketplace.json at or above a plugin directory.
# Returns empty string if none found.
find_parent_marketplace() {
    local dir="$1"
    local search_dir
    search_dir=$(cd "$dir/.." 2>/dev/null && pwd) || return 0
    while [[ "$search_dir" != "/" && -n "$search_dir" ]]; do
        if [[ -f "$search_dir/.claude-plugin/marketplace.json" ]]; then
            echo "$search_dir/.claude-plugin/marketplace.json"
            return 0
        fi
        search_dir=$(dirname "$search_dir")
    done
    return 0
}

validate_plugin() {
    local plugin_dir="$1"
    local dir_name
    dir_name=$(basename "$plugin_dir")

    echo ""
    echo "Validating: $dir_name"
    echo "  Path: $plugin_dir"
    echo ""

    local manifest="$plugin_dir/.claude-plugin/plugin.json"

    # PM1: plugin.json exists
    if [[ -f "$manifest" ]]; then
        pass "PM1" "plugin.json exists at .claude-plugin/"
    else
        # Fallback: maybe it's at plugin root instead
        if [[ -f "$plugin_dir/plugin.json" ]]; then
            fail "PM1" "plugin.json found at plugin root, must be inside .claude-plugin/"
        else
            fail "PM1" "plugin.json not found"
        fi
        echo ""
        echo "  Score: $PASS passed, $FAIL failed, $WARN warnings"
        return
    fi

    # PM2: Valid JSON
    if jq -e . "$manifest" >/dev/null 2>&1; then
        pass "PM2" "plugin.json is valid JSON"
    else
        fail "PM2" "plugin.json is not valid JSON"
        echo ""
        echo "  Score: $PASS passed, $FAIL failed, $WARN warnings"
        return
    fi

    # PM3: name field present
    local name_value
    name_value=$(jq -r '.name // empty' "$manifest")
    if [[ -n "$name_value" ]]; then
        pass "PM3" "name field present: '$name_value'"
    else
        fail "PM3" "name field missing or empty"
        name_value=""
    fi

    # PM4: name is kebab-case
    if [[ -n "$name_value" ]]; then
        if echo "$name_value" | grep -qE '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'; then
            pass "PM4" "name is kebab-case"
        else
            fail "PM4" "name '$name_value' is not lowercase kebab-case"
        fi
    fi

    # PM5: description length 10-1024
    local desc
    desc=$(jq -r '.description // empty' "$manifest")
    if [[ -z "$desc" ]]; then
        fail "PM5" "description missing"
    else
        local desc_len=${#desc}
        if [[ $desc_len -ge 10 && $desc_len -le 1024 ]]; then
            pass "PM5" "description present ($desc_len chars)"
        else
            fail "PM5" "description length $desc_len (must be 10-1024)"
        fi
    fi

    # PM6: version is semver (if present)
    local version
    version=$(jq -r '.version // empty' "$manifest")
    if [[ -z "$version" ]]; then
        warn "PM6" "version field absent"
    elif echo "$version" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9a-zA-Z.-]+)?(\+[0-9a-zA-Z.-]+)?$'; then
        pass "PM6" "version is semver: $version"
    else
        fail "PM6" "version '$version' is not valid semver (MAJOR.MINOR.PATCH)"
    fi

    # PS1: Standard component directories (canonical names only)
    local non_canonical=""
    local canonical_re='^(commands|agents|skills|hooks)$'
    for d in "$plugin_dir"/*/; do
        [[ -d "$d" ]] || continue
        local base
        base=$(basename "$d")
        case "$base" in
            .claude-plugin|.git|node_modules) continue ;;
        esac
        # Flag anything that looks like a component dir but uses non-canonical case/name
        local lower
        lower=$(echo "$base" | tr '[:upper:]' '[:lower:]')
        case "$lower" in
            command|skill|agent|hook|tool|tools)
                non_canonical="$non_canonical $base"
                ;;
            commands|agents|skills|hooks)
                if [[ "$base" != "$lower" ]]; then
                    non_canonical="$non_canonical $base"
                fi
                ;;
        esac
    done
    if [[ -z "$non_canonical" ]]; then
        pass "PS1" "Component directories use canonical names"
    else
        fail "PS1" "Non-canonical component dirs:$non_canonical"
    fi

    # PS2: Components NOT inside .claude-plugin/
    local nested=""
    for component in commands agents skills hooks; do
        if [[ -d "$plugin_dir/.claude-plugin/$component" ]]; then
            nested="$nested $component"
        fi
    done
    if [[ -z "$nested" ]]; then
        pass "PS2" "No components nested inside .claude-plugin/"
    else
        fail "PS2" "Components inside .claude-plugin/:$nested (move to plugin root)"
    fi

    # PS3: ${CLAUDE_PLUGIN_ROOT} in hooks.json and .mcp.json command paths
    local hardcoded_paths=""
    for cfg in "$plugin_dir/hooks.json" "$plugin_dir/.mcp.json"; do
        [[ -f "$cfg" ]] || continue
        jq -e . "$cfg" >/dev/null 2>&1 || continue
        # Pull every .command and look for hardcoded plugin-internal paths
        while IFS= read -r cmd; do
            [[ -z "$cmd" ]] && continue
            # Heuristic: a path that references this plugin's own directories
            # without going through ${CLAUDE_PLUGIN_ROOT}
            if echo "$cmd" | grep -qE '(^|\s)(/Users/|/home/|\.\./|\./hooks/|\./scripts/|~/\.claude/plugins/)'; then
                hardcoded_paths="$hardcoded_paths $(basename "$cfg"):${cmd:0:60}"
            fi
        done < <(jq -r '.. | objects | .command? // empty' "$cfg" 2>/dev/null)
    done
    if [[ -z "$hardcoded_paths" ]]; then
        pass "PS3" "No hardcoded plugin-internal paths in hooks.json or .mcp.json"
    else
        fail "PS3" "Hardcoded paths found (use \${CLAUDE_PLUGIN_ROOT}):$hardcoded_paths"
    fi

    # PS5: Component directory and file names use kebab-case
    local non_kebab=""
    for component in commands agents skills hooks; do
        [[ -d "$plugin_dir/$component" ]] || continue
        for entry in "$plugin_dir/$component"/*; do
            [[ -e "$entry" ]] || continue
            local entry_base
            entry_base=$(basename "$entry")
            local entry_check="${entry_base%.md}"
            entry_check="${entry_check%.json}"
            entry_check="${entry_check%.sh}"
            if ! echo "$entry_check" | grep -qE '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'; then
                non_kebab="$non_kebab $component/$entry_base"
            fi
        done
    done
    if [[ -z "$non_kebab" ]]; then
        pass "PS5" "Component file/directory names are kebab-case"
    else
        warn "PS5" "Non-kebab-case names:$non_kebab"
    fi

    # PR1: README.md exists at plugin root
    if [[ -f "$plugin_dir/README.md" ]]; then
        pass "PR1" "README.md exists at plugin root"
    else
        fail "PR1" "README.md missing at plugin root"
    fi

    # MK1: Plugin appears in parent marketplace.json (only when one exists)
    local mk_path
    mk_path=$(find_parent_marketplace "$plugin_dir")
    if [[ -n "$mk_path" && -n "$name_value" ]]; then
        if jq -e --arg n "$name_value" '.plugins // [] | map(.name) | index($n)' "$mk_path" >/dev/null 2>&1; then
            pass "MK1" "Plugin appears in $(realpath --relative-to="$plugin_dir" "$mk_path" 2>/dev/null || echo "$mk_path")"
        else
            fail "MK1" "Plugin '$name_value' not listed in parent marketplace.json"
        fi
    fi

    echo ""
    echo "  Score: $PASS passed, $FAIL failed, $WARN warnings"
}

# Discover all plugins under known roots: marketplace-installed plugins,
# and the cwd's plugins/*/ if cwd is a marketplace root.
discover_plugins() {
    local base="$1"
    if [[ -n "$base" ]]; then
        # Caller supplied a base — iterate one level
        for plugin_dir in "$base"/*/; do
            [[ -f "$plugin_dir/.claude-plugin/plugin.json" ]] && echo "${plugin_dir%/}"
        done
        return
    fi

    # Marketplace-installed plugins
    for mp_dir in "$HOME"/.claude/plugins/marketplaces/*/plugins/*/; do
        [[ -f "$mp_dir/.claude-plugin/plugin.json" ]] && echo "${mp_dir%/}"
    done

    # Current working tree if it's a marketplace root
    if [[ -f "./.claude-plugin/marketplace.json" ]]; then
        for plugin_dir in ./plugins/*/; do
            [[ -f "$plugin_dir/.claude-plugin/plugin.json" ]] && echo "${plugin_dir%/}"
        done
    fi
}

# --- Main ---

if [[ $# -lt 1 ]]; then
    echo "Usage: quick-validate.sh <plugin-directory>"
    echo "       quick-validate.sh --all [<base-path>]"
    exit 1
fi

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_WARN=0

if [[ "$1" == "--all" ]]; then
    base="${2:-}"
    base="${base/#\~/$HOME}"
    if [[ -n "$base" ]]; then
        echo "Scanning all plugins in: $base"
    else
        echo "Scanning marketplace-installed plugins and current marketplace root"
    fi
    while IFS= read -r plugin_dir; do
        [[ -z "$plugin_dir" ]] && continue
        PASS=0; FAIL=0; WARN=0
        validate_plugin "$plugin_dir"
        TOTAL_PASS=$((TOTAL_PASS + PASS))
        TOTAL_FAIL=$((TOTAL_FAIL + FAIL))
        TOTAL_WARN=$((TOTAL_WARN + WARN))
    done < <(discover_plugins "$base")
    echo ""
    echo "================================"
    echo "Total: $TOTAL_PASS passed, $TOTAL_FAIL failed, $TOTAL_WARN warnings"
else
    plugin_path="${1/#\~/$HOME}"
    if [[ ! -d "$plugin_path" ]]; then
        echo "Error: Directory not found: $plugin_path"
        exit 1
    fi
    validate_plugin "$plugin_path"
    TOTAL_FAIL=$FAIL
fi

[[ $TOTAL_FAIL -gt 0 ]] && exit 1
exit 0
