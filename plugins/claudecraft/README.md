# claudecraft

Create, audit, and publish Claude Code skills and plugins.

## What's in this plugin

claudecraft bundles three skills that share a domain (Claude Code artifacts — skills, evals, and plugins) but operate at different layers:

- **[skillcraft](skills/skillcraft/SKILL.md)** — discipline and tooling for creating, auditing, improving, and updating skills. Acts on skill files directly.
- **[claude-code-evals](skills/claude-code-evals/SKILL.md)** — reference for the `scuttlerun` / `pincenez` / `craboodle` eval pipeline used to evaluate any Claude Code configuration (skills, CLAUDE.md, hooks, MCP servers, sub-agents). Acts as a manual.
- **[plugincraft](skills/plugincraft/SKILL.md)** — discipline and tooling for creating, auditing, and publishing whole Claude Code plugins; manages marketplace entries and cross-component coherence. Acts on plugin files directly.

## Why the skills have different shapes

The three skills serve different functions, and their directories reflect that:

| Skill | Shape | Why |
|-------|-------|-----|
| skillcraft | `SKILL.md` + `references/` + `workflows/` + `scripts/` + `provenance.yml` | An active toolkit. `workflows/` holds procedures the skill executes (Create, Improve, Bootstrap Evals, Update, …). `scripts/` holds shell helpers those workflows invoke. `provenance.yml` tracks upstream sources the skill folds in. |
| claude-code-evals | `SKILL.md` + `references/` | A reference manual. The tools it describes (`scuttlerun`, `pincenez`, `craboodle`) live in their own repos and have their own CLIs; this skill explains how to use them, not how to be them. No workflows or scripts because the skill does not drive procedures. |
| plugincraft | `SKILL.md` + `references/` + `workflows/` + `scripts/` | An active toolkit (same shape as skillcraft). `workflows/` covers Improve and Bulk Audit today; Create, Marketplace Generate, and Publish are scaffolded in later PRs. `scripts/` holds the structural validator. No `provenance.yml` — plugincraft is original content, not curated from upstream sources. |

The shape differences are intentional and not a sign of one skill being more complete than the others.

## How the skills relate

- skillcraft's Bootstrap Evals workflow (in `skillcraft/workflows/bootstrap-evals.md`) depends on the eval pipeline that claude-code-evals documents. Skillcraft's Behavioral Edit Testing gate also assumes that pipeline.
- plugincraft delegates skill-level audits to skillcraft. When plugincraft's `improve-standard` workflow audits a plugin, it invokes skillcraft on each contained skill — skill rigor stays in one place.
- plugincraft also complements (not duplicates) Anthropic's official `plugin-dev` plugin: when installed, plugincraft delegates manifest and component schema depth to `plugin-dev`'s `plugin-validator` agent, and layers cross-component coherence, marketplace, README, publish-readiness, and bulk-audit checks on top.
- claude-code-evals is independently useful for evaluating any Claude Code configuration, not just skills. It does not depend on skillcraft or plugincraft.

## Auto-trigger behaviour

Each skill is auto-loaded by its own description string. See each `SKILL.md` for trigger conditions:

- skillcraft: loads on any read/edit/write to skill content (lightweight checks)
- claude-code-evals: loads when evaluating a configuration, writing scenarios, designing checks, interpreting results
- plugincraft: loads on any read/edit/write to plugin content — `plugin.json`, `marketplace.json`, or files under `commands/`, `agents/`, `skills/`, `hooks/`, `.mcp.json` (lightweight checks)
