---
name: plugincraft
description: "MANDATORY load before any Read/Edit/Write to plugin content — plugin.json, marketplace.json, files under commands/, agents/, skills/, hooks/, or .mcp.json — regardless of where the plugin lives (personal ~/.claude/plugins/, marketplace-installed, or project-local). Creates, audits, ships, and maintains Claude Code plugins; manages marketplace entries; validates publish readiness. TRIGGER when: editing/creating/reviewing plugin.json or marketplace.json; creating a new plugin; auditing or improving a plugin; regenerating a marketplace; preparing a plugin to publish; bulk-auditing every installed plugin. DO NOT skip because \"it's only a manifest tweak\" — load first, lightweight checks are cheap."
argument-hint: "[plugin name, path, or 'marketplace']"
---

# Plugin Craft

Create, audit, ship, and maintain Claude Code plugins.

## When to Use

- **Before ANY Read/Edit/Write on a plugin file** — `plugin.json`, `marketplace.json`, files under `commands/`, `agents/`, `skills/`, `hooks/`, `.mcp.json` — wherever the plugin lives (personal `~/.claude/plugins/`, marketplace-installed, or project-local). Load first; the Lightweight Mode checks are cheap and run inline.
- Creating a brand new Claude Code plugin
- Auditing a plugin for quality issues or publish readiness
- Fixing manifest, marketplace, or cross-component coherence problems
- Regenerating a `marketplace.json` from constituent `plugin.json` files
- Bulk-auditing every installed plugin

## Modes

| Mode | Trigger | Workflow |
|------|---------|----------|
| Lightweight | Auto-loaded during plugin file editing | (inline below) |
| Create | `/plugincraft` or `/plugincraft <name>`, or "create a plugin" | (coming in PR 3 — falls back to inline guidance) |
| Improve | `/plugincraft --improve [path]`, or "audit/improve a plugin" | `workflows/improve-standard.md` |
| Bulk Audit | `/plugincraft --all`, or "audit all my plugins" | `workflows/improve-bulk.md` |
| Marketplace Generate | `/plugincraft marketplace`, or "regenerate marketplace.json" | `scripts/marketplace-generate.sh` (interactive workflow doc coming later) |
| Publish | `/plugincraft --publish [path]`, or "is this plugin ready to publish" | (coming in PR 4 — falls back to inline guidance) |

**Mode selection**: If the request mentions "audit all", "bulk", "every plugin", or "check all plugins", use **Bulk Audit**. If it mentions auditing, reviewing, or improving a specific plugin (single name), use **Improve**. If it mentions regenerating the marketplace, syncing marketplace entries, or fixing marketplace drift, use **Marketplace Generate**. If it mentions publish-readiness, "ready to ship", or release prep, use **Publish**. If it specifies a concrete edit to make on a plugin file (e.g., "add a hook to my plugin"), use **Lightweight** mode — the edit is covered by the inline checks. Otherwise default to **Create**.

### Testing Discipline

For skills contained inside a plugin, plugincraft delegates to `skillcraft` — every skill audit goes through skillcraft's `improve-standard` workflow and its Iron Law applies. Plugincraft itself does not yet ship evals; it will be bootstrapped via skillcraft once its design stabilizes.

## Lightweight Mode (Auto-trigger)

When loaded during editing of any file within a plugin directory, apply only these quick checks:

1. **plugin.json valid JSON, has name** — basic manifest sanity (`jq .name .claude-plugin/plugin.json` non-empty)
2. **Name matches directory** — `name` field matches the plugin directory name
3. **Components at root, NOT inside `.claude-plugin/`** — flag any `.claude-plugin/skills/`, `.claude-plugin/commands/`, etc.
4. **`${CLAUDE_PLUGIN_ROOT}` used in path references** — flag hardcoded paths in `hooks.json` and `.mcp.json` commands
5. **README.md present at plugin root** — warn (not fail) if missing
6. **Marketplace entry exists** — if a parent `.claude-plugin/marketplace.json` exists, flag if this plugin is missing from its `plugins[]`

Report issues inline as suggestions. Do NOT run the full checklist or restructure the plugin.

## Improve Quick Reference

| Mode | Scope | Workflow |
|------|-------|----------|
| Standard | Full audit of one plugin | `workflows/improve-standard.md` |
| Bulk | Audit every installed plugin | `workflows/improve-bulk.md` |

### Quick Pre-flight

```bash
${CLAUDE_PLUGIN_ROOT}/skills/plugincraft/scripts/quick-validate.sh <plugin-directory>
${CLAUDE_PLUGIN_ROOT}/skills/plugincraft/scripts/quick-validate.sh --all
```

## Delegation, Not Duplication

Plugincraft complements rather than duplicates upstream tools. See `references/delegation-map.md` for the full mapping. Summary:

| Concern | Delegated to |
|---|---|
| Manifest and component schema depth | `plugin-dev`'s `plugin-validator` agent |
| Per-skill audit inside a plugin | `skillcraft`'s `improve-standard` workflow |
| Component knowledge during Create | `plugin-dev`'s component skills (`plugin-structure`, `hook-development`, etc.) — PR 3 |
| Agent generation during Create | `plugin-dev`'s `agent-creator` agent — PR 3 |

Plugincraft owns the gaps: cross-component coherence (PX), marketplace coherence (MK), README quality (PR), publish readiness (PB), plugin-level anti-patterns, bulk audit, and marketplace generation.

## Anti-Pattern Detection

Consult `references/anti-patterns.md` for 14 common plugin-level problems across 4 categories (Structural, Distribution, Naming, Coherence). When an anti-pattern is detected, cite it by ID + name and show the before/after fix.

For skill-level anti-patterns inside a plugin, delegate to `skillcraft/references/anti-patterns.md` via skillcraft's audit.

## Dependencies

- **jq** — JSON processing (`brew install jq`). Required by `scripts/quick-validate.sh` and detection recipes in `references/component-coherence.md`.
- **git** — used by `workflows/improve-standard.md` to surface recently-touched plugins as audit candidates.
- **skillcraft** (sibling skill in this plugin) — hard dependency. Plugincraft's `improve-standard` workflow loads skillcraft for per-skill audits inside the plugin under review.
- **plugin-dev** (Anthropic's official plugin) — soft dependency. Plugincraft's `improve-standard` invokes `plugin-dev`'s `plugin-validator` agent for manifest and component schema depth. When not installed, plugincraft warns once per workflow invocation and falls back to its own (shallower) PM/PC checks. Install with: `/plugin install plugin-dev@claude-plugins-official`.

## Reference Files

| File | Purpose |
|------|---------|
| `references/quality-checklist.md` | 32-item validation checklist across 7 categories (PM/PS/PC/PX/PR/MK/PB) |
| `references/anti-patterns.md` | 14 plugin-level anti-patterns across 4 categories |
| `references/component-coherence.md` | Detection recipes and fix shapes for the PX category |
| `references/delegation-map.md` | What plugincraft delegates to upstream tools and what it owns directly |
| `references/marketplace-spec.md` | `marketplace.json` schema and what `marketplace-generate.sh` preserves vs rewrites |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/quick-validate.sh` | Fast structural validation (PM, PS, PR1, MK1). Pre-flight before the full audit. |
| `scripts/marketplace-generate.sh` | Regenerate `.claude-plugin/marketplace.json` from constituent `plugin.json` files. Supports `--check` (dry-run, exit 1 on drift) and default-apply. |

## Workflows

| File | Purpose |
|------|---------|
| `workflows/improve-standard.md` | 7-step audit of one plugin: pre-flight → plugin-validator → per-skill skillcraft → PX/PR/MK/PB → anti-patterns → report → fix loop |
| `workflows/improve-bulk.md` | Iterate every installed plugin, produce a summary table, optionally enter fix loops for selected plugins |
