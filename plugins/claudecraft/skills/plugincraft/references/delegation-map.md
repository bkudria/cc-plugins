# Delegation Map

Plugincraft is intentionally narrow: it covers plugin-level concerns the official tooling does not (cross-component coherence, marketplace generation and drift, README depth, the publish-readiness items the CLI skips, bulk audit). Everything the official tooling covers is delegated to it rather than re-implemented.

This file is the contract: what plugincraft delegates, to whom, and how.

---

## Delegation Table

| Concern | Delegated to | How invoked | What plugincraft adds |
|---|---|---|---|
| Manifest schema, component frontmatter, `hooks.json` / `.mcp.json` parsing, README presence and length, license, README install line | `claude plugin validate` | `claude plugin validate --strict <plugin-dir>` (and `<marketplace-root>` for the marketplace) | Structural checks the CLI does not run: description length, semver shape, component placement, kebab-case component names (`scripts/quick-validate.sh`) |
| Anthropic directory submission rules | `claude plugin validate --profile directory` | `claude plugin validate --strict --profile directory <plugin-dir>` | Points to the [pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist) for the safety scan and policy review the CLI does not run |
| Scaffolding a plugin | `/plugin-dev:create-plugin` when plugin-dev is enabled; `claude plugin init <name>` for a personal plugin under `~/.claude/skills/`; the [official layout](https://code.claude.com/docs/en/plugins/create) otherwise | See SKILL.md § Create | Marketplace registration via `scripts/marketplace-generate.sh`, then validation |
| Component authoring knowledge (hooks, MCP, agents, commands) | plugin-dev's component skills when enabled; the [components docs](https://code.claude.com/docs/en/plugins/components) otherwise | `Skill tool: load plugin-dev:<skill-name>`, or WebFetch the docs page | Nothing — component depth is upstream's |
| Per-skill creation and audit (inside a plugin) | `skillcraft` | `Skill tool: load skillcraft`, then its Create mode or `workflows/improve-standard.md` | Plugin-level summary that rolls up per-skill scores |
| Marketplace.json schema | [Marketplace docs](https://code.claude.com/docs/en/plugins/publish#publish-through-your-own-marketplace) and `claude plugin validate` | Validate the marketplace root | Generation strategy + drift prevention (`scripts/marketplace-generate.sh`, `references/marketplace-spec.md`, CI auto-sync in `.github/workflows/marketplace-sync.yml`) |
| Eval pipeline (skills inside a plugin) | `claude-code-evals` + `skillcraft` (both sibling in claudecraft) | `Skill tool: load claude-code-evals`; `skillcraft`'s `workflows/bootstrap-evals.md` | Nothing — skill eval is location-agnostic |
| Eval pipeline (plugin as a bundle) | `claude-code-evals` (sibling in claudecraft), which picks between `claude plugin eval` and craboodle | `Skill tool: load claude-code-evals`; see its § Choosing a Runner | `workflows/bootstrap-evals.md` — bootstrap of plugin-level craboodle coverage (cross-component bundle scenarios) |

---

## Optional: plugin-dev

Anthropic's `plugin-dev` plugin (`/plugin install plugin-dev@claude-plugins-official`) adds a guided `/plugin-dev:create-plugin` flow and component-authoring skills. Plugincraft uses them when they are enabled and falls back to the official docs when they are not. Nothing in plugincraft requires plugin-dev.

## Hard Dependency: skillcraft

Plugincraft hard-depends on `skillcraft` (its sibling in `claudecraft`) for every skill-level concern inside a plugin. If a plugin contains skills, plugincraft's `improve-standard` workflow loads `skillcraft` and invokes its `improve-standard` workflow per skill.

This is a hard dependency because skill-level rigor is the same regardless of where a skill lives (personal directory, plugin, or project-local). Reimplementing it in plugincraft would create drift the moment skillcraft adds a new check.

Both skills ship in the same plugin (`claudecraft`), so the dependency is satisfied by definition for any user who installed `plugincraft`.

---

## What Plugincraft Does NOT Delegate

These are areas where plugincraft owns the concern because the official tooling does not cover it:

- **Structural pre-flight** (`scripts/quick-validate.sh`): description length, semver shape, components at the plugin root rather than inside `.claude-plugin/`, `${CLAUDE_PLUGIN_ROOT}` in hook and MCP paths, kebab-case component names, README presence (the CLI checks it only under `--profile directory`), marketplace listing.
- **Cross-component coherence (PX category)**: dangling skill references, hook path resolution, MCP server reference cohesion, command tool consistency, name collisions, trigger overlap.
- **Marketplace coherence (MK category)**: presence in `plugins[]`, description drift between `plugin.json` and `marketplace.json`, source path resolution.
- **Marketplace generation**: regenerating `plugins[]` from constituent `plugin.json` files (`scripts/marketplace-generate.sh`). Drift prevention by construction; CI-enforced via `.github/workflows/marketplace-sync.yml`.
- **README depth (PR2-PR4)**: sections, required env var documentation, component listing matching reality.
- **Publish readiness the CLI skips (PB1, PB3)**: a released version, changelog or version history.
- **Plugin eval suite audit (PE category)**: whether the plugin ships an eval suite. Filesystem-only check.
- **Bulk audit**: walking every installed plugin, producing a summary table, routing into selective fix loops.
- **Plugin-level anti-pattern catalogue**: 14 patterns covering structural, distribution, naming, coherence problems specific to plugins.
