# Plugin Anti-Patterns

Common problems in Claude Code plugins with diagnosis and fixes. Organized by category.

These patterns are plugin-level — for skill-level anti-patterns inside a plugin, see `skillcraft/references/anti-patterns.md` and run skillcraft's audit on each skill.

---

## Structural

### 1. Fat Plugin Without README

**Problem**: Plugin ships multiple components (skills, commands, agents) but has no README at the plugin root. Users install it and have no entry point.

**Symptoms**: `<plugin-dir>/` has `commands/`, `agents/`, `skills/`, `hooks.json`, `.mcp.json`, but no `README.md`. Users grep `plugin.json` for clues.

**Before**:
```
my-plugin/
├── .claude-plugin/plugin.json   ← only docs are the 1-line description
├── commands/
├── agents/
└── skills/
```

**After**:
```
my-plugin/
├── .claude-plugin/plugin.json
├── README.md                     ← Overview + Installation + Usage
├── commands/
├── agents/
└── skills/
```

**Fix**: Add `README.md` at the plugin root with three sections at minimum — Overview, Installation, Usage. Even stub sections are better than nothing.

---

### 2. Components Inside `.claude-plugin/`

**Problem**: Component directories placed inside `.claude-plugin/` instead of at the plugin root. Claude Code only discovers components at the plugin root.

**Symptoms**: Plugin installs but no skills/commands/agents appear. `/help` lists nothing from the plugin.

**Before**:
```
my-plugin/
└── .claude-plugin/
    ├── plugin.json
    ├── skills/foo/SKILL.md      ← never discovered
    └── commands/bar.md           ← never discovered
```

**After**:
```
my-plugin/
├── .claude-plugin/plugin.json
├── skills/foo/SKILL.md
└── commands/bar.md
```

**Fix**: Move every component directory up one level. Only `plugin.json` and `marketplace.json` belong inside `.claude-plugin/`.

---

### 3. Hardcoded Paths

**Problem**: Hooks or MCP server commands reference plugin files using hardcoded paths instead of `${CLAUDE_PLUGIN_ROOT}`.

**Symptoms**: Plugin works on author's machine, breaks on installation. Different user paths under `~/.claude/plugins/marketplaces/...` cause the hook command to point at a path that doesn't exist for the installing user.

**Before**:
```json
{
  "hooks": [
    {
      "matcher": "Write",
      "hooks": [
        {"type": "command", "command": "/Users/author/code/my-plugin/hooks/check.sh"}
      ]
    }
  ]
}
```

**After**:
```json
{
  "hooks": [
    {
      "matcher": "Write",
      "hooks": [
        {"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/check.sh"}
      ]
    }
  ]
}
```

**Fix**: Replace every hardcoded plugin-internal path with `${CLAUDE_PLUGIN_ROOT}/...`. This is the only portable way to reference files inside the plugin from hooks and MCP servers.

---

### 4. Orphan Agent Or Hook

**Problem**: Agent or hook is declared but never invoked by any other component in the plugin, and the README doesn't mention how to use it directly.

**Symptoms**: `agents/foo.md` exists. `grep -r "foo" .` returns only the file itself. Users won't discover or invoke it.

**Diagnosis**:
```bash
# For each agent, check whether anything mentions it
for f in agents/*.md; do
  name=$(basename "$f" .md)
  matches=$(grep -rln "$name" --exclude-dir=.git --exclude="$f" .)
  [ -z "$matches" ] && echo "Orphan agent: $name"
done
```

**Fix**: Either (a) reference the agent from a skill, command, or README so users discover it, or (b) delete it. Every shipped component should earn its place.

---

## Distribution

### 5. Marketplace Description Drift

**Problem**: The `description` in a plugin's `plugin.json` and the `description` in the parent `marketplace.json`'s entry for that plugin have diverged. Users install based on the marketplace description, then discover the plugin promises more (or less) than that.

**Symptoms**: Plugin and marketplace describe the same thing differently. Often the marketplace one is older and shorter; the plugin one has gained new components but the marketplace listing wasn't updated.

**Before** (a real drift currently in this very repo):

`plugins/claudecraft/.claude-plugin/plugin.json`:
```json
{
  "description": "Create, audit, and evaluate Claude Code skills. Bundles skillcraft (skill authoring discipline) and claude-code-evals (eval pipeline reference)."
}
```

`.claude-plugin/marketplace.json`:
```json
{
  "plugins": [
    {
      "name": "claudecraft",
      "description": "Create, audit, and evaluate Claude Code skills (skillcraft + claude-code-evals)."
    }
  ]
}
```

The marketplace description is older and lacks the "Bundles ... discipline ... reference" detail; both will fall further out of sync when plugincraft is added.

**After**: Both descriptions byte-for-byte identical. Prefer regenerating the marketplace from constituent `plugin.json` files via a script so this can't drift again.

**Fix**: For a one-off, manually sync the strings. For ongoing safety, regenerate `marketplace.json`'s `plugins[]` from each plugin's `plugin.json` (see `plugincraft`'s forthcoming `marketplace-generate.sh` script in PR 2). Drift becomes impossible by construction.

---

### 6. Stuck At 0.0.x

**Problem**: Plugin has been usable for months but `version` remains at `0.0.1` (or absent), signaling to potential users "this is still scaffolding, don't rely on it."

**Symptoms**: Plugin in active use, but `plugin.json`'s `version` field is `0.0.1`, `0.0.2`, or missing. No tags or CHANGELOG.

**Before**:
```json
{
  "name": "my-plugin",
  "version": "0.0.1"
}
```

**After**:
```json
{
  "name": "my-plugin",
  "version": "0.2.0"
}
```

**Fix**: Once the plugin is usable end-to-end, bump to `0.1.0`. Bump `MINOR` for added behavior, `PATCH` for fixes. Don't fear `1.0.0` — it signals "I commit to this interface," nothing more.

---

### 7. Missing License

**Problem**: No LICENSE file in the plugin. Users cannot legally redistribute, modify, or know what they can do with it.

**Symptoms**: `ls <plugin-root>` shows no `LICENSE`, `LICENSE.md`, or `LICENSE.txt`.

**Fix**: Add a `LICENSE` file. MIT is the conventional default for small open-source plugins; Apache-2.0 includes an explicit patent grant. Both are short — copy the canonical text and fill in the year and copyright holder.

---

### 8. README Has No Install Instructions

**Problem**: README describes what the plugin does but never tells the user how to install it. Users either guess or give up.

**Symptoms**: README has an Overview and maybe a Features section, but no `## Installation`. Or installation is hand-waved: "add to your marketplace and install."

**Before**:
```markdown
## Installation

This plugin can be installed through Claude Code's plugin system.
```

**After**:
```markdown
## Installation

In Claude Code:

    /plugin marketplace add bkudria/cc-plugins
    /plugin install claudecraft@bkudria-cc-plugins

Then reload plugins:

    /reload-plugins
```

**Fix**: Show the exact commands. Then test by following your own instructions in a fresh session. If the commands work, ship them.

---

## Naming

### 9. Plugin And Contained Skill Share Name

**Problem**: A plugin is named `foo` and ships a skill also named `foo`. `/help` shows two `foo` entries with no disambiguation, and users can't tell which they're invoking.

**Symptoms**: `plugins/foo/.claude-plugin/plugin.json` has `"name": "foo"` and `plugins/foo/skills/foo/SKILL.md` has `name: foo`.

**Before**:
```
plugins/foo/.claude-plugin/plugin.json   { "name": "foo" }
plugins/foo/skills/foo/SKILL.md          name: foo
```

**After**:
```
plugins/footools/.claude-plugin/plugin.json   { "name": "footools" }
plugins/footools/skills/foo/SKILL.md          name: foo
```

Or:
```
plugins/foo/.claude-plugin/plugin.json   { "name": "foo" }
plugins/foo/skills/foo-audit/SKILL.md    name: foo-audit
```

**Fix**: Pick one — rename the plugin or rename the contained skill. Prefer renaming whichever has fewer external references. Update all README and `marketplace.json` entries.

---

### 10. Generic Component Name

**Problem**: Component named `helper`, `utils`, `tools`, `common`. These names tell the user nothing about what the component does and collide easily across plugins.

**Symptoms**: `commands/helper.md`, `skills/utils/SKILL.md`, `agents/common.md`. After install, `/helper` could come from any of three plugins.

**Before**:
```
commands/helper.md
skills/utils/SKILL.md
agents/common.md
```

**After**:
```
commands/markdown-table-helper.md
skills/yaml-frontmatter-utils/SKILL.md
agents/dependency-scanner.md
```

**Fix**: Rename to a specific verb+noun phrase. If the component truly is a shared utility used only inside the plugin, consider whether it should be exposed as its own component at all, or inlined.

---

### 11. Inconsistent Naming

**Problem**: Plugin uses a mix of kebab-case, snake_case, and camelCase across components.

**Symptoms**: `commands/run-audit.md`, `commands/runValidator.md`, `commands/check_format.md` all coexist. Users can't predict the naming style for the next command.

**Before**:
```
commands/
├── run-audit.md
├── runValidator.md
└── check_format.md
```

**After**:
```
commands/
├── run-audit.md
├── run-validator.md
└── check-format.md
```

**Fix**: Standardize on kebab-case (the convention for Claude Code). Rename all components. Update README and any references.

---

## Coherence

### 12. Agent References Missing Skill

**Problem**: An agent's description says it uses skill `foo`, but skill `foo` doesn't exist in this plugin or anywhere the user has installed.

**Symptoms**: User invokes the agent. The agent tries to load `foo` via the Skill tool and errors, or behaves degenerately because the skill never loads.

**Before**:
```yaml
# agents/auditor.md
---
name: auditor
description: Audits code using the deep-analyzer skill for parsing.
---
```
(But there is no `deep-analyzer` skill anywhere.)

**After**: Either create the skill, fix the name to a real skill, or document the dependency:
```yaml
---
name: auditor
description: Audits code using deep-analyzer (install separately from acme/cc-plugins).
---
```

**Fix**: Resolve the reference. If `deep-analyzer` should exist in this plugin, add it. If it's external, list it under README's Dependencies. If it was renamed, fix the reference.

---

### 13. Hook Fires On Wrong Event

**Problem**: Hook's `matcher` doesn't match the events its command logic actually expects, or the hook's command operates on data the matcher doesn't deliver.

**Symptoms**: Hook never fires when expected, or fires constantly with no useful effect. Hook command receives different JSON shape than its parser assumes.

**Before**:
```json
{
  "hooks": [
    {
      "matcher": "PostToolUse",
      "hooks": [
        {"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/on-prompt-submit.sh"}
      ]
    }
  ]
}
```
(The script name says "prompt-submit" but the matcher is "PostToolUse" — mismatch.)

**After**:
```json
{
  "hooks": [
    {
      "matcher": "UserPromptSubmit",
      "hooks": [
        {"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/on-prompt-submit.sh"}
      ]
    }
  ]
}
```

**Fix**: Cross-check matcher and command intent. Use `plugin-dev`'s `hook-development` skill for the canonical matcher list and the JSON shape each matcher delivers.

---

### 14. MCP Server Configured But Undocumented

**Problem**: `.mcp.json` declares an MCP server requiring env vars (e.g., `GITHUB_TOKEN`), but README never mentions the env vars. Users install, run, and silently get permission errors.

**Symptoms**: Plugin functions partially or not at all. Errors point at missing tokens. README says nothing about required configuration.

**Before**: `.mcp.json`:
```json
{
  "mcpServers": {
    "github": {
      "command": "github-mcp",
      "env": {"GITHUB_TOKEN": "${GITHUB_TOKEN}"}
    }
  }
}
```
README has no Configuration section.

**After**: README:
```markdown
## Configuration

This plugin requires the following environment variables:

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` | Personal access token for the github MCP server (scopes: repo, read:user) |
```

**Fix**: Every `${VAR}` in `.mcp.json` must appear in README's Configuration section with purpose and any required scopes. The Lightweight Mode check PR3 catches this.
