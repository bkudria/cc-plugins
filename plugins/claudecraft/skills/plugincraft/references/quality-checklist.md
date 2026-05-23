# Plugin Quality Checklist

32 checks across 7 categories. Each item has: ID, description, pass/fail criteria, fix guidance.

Apply all checks when running a full audit. For lightweight mode, apply only PM1, PM2, PS1, PS2, PR1, and (when a parent marketplace.json exists) MK1.

Delegations: PC checks are intentionally light because Anthropic's `plugin-dev` plugin's `plugin-validator` agent covers component-level depth. The `improve-standard` workflow runs `plugin-validator` first and reports its findings under PC; this checklist treats PC as a smoke layer.

---

## Plugin Manifest (PM1-PM6)

### PM1: plugin.json Exists
- **Check**: Plugin directory contains `.claude-plugin/plugin.json`
- **Pass**: File exists at `<plugin-dir>/.claude-plugin/plugin.json`
- **Fail**: File missing, or located at plugin root instead of inside `.claude-plugin/`
- **Fix**: Create `.claude-plugin/plugin.json` (the `.claude-plugin/` directory is required even for single-component plugins)

### PM2: Valid JSON
- **Check**: `plugin.json` parses as valid JSON
- **Pass**: `jq . .claude-plugin/plugin.json` exits 0
- **Fail**: Parse error, trailing commas, comments, or unquoted keys
- **Fix**: Run through `jq` and fix the reported error

### PM3: Required Name Field
- **Check**: `plugin.json` has a `name` field that is a non-empty string
- **Pass**: `"name": "my-plugin"` present
- **Fail**: Missing, empty, or non-string
- **Fix**: Add a `name` field matching the plugin directory name

### PM4: Name Is Kebab-Case
- **Check**: `name` is lowercase kebab-case, no spaces or underscores
- **Pass**: `my-plugin`, `code-review-helper`
- **Fail**: `MyPlugin`, `my_plugin`, `My Plugin`
- **Fix**: Rename to lowercase-with-hyphens. Rename the directory to match.

### PM5: Description Length And Voice
- **Check**: `description` field is present, 10-1024 characters, in third-person or imperative voice
- **Pass**: `"Audit Claude Code plugins for quality issues..."` within length bounds
- **Fail**: Missing; under 10 chars; over 1024 chars; second-person (`"You can..."`)
- **Fix**: Rewrite imperatively. Include the verbs and nouns that trigger auto-discovery.

### PM6: Version Is Semver
- **Check**: If `version` is present, it follows semver (`MAJOR.MINOR.PATCH`)
- **Pass**: `"0.1.0"`, `"1.2.3"`, `"2.0.0-beta.1"`
- **Fail**: `"v1"`, `"1.0"`, `"latest"`
- **Fix**: Use full semver. For a first release, `0.1.0` is conventional.

---

## Plugin Structure (PS1-PS5)

### PS1: Standard Component Directories
- **Check**: Component directories use the canonical names: `commands/`, `agents/`, `skills/`, `hooks/`, plus root-level `hooks.json` and `.mcp.json`
- **Pass**: Only canonical names are used
- **Fail**: `command/` (singular), `Skills/` (capitalized), or non-standard like `tools/`
- **Fix**: Rename to canonical form. Claude Code only discovers components in the canonical paths.

### PS2: Components At Plugin Root, Not Inside `.claude-plugin/`
- **Check**: Component directories (`commands/`, `agents/`, `skills/`, `hooks/`) live at the plugin root, not inside `.claude-plugin/`
- **Pass**: `<plugin-dir>/skills/foo/SKILL.md`
- **Fail**: `<plugin-dir>/.claude-plugin/skills/foo/SKILL.md`
- **Fix**: Move component dirs to the plugin root. Only `plugin.json` and `marketplace.json` belong inside `.claude-plugin/`.

### PS3: `${CLAUDE_PLUGIN_ROOT}` In Path References
- **Check**: Any hook command or MCP server config that references a file inside the plugin uses `${CLAUDE_PLUGIN_ROOT}`
- **Pass**: `"command": "${CLAUDE_PLUGIN_ROOT}/hooks/check.sh"`
- **Fail**: Hardcoded paths (`/Users/...`, `./hooks/check.sh`, `~/.claude/plugins/...`)
- **Fix**: Replace hardcoded paths with `${CLAUDE_PLUGIN_ROOT}/...`. Plugins are installed under user-specific paths.

### PS4: No Hardcoded User Paths
- **Check**: No file in the plugin contains a hardcoded `/Users/`, `/home/`, or `~/.claude/` path that should be portable
- **Pass**: Examples use placeholder paths (`<plugin-dir>/...`) or env vars
- **Fail**: Hardcoded author's home directory leaked into a hook, script, or README example
- **Fix**: Replace with `${CLAUDE_PLUGIN_ROOT}` or a placeholder

### PS5: File Naming Kebab-Case
- **Check**: Files and directories under component dirs use lowercase kebab-case
- **Pass**: `skills/my-skill/`, `commands/run-audit.md`
- **Fail**: `skills/MySkill/`, `commands/runAudit.md`, `commands/run_audit.md`
- **Fix**: Rename to kebab-case. Update any references.

---

## Plugin Components (PC1-PC4)

These checks are deliberately shallow. The `improve-standard` workflow delegates component-level depth to `plugin-dev`'s `plugin-validator` agent. PC here is a smoke layer that catches things the workflow needs to know before deep checks can run.

### PC1: Declared Skills Have SKILL.md
- **Check**: Every directory under `skills/` contains a `SKILL.md` file
- **Pass**: `skills/foo/SKILL.md` exists for every `skills/foo/`
- **Fail**: A `skills/foo/` directory with no `SKILL.md` (orphan skill scaffold)
- **Fix**: Add the missing `SKILL.md`, or remove the empty directory

### PC2: Commands And Agents Have Frontmatter
- **Check**: Every `commands/*.md` and `agents/*.md` starts with YAML frontmatter delimited by `---`
- **Pass**: File begins `---\nname: ...\n---`
- **Fail**: No frontmatter, malformed YAML, or unclosed delimiter
- **Fix**: Add `---`-delimited YAML frontmatter with at least a `name` field

### PC3: `hooks.json` Parses
- **Check**: If `hooks.json` exists at plugin root, it parses as valid JSON
- **Pass**: `jq . hooks.json` exits 0
- **Fail**: Parse error
- **Fix**: Run through `jq` and fix the reported error. Then run `plugin-validator` for schema validation.

### PC4: `.mcp.json` Parses
- **Check**: If `.mcp.json` exists at plugin root, it parses as valid JSON
- **Pass**: `jq . .mcp.json` exits 0
- **Fail**: Parse error
- **Fix**: Run through `jq` and fix the reported error. Then run `plugin-validator` for schema validation.

---

## Cross-Component Coherence (PX1-PX6)

These checks look across components — what `plugin-validator` cannot easily see when validating each component in isolation. See `component-coherence.md` for detection recipes.

### PX1: Agent References Existing Skills
- **Check**: When an agent's description mentions invoking a skill, that skill exists in this plugin or is documented as an external dependency
- **Pass**: `description: "...uses the skillcraft skill"` and `skills/skillcraft/SKILL.md` exists (or is listed under Dependencies as external)
- **Fail**: Description names a skill that doesn't exist anywhere
- **Fix**: Create the missing skill, fix the name, or document the external dependency in README

### PX2: Hook Command Paths Resolve
- **Check**: Every `command` in `hooks.json` resolves to an existing file (after `${CLAUDE_PLUGIN_ROOT}` expansion)
- **Pass**: `${CLAUDE_PLUGIN_ROOT}/hooks/foo.sh` and `hooks/foo.sh` exists
- **Fail**: Hook references a script that was deleted, moved, or never created
- **Fix**: Create the missing file, fix the path, or remove the hook entry

### PX3: MCP Server Names Referenced Cohesively
- **Check**: If any skill, command, or agent mentions an MCP server name (e.g., `mcp__github__create_issue`), that server is declared in `.mcp.json`
- **Pass**: All `mcp__*` tool prefixes match servers in `.mcp.json`
- **Fail**: Skill mentions `mcp__github__*` but `.mcp.json` has no `github` server (or no `.mcp.json` exists)
- **Fix**: Add the server to `.mcp.json`, or remove the dangling reference

### PX4: Command `allowed-tools` Matches Body Usage
- **Check**: For each `commands/*.md`, if `allowed-tools` is set in frontmatter, it includes every tool the body instructs Claude to use
- **Pass**: Body says "use Read and Edit" and frontmatter has `allowed-tools: [Read, Edit]`
- **Fail**: Body says "run the script" but `allowed-tools` excludes `Bash`
- **Fix**: Add missing tools to `allowed-tools`, or remove the restriction entirely

### PX5: No Name Collisions Between Components
- **Check**: No two components share a name across categories (a `commands/foo.md` and a `skills/foo/` cause confusion in `/help`)
- **Pass**: Every component name is unique within the plugin
- **Fail**: `commands/audit.md` and `skills/audit/` coexist
- **Fix**: Rename one. Prefer to rename the less-used one; update all references.

### PX6: No Trigger-Phrase Collision Between Skills
- **Check**: When two skills in the same plugin both auto-trigger, their descriptions do not promise overlapping trigger phrases
- **Pass**: Each skill's `description` triggers describe distinct scenarios
- **Fail**: Two skills both claim "TRIGGER when: editing markdown" — the model can't disambiguate
- **Fix**: Narrow one skill's triggers, or merge the skills if they overlap heavily

---

## Plugin README (PR1-PR4)

### PR1: README Exists At Plugin Root
- **Check**: `README.md` exists at the plugin root (NOT inside `.claude-plugin/`)
- **Pass**: `<plugin-dir>/README.md` present
- **Fail**: Missing, or only inside `.claude-plugin/`
- **Fix**: Add `README.md` at the plugin root. Start with a one-line description matching `plugin.json`'s `description`.

### PR2: README Has Overview, Installation, Usage
- **Check**: README contains sections for overview/what-it-is, installation, and usage
- **Pass**: Has headings (or equivalent prose) for all three
- **Fail**: Just a title and a one-liner, with no sections
- **Fix**: Add the three sections. Even minimal stubs beat absent ones.

### PR3: README Documents Required Env Vars
- **Check**: If the plugin uses MCP servers that require env vars (API keys, tokens), those vars are listed in README
- **Pass**: README has an "Environment" or "Configuration" section listing every `${VAR}` referenced by `.mcp.json`
- **Fail**: `.mcp.json` references `${GITHUB_TOKEN}` but README never mentions it
- **Fix**: Add an Environment section listing every required var and what it's for

### PR4: Component Listing Matches Reality
- **Check**: If README lists the plugin's skills/commands/agents/hooks, the listing matches what's actually in the plugin
- **Pass**: README says "ships three skills" and `skills/` contains three directories
- **Fail**: README claims a skill that was removed, or omits a recently added one
- **Fix**: Update README. This is the most common form of doc drift.

---

## Marketplace (MK1-MK3)

These checks apply only when the plugin lives inside a marketplace (a parent or sibling directory has `.claude-plugin/marketplace.json` listing this plugin).

### MK1: Plugin Appears In Marketplace `plugins[]`
- **Check**: If a parent or sibling `.claude-plugin/marketplace.json` exists, this plugin appears in its `plugins[]` array
- **Pass**: `marketplace.json` has an entry whose `source` resolves to this plugin directory
- **Fail**: Plugin exists in the marketplace tree but is not listed (won't install)
- **Fix**: Add an entry to `marketplace.json` with at least `name`, `description`, and `source`

### MK2: Marketplace Description Matches plugin.json
- **Check**: The `description` in the marketplace entry matches the `description` in this plugin's `plugin.json` byte-for-byte
- **Pass**: Strings are identical
- **Fail**: Marketplace description is stale (e.g., still says "2 skills" while plugin.json says "3 skills"). Users install based on the marketplace description, then discover the plugin does more (or less) than promised.
- **Fix**: Update the marketplace entry to match. If plugins-many, prefer regenerating `marketplace.json` from constituent `plugin.json` files via a script (see PR 2's `marketplace-generate.sh`) so this can't drift.

### MK3: Source Path Resolves
- **Check**: The marketplace entry's `source` resolves to the plugin's actual location (relative path from marketplace root)
- **Pass**: `source: "./plugins/foo"` and `plugins/foo/.claude-plugin/plugin.json` exists
- **Fail**: `source` points to a path that doesn't exist (rename or move broke it)
- **Fix**: Correct the `source` value. For source formats other than relative path (git, github, etc.), verify per the marketplace.json schema.

---

## Publish Readiness (PB1-PB4)

These checks gate the decision to publish a plugin to a shared marketplace or wider audience. They are advisory before publish, not blocking for normal use.

### PB1: Version > 0.0.x
- **Check**: `version` is at least `0.1.0`
- **Pass**: Any version where `MINOR ≥ 1` or `MAJOR ≥ 1`
- **Fail**: `0.0.1` or absent (signals "still scaffolding, not ready for users")
- **Fix**: Bump version to `0.1.0` once the plugin is usable end-to-end

### PB2: LICENSE File At Plugin Root
- **Check**: `LICENSE` (or `LICENSE.md`, `LICENSE.txt`) exists at the plugin root
- **Pass**: A license file present
- **Fail**: No license — users cannot legally redistribute or modify
- **Fix**: Add a LICENSE file. MIT and Apache-2.0 are common defaults for plugins.

### PB3: CHANGELOG Or Version History Mentioned
- **Check**: `CHANGELOG.md` exists, OR README has a "Changes" / "History" section, OR git tags exist
- **Pass**: Some form of version history a user can consult
- **Fail**: No way to tell what changed between versions
- **Fix**: Add `CHANGELOG.md` with at least the current version. Keep-A-Changelog format is conventional.

### PB4: Install Instructions Explicit
- **Check**: README's Installation section gives copy-pasteable commands, not just "install this plugin"
- **Pass**: Shows the exact `/plugin install` command or marketplace-add steps
- **Fail**: Hand-wavy "add to your marketplace and install"
- **Fix**: Add the exact commands. Test by following your own instructions in a fresh session.
