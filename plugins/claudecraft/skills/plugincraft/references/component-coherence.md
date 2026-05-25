# Cross-Component Coherence

Companion to the PX category in `quality-checklist.md`. For each PX check: detection recipe, false-positive cases, and concrete fix shapes.

These checks look across components — what `plugin-dev`'s `plugin-validator` cannot see when validating each component in isolation.

---

## PX1: Agent References Existing Skills

### Detection

For each `agents/*.md`, scan the description and body for references that look like skill invocations:

```bash
for agent in agents/*.md; do
  refs=$(grep -oE '(uses?|loads?|invokes?|via) the [a-z][a-z0-9-]+ skill' "$agent" \
    | sed -E 's/.*the ([a-z0-9-]+) skill.*/\1/' | sort -u)
  for ref in $refs; do
    [ -d "skills/$ref" ] || echo "$agent: references skill '$ref' which is not in this plugin"
  done
done
```

Repeat for fenced `Skill tool: load <name>` patterns and `Skill({skill: "<name>"})` calls.

### False Positives

- The skill is intentionally external and documented in README's Dependencies. Verify by checking README.
- The skill ships in a sibling plugin the user is expected to have installed (e.g., `plugin-dev`'s component skills). Verify by checking README's Dependencies.

### Fix Recipe

If the reference is real and the skill should exist in this plugin: scaffold it (or move it in from elsewhere).
If the reference is to an external skill: add a Dependencies row in README naming the plugin and the skill.
If the reference is stale (rename or removal): update the agent's text.

---

## PX2: Hook Command Paths Resolve

### Detection

```bash
jq -r '.. | objects | .command? // empty' hooks.json \
  | sed "s|\${CLAUDE_PLUGIN_ROOT}|.|" \
  | while read -r cmd; do
      [ -f "$cmd" ] || echo "broken hook command: $cmd"
    done
```

This finds every `command` string and verifies its file exists after expanding `${CLAUDE_PLUGIN_ROOT}` to the plugin root.

### False Positives

- The `command` is a system binary (`echo`, `grep`, `python3`) without a path prefix. The check should only trigger on commands that begin with `${CLAUDE_PLUGIN_ROOT}` or `./`.
- The command pipes through a shell (`bash -c "${CLAUDE_PLUGIN_ROOT}/hooks/x.sh | jq ..."`). Strip the shell wrapper first.

### Fix Recipe

If the file was renamed: update the hook entry.
If the file was deleted: remove the hook entry.
If the file should exist but doesn't: create it.

---

## PX3: MCP Server Names Referenced Cohesively

### Detection

```bash
# Collect declared servers
servers=$(jq -r '.mcpServers // {} | keys[]' .mcp.json 2>/dev/null || true)

# Find mcp__<server>__<tool> references across all plugin files
refs=$(grep -rohE 'mcp__[a-z0-9_-]+__[a-z0-9_-]+' \
  --include='*.md' --include='*.json' . \
  | sed -E 's/mcp__([^_]+)__.*/\1/' | sort -u)

# Flag references with no matching server
for ref in $refs; do
  echo "$servers" | grep -qx "$ref" || echo "Dangling MCP reference: mcp__${ref}__*"
done
```

### False Positives

- The reference appears inside a quoted example showing what NOT to do.
- The plugin documents external MCP servers users are expected to install elsewhere.

### Fix Recipe

If the reference is intentional and the user is expected to install the server elsewhere: document it in README.
If the server should ship with this plugin: add it to `.mcp.json`.
If the reference is stale: remove or fix it.

---

## PX4: Command `allowed-tools` Matches Body Usage

### Detection

For each `commands/*.md`, extract the `allowed-tools` value and the tools the body instructs:

```bash
for cmd in commands/*.md; do
  declared=$(awk '/^---$/,/^---$/' "$cmd" \
    | grep -E '^allowed-tools:' | sed 's/allowed-tools://' \
    | tr -d '[],"' | tr ' ' '\n' | grep -v '^$' | sort -u)
  [ -z "$declared" ] && continue
  body=$(awk '/^---$/{c++; next} c>=2' "$cmd")
  for tool in Read Write Edit Bash Glob Grep Skill Agent AskUserQuestion WebFetch WebSearch; do
    if echo "$body" | grep -qE "\b${tool}\b"; then
      echo "$declared" | grep -qx "$tool" || echo "$cmd uses $tool but allowed-tools excludes it"
    fi
  done
done
```

### False Positives

- The body mentions a tool name in passing (e.g., "do NOT use the Bash tool here"). The check should treat negated uses gently — surface as a warning, not a fail.
- The body shows an example transcript that uses a tool the command itself doesn't invoke.

### Fix Recipe

If the body genuinely needs the tool: add it to `allowed-tools`.
If the body mentions the tool only in passing or shows it in an unrelated example: leave `allowed-tools` alone; the warning is a false positive.
If `allowed-tools` is unset, this check does not apply — the command has access to all tools.

---

## PX5: No Name Collisions Between Components

### Detection

```bash
{
  ls skills 2>/dev/null
  ls commands 2>/dev/null | sed 's/\.md$//'
  ls agents 2>/dev/null | sed 's/\.md$//'
} | sort | uniq -d
```

Any line in the output is a name shared across two or more component types.

### False Positives

None expected. If two components share a name, `/help` will show ambiguous entries and users will struggle.

### Fix Recipe

Rename one. Prefer renaming whichever has fewer cross-references inside the plugin. Update README, agent descriptions, and any other mentions.

---

## PX6: No Trigger-Phrase Collision Between Skills

### Detection

For each pair of skills in the plugin:

1. Extract the `description` field from each `SKILL.md`.
2. Tokenize into "TRIGGER when:" phrases (or the equivalent clauses).
3. Look for overlapping verb+noun patterns.

Mechanically this is fuzzy — a useful heuristic:

```bash
for s in skills/*/SKILL.md; do
  desc=$(awk '/^---$/,/^---$/' "$s" \
    | sed -n 's/^description: *"\(.*\)"$/\1/p; s/^description: *\(.*\)$/\1/p')
  echo "$s: $desc"
done
```

Read the output. If two skills both promise to trigger on the same verb+noun (e.g., both mention "editing markdown files"), they collide.

### False Positives

- One skill triggers on a strict superset of the other's conditions, and the bodies route between themselves explicitly. The collision is intentional and managed.
- Both skills mention the same noun but with different verbs (one "editing", the other "auditing"). Probably fine; check whether the user-facing intents overlap.

### Fix Recipe

Narrow one skill's trigger conditions so the descriptions don't promise the same scenarios.
If the skills genuinely overlap: merge them, or split the shared concern into a third skill they both depend on.
If you intentionally want both to load on the same trigger: document the dual-load in both descriptions so the model picks both deliberately.

---

## PE1: Plugin Has Eval Suite

Filesystem check; no external tool required.

### Detection

```bash
[[ -f "$plugin_dir/evals.yaml" ]] && \
  ls "$plugin_dir"/evals/*/scenario.yaml 2>/dev/null | head -1
```

Empty output means no real scenarios (either `evals.yaml` is absent or no scenario directories exist). A printed path means the suite exists.

### False Positives

- A plugin in active bootstrap: `evals.yaml` may exist with no scenarios yet because `craboodle init` was just run. Treat this as PE1 fail in audit but note in the report that it looks mid-bootstrap.
- A scenario file named something other than `scenario.yaml` (e.g., `scenario.yml`): adjust the glob if needed — `craboodle init` writes `scenario.yaml` by convention but both extensions are accepted.

### Fix Recipe

Bootstrap evals via plugincraft's `workflows/bootstrap-evals.md`. The workflow's Step 6 calls `craboodle init <plugin-root>`, which scaffolds `evals.yaml` with sensible defaults; Steps 7-9 then write scenarios, lint them, and run them.
