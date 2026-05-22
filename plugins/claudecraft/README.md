# claudecraft

Create, audit, and evaluate Claude Code skills.

## What's in this plugin

claudecraft bundles two skills that share a domain (Claude Code skills and their evaluation) but operate at different layers:

- **[skillcraft](skills/skillcraft/SKILL.md)** — discipline and tooling for creating, auditing, improving, and updating skills. Acts on skill files directly.
- **[claude-code-evals](skills/claude-code-evals/SKILL.md)** — reference for the `scuttlerun` / `pincenez` / `craboodle` eval pipeline used to evaluate any Claude Code configuration (skills, CLAUDE.md, hooks, MCP servers, sub-agents). Acts as a manual.

## Why the two skills have different shapes

The two skills serve different functions, and their directories reflect that:

| Skill | Shape | Why |
|-------|-------|-----|
| skillcraft | `SKILL.md` + `references/` + `workflows/` + `scripts/` + `provenance.yml` | An active toolkit. `workflows/` holds procedures the skill executes (Create, Improve, Bootstrap Evals, Update, …). `scripts/` holds shell helpers those workflows invoke. `provenance.yml` tracks upstream sources the skill folds in. |
| claude-code-evals | `SKILL.md` + `references/` | A reference manual. The tools it describes (`scuttlerun`, `pincenez`, `craboodle`) live in their own repos and have their own CLIs; this skill explains how to use them, not how to be them. No workflows or scripts because the skill does not drive procedures. |

The shape difference is intentional and not a sign of one skill being more complete than the other.

## How the skills relate

- skillcraft's Bootstrap Evals workflow (in `skillcraft/workflows/bootstrap-evals.md`) depends on the eval pipeline that claude-code-evals documents. Skillcraft's Behavioral Edit Testing gate also assumes that pipeline.
- claude-code-evals is independently useful for evaluating any Claude Code configuration, not just skills. It does not depend on skillcraft.

## Auto-trigger behaviour

Each skill is auto-loaded by its own description string. See each `SKILL.md` for trigger conditions:

- skillcraft: loads on any read/edit/write to skill content (lightweight checks)
- claude-code-evals: loads when evaluating a configuration, writing scenarios, designing checks, interpreting results
