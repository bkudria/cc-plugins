#!/usr/bin/env bash
# marketplace-generate.sh — Regenerate .claude-plugin/marketplace.json from constituent plugin.json files
#
# Usage:
#   marketplace-generate.sh                       # apply changes in place
#   marketplace-generate.sh --check               # dry-run; exit 1 if changes would be made
#   marketplace-generate.sh --marketplace <path>  # operate on a marketplace.json other than ./.claude-plugin/marketplace.json
#
# Strategy: walk plugins/*/.claude-plugin/plugin.json under the marketplace root.
# For each plugin, build a plugins[] entry from authoritative sources:
#   - name        from plugin.json (authoritative)
#   - description from plugin.json (authoritative — fixes drift)
#   - homepage    from plugin.json if present (authoritative — overwrites entry)
#   - keywords    from plugin.json if present (authoritative — overwrites entry)
#   - source      preserved from existing marketplace entry, or defaulted to
#                 "./plugins/<dirname>" for new plugins
#   - category, and everything else preserved from existing marketplace entry as hand-edited metadata
#                 (`category` belongs in marketplace entries only — `claude plugin validate --strict`
#                  warns when it appears in plugin.json)
# Top-level marketplace fields (name, owner, description, etc.) are preserved
# verbatim. Only plugins[] is regenerated.
#
# Output is sorted alphabetically by plugin name for deterministic diffs.
#
# See references/marketplace-spec.md for the full schema and design rationale.

set -euo pipefail
shopt -s nullglob

if ! command -v jq &>/dev/null; then
    echo "Error: jq is required (brew install jq)" >&2
    exit 2
fi

CHECK_MODE=false
MARKETPLACE_PATH=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --check)
            CHECK_MODE=true
            shift
            ;;
        --marketplace)
            MARKETPLACE_PATH="$2"
            shift 2
            ;;
        -h|--help)
            sed -n '2,/^$/p' "$0" | sed 's/^# *//'
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            echo "Usage: marketplace-generate.sh [--check] [--marketplace <path>]" >&2
            exit 2
            ;;
    esac
done

# Default marketplace path: ./.claude-plugin/marketplace.json
if [[ -z "$MARKETPLACE_PATH" ]]; then
    MARKETPLACE_PATH="./.claude-plugin/marketplace.json"
fi

if [[ ! -f "$MARKETPLACE_PATH" ]]; then
    echo "Error: marketplace.json not found at $MARKETPLACE_PATH" >&2
    exit 2
fi

if ! jq -e . "$MARKETPLACE_PATH" >/dev/null 2>&1; then
    echo "Error: $MARKETPLACE_PATH is not valid JSON" >&2
    exit 2
fi

# Marketplace root is the parent of .claude-plugin/
MARKETPLACE_ROOT=$(cd "$(dirname "$MARKETPLACE_PATH")/.." && pwd)
PLUGINS_DIR="$MARKETPLACE_ROOT/plugins"

if [[ ! -d "$PLUGINS_DIR" ]]; then
    echo "Error: $PLUGINS_DIR does not exist" >&2
    exit 2
fi

# Build the new plugins[] array
new_plugins='[]'

for plugin_dir in "$PLUGINS_DIR"/*/; do
    plugin_dir="${plugin_dir%/}"
    manifest="$plugin_dir/.claude-plugin/plugin.json"
    [[ -f "$manifest" ]] || continue

    if ! jq -e . "$manifest" >/dev/null 2>&1; then
        echo "Warning: $manifest is not valid JSON, skipping" >&2
        continue
    fi

    name=$(jq -r '.name // empty' "$manifest")
    description=$(jq -r '.description // empty' "$manifest")
    homepage=$(jq -r '.homepage // empty' "$manifest")
    keywords=$(jq -c '.keywords // empty' "$manifest")
    dirname=$(basename "$plugin_dir")

    if [[ -z "$name" ]]; then
        echo "Warning: $manifest has no name field, skipping" >&2
        continue
    fi

    # Semver shape check (MAJOR.MINOR.PATCH with optional prerelease/build).
    # `claude plugin validate --strict` does not catch bad semver, so this is the only gate.
    version=$(jq -r '.version // empty' "$manifest")
    if [[ -n "$version" && ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
        echo "Warning: $manifest has version='$version' which doesn't match semver MAJOR.MINOR.PATCH" >&2
    fi

    # Look up existing marketplace entry by name (to preserve hand-edited fields)
    existing=$(jq --arg n "$name" '.plugins // [] | map(select(.name == $n)) | first // {}' "$MARKETPLACE_PATH")

    # Build new entry: start from existing (preserves hand-edited fields),
    # then overwrite authoritative fields from plugin.json,
    # then default source if missing.
    entry=$(jq -n \
        --argjson existing "$existing" \
        --arg name "$name" \
        --arg description "$description" \
        --arg default_source "./plugins/$dirname" \
        --arg homepage "$homepage" \
        --argjson keywords "${keywords:-null}" \
        '
        $existing
        + {name: $name, description: $description}
        + (if $homepage != "" then {homepage: $homepage} else {} end)
        + (if $keywords != null then {keywords: $keywords} else {} end)
        | if has("source") then . else . + {source: $default_source} end
        ')

    new_plugins=$(echo "$new_plugins" | jq --argjson e "$entry" '. + [$e]')
done

# Sort by name for deterministic ordering
new_plugins=$(echo "$new_plugins" | jq 'sort_by(.name)')

# Compose the new marketplace.json: preserve all top-level fields, replace plugins[]
new_marketplace=$(jq --argjson plugins "$new_plugins" '.plugins = $plugins' "$MARKETPLACE_PATH")

# Compare to existing
existing_normalized=$(jq -S . "$MARKETPLACE_PATH")
new_normalized=$(echo "$new_marketplace" | jq -S .)

if [[ "$existing_normalized" == "$new_normalized" ]]; then
    echo "marketplace.json is up to date ($MARKETPLACE_PATH)"
    exit 0
fi

if $CHECK_MODE; then
    echo "marketplace.json is out of date ($MARKETPLACE_PATH)"
    echo ""
    echo "Run 'marketplace-generate.sh' to regenerate. Diff:"
    echo ""
    diff <(echo "$existing_normalized") <(echo "$new_normalized") || true
    exit 1
fi

# Apply changes
echo "$new_marketplace" | jq . > "$MARKETPLACE_PATH"
echo "Regenerated $MARKETPLACE_PATH"
echo ""
echo "Diff:"
diff <(echo "$existing_normalized") <(jq -S . "$MARKETPLACE_PATH") || true
