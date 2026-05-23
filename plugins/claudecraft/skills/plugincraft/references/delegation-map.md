# Delegation Map

Plugincraft is intentionally narrow: it covers plugin-level concerns that no other tool addresses (cross-component coherence, marketplace coherence, README quality, publish readiness, anti-patterns). For component-level depth, plugincraft delegates to upstream tools rather than duplicating their content.

This file is the contract: what plugincraft delegates, to whom, and how.

---

## Delegation Table

| Concern | Delegated to | How invoked | What plugincraft adds |
|---|---|---|---|
| Manifest schema validation (deep) | `plugin-dev`'s `plugin-validator` agent | Agent tool, `subagent_type: plugin-validator` | Cross-component checks plugin-validator can't see (PX category) |
| Component schema validation | `plugin-dev`'s `plugin-validator` agent | Same as above | Plugin-level aggregation of per-component findings |
| Per-skill audit (inside a plugin) | `skillcraft`'s `improve-standard` workflow | `Skill tool: load skillcraft`, then follow `workflows/improve-standard.md` | Plugin-level summary that rolls up per-skill scores |
| Agent quality review (loose fit) | `plugin-dev`'s `skill-reviewer` agent | Optional Agent invocation | Inline PX1 coherence check (agent references existing skills) |
| Component knowledge during Create | `plugin-dev`'s component skills (`plugin-structure`, `hook-development`, `mcp-integration`, etc.) | `Skill tool: load plugin-dev:<skill-name>` per component type | Plugin-level scaffolding, README skeleton, marketplace registration (PR 3) |
| Agent generation during Create | `plugin-dev`'s `agent-creator` agent | `Agent tool: subagent_type: agent-creator` | Plugin-level integration after the agent is created (PR 3) |
| Marketplace.json schema | `plugin-dev`'s `marketplace-management` skill | `Skill tool: load plugin-dev:marketplace-management` for schema reference | Generation strategy + drift prevention (`scripts/marketplace-generate.sh`, `references/marketplace-spec.md`, CI auto-sync in `.github/workflows/marketplace-sync.yml`) |
| Eval pipeline for plugin's skills | `claude-code-evals` (sibling in claudecraft) | `Skill tool: load claude-code-evals` | Nothing — used unchanged for skill-level eval bootstrapping |

---

## Soft Dependency: plugin-dev

Plugincraft is designed to function without `plugin-dev` installed, but degrades gracefully.

### When plugin-dev IS installed

The `improve-standard` workflow invokes `plugin-validator` for manifest and component schema depth, then layers plugincraft's PX/PR/MK/PB checks on top. Reports include the plugin-validator output verbatim, then plugincraft's additions.

### When plugin-dev is NOT installed

The workflow:

1. Detects absence by checking whether `Agent tool: subagent_type: plugin-validator` resolves. (Practically: try to invoke; on failure, fall back.)
2. Warns once per workflow invocation: `plugin-dev is not installed; running plugincraft-only checks. Install with: /plugin install plugin-dev@claude-plugins-official`
3. Substitutes inline minimal checks for what plugin-validator would have covered:
   - PM1-PM6 (already covered by plugincraft's own checklist)
   - PC1-PC4 (already covered as smoke checks)
   - No per-component deep validation
4. Continues with PX/PR/MK/PB/anti-patterns as normal.

### When plugin-dev is partially helpful

Some `plugin-dev` skills are loose fits for plugincraft's purposes:

- `skill-reviewer` is optimized for individual skill review, not coherence across a plugin's skills. Plugincraft uses it opportunistically for per-skill quality when `skillcraft` is unavailable, but the canonical path for skills inside a plugin is to delegate to `skillcraft`.
- `marketplace-management` documents schemas but does not generate or audit cross-plugin coherence. Plugincraft uses it as a schema reference (PR 2) but layers generation and drift prevention on top.

---

## Hard Dependency: skillcraft

Plugincraft hard-depends on `skillcraft` (its sibling in `claudecraft`) for every skill-level concern inside a plugin. If a plugin contains skills, plugincraft's `improve-standard` workflow loads `skillcraft` and invokes its `improve-standard` workflow per skill.

This is a hard dependency because skill-level rigor is the same regardless of where a skill lives (personal directory, plugin, or project-local). Reimplementing it in plugincraft would create drift the moment skillcraft adds a new check.

Both skills ship in the same plugin (`claudecraft`), so the dependency is satisfied by definition for any user who installed `plugincraft`.

---

## What Plugincraft Does NOT Delegate

These are areas where plugincraft owns the concern because no upstream tool covers it:

- **Cross-component coherence (PX category)**: dangling skill references, hook path resolution, MCP server reference cohesion, command tool consistency, name collisions, trigger overlap.
- **Marketplace coherence (MK category)**: presence in `plugins[]`, description drift between `plugin.json` and `marketplace.json`, source path resolution.
- **Marketplace generation**: regenerating `plugins[]` from constituent `plugin.json` files (`scripts/marketplace-generate.sh`). Drift prevention by construction; CI-enforced via `.github/workflows/marketplace-sync.yml`.
- **README quality (PR category)**: structural presence, required env var documentation, component listing matching reality.
- **Publish readiness (PB category)**: version, license, changelog, install instructions.
- **Bulk audit**: walking every installed plugin, producing a summary table, routing into selective fix loops.
- **Plugin-level anti-pattern catalogue**: 14 patterns covering structural, distribution, naming, coherence problems specific to plugins (not just components).
