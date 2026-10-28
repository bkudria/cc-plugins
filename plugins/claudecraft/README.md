# claudecraft

Create, audit, and publish Claude Code skills and plugins.

## What's in this plugin

claudecraft bundles three skills that share a domain (Claude Code artifacts — skills, evals, and plugins) but operate at different layers:

- **[skillcraft](skills/skillcraft/SKILL.md)** — discipline and tooling for creating, auditing, improving, and updating skills. Acts on skill files directly.
- **[claude-code-evals](skills/claude-code-evals/SKILL.md)** — reference for the `scuttlerun` / `pincenez` / `craboodle` eval pipeline used to evaluate any Claude Code configuration (skills, CLAUDE.md, hooks, MCP servers, sub-agents), and for choosing between it and the official `claude plugin eval` runner. Acts as a manual.

## Official tooling first

claudecraft defers to Anthropic's tooling wherever it covers the job, and keeps custom tooling only where it does not:

| Job | Official tool used | What claudecraft adds |
|-----|--------------------|-----------------------|
| Drafting a skill and tuning its description | `skill-creator` | craboodle eval coverage for the new skill |
| Skill format and frontmatter reference | [skills docs](https://code.claude.com/docs/en/skills) | Writing, naming, anti-pattern, and testing guidance; upstream provenance tracking |
| Scaffolding a plugin | `/plugin-dev:create-plugin`, `claude plugin init`, [create docs](https://code.claude.com/docs/en/plugins/create) | Marketplace registration via `marketplace-generate.sh` |
| Validating a plugin, publish readiness | `claude plugin validate --strict` (`--profile directory`) | Structural checks the CLI skips, cross-component coherence, marketplace drift, bulk audit |
| Single-prompt plugin evals | `claude plugin eval` | — |
| Multi-turn evals, CLAUDE.md/settings evals, check linting | — | craboodle / scuttlerun / pincenez |
- **[plugincraft](skills/plugincraft/SKILL.md)** — discipline and tooling for creating, auditing, and publishing whole Claude Code plugins; manages marketplace entries and cross-component coherence. Acts on plugin files directly.

## Why the skills have different shapes

The three skills serve different functions, and their directories reflect that:

| Skill | Shape | Why |
|-------|-------|-----|
| skillcraft | `SKILL.md` + `references/` + `workflows/` + `scripts/` + `provenance.yml` | An active toolkit. `workflows/` holds procedures the skill executes (Create, Improve, Bootstrap Evals, Update, …). `scripts/` holds shell helpers those workflows invoke. `provenance.yml` tracks upstream sources the skill folds in. |
| claude-code-evals | `SKILL.md` + `references/` | A reference manual. The tools it describes (`scuttlerun`, `pincenez`, `craboodle`) live in their own repos and have their own CLIs; this skill explains how to use them, not how to be them. No workflows or scripts because the skill does not drive procedures. |
| plugincraft | `SKILL.md` + `references/` + `workflows/` + `scripts/` | An active toolkit (same shape as skillcraft). `workflows/` covers Improve, Bulk Audit, and Bootstrap Evals; Create and Publish are short inline procedures in `SKILL.md` that drive the official CLI. `scripts/` holds the structural validator and the marketplace generator. No `provenance.yml` — plugincraft is original content, not curated from upstream sources. |

The shape differences are intentional and not a sign of one skill being more complete than the others.

## How the skills relate

- skillcraft's Bootstrap Evals workflow (in `skillcraft/workflows/bootstrap-evals.md`) depends on the eval pipeline that claude-code-evals documents. Skillcraft's Behavioral Edit Testing gate also assumes that pipeline.
- plugincraft delegates skill-level audits to skillcraft. When plugincraft's `improve-standard` workflow audits a plugin, it invokes skillcraft on each contained skill — skill rigor stays in one place.
- skillcraft hands drafting of new skills to `skill-creator`, then adds craboodle evals.
- plugincraft delegates manifest, component, and publish-readiness validation to `claude plugin validate`, and uses `plugin-dev` for scaffolding when it is enabled. It layers cross-component coherence, marketplace, README, and bulk-audit checks on top.
- claude-code-evals is independently useful for evaluating any Claude Code configuration, not just skills. It does not depend on skillcraft or plugincraft.

## Auto-trigger behaviour

Each skill is auto-loaded by its own description string. See each `SKILL.md` for trigger conditions:

- skillcraft: loads on any read/edit/write to skill content (lightweight checks)
- claude-code-evals: loads when evaluating a configuration, choosing an eval runner, writing scenarios, designing checks, interpreting results

## Evals

claudecraft's own routing (skill and plugin creation, publish checks, eval-runner choice) is covered by the plugin-level craboodle suite in `evals/`. Run it with `craboodle run plugins/claudecraft`.
- plugincraft: loads on any read/edit/write to plugin content — `plugin.json`, `marketplace.json`, or files under `commands/`, `agents/`, `skills/`, `hooks/`, `.mcp.json` (lightweight checks)
