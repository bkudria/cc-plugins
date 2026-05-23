# bkudria/cc-plugins

A Claude Code plugin marketplace by Benjamin Kudria.

## What this is

A small marketplace bundling two plugins for Claude Code: `claudecraft` (skill, eval, and plugin authoring tooling) and `triage` (assess-then-iterate workflow for batch processing findings). Plugins live under `plugins/`; the marketplace manifest lives at `.claude-plugin/marketplace.json`.

## Installation

In Claude Code:

    /plugin marketplace add bkudria/cc-plugins
    /plugin install <name>@bkudria-cc-plugins
    /reload-plugins

Replace `<name>` with `claudecraft` or `triage`. See per-plugin sections below for the exact commands.

## Plugin catalog

| Plugin | Description | README |
|--------|-------------|--------|
| [`claudecraft`](plugins/claudecraft/) | Create, audit, and publish Claude Code skills and plugins. Bundles skillcraft (skill authoring discipline), claude-code-evals (eval pipeline reference), and plugincraft (plugin authoring + marketplace lifecycle). | [plugins/claudecraft/README.md](plugins/claudecraft/README.md) |
| [`triage`](plugins/triage/) | Assess a scope to produce findings, then address them one-by-one. | [plugins/triage/README.md](plugins/triage/README.md) |

### claudecraft

    /plugin install claudecraft@bkudria-cc-plugins

Bundles three skills:

- **skillcraft** — discipline and tooling for creating, auditing, improving, and updating skills
- **claude-code-evals** — reference manual for the `scuttlerun` / `pincenez` / `craboodle` eval pipeline
- **plugincraft** — discipline and tooling for creating, auditing, and publishing whole Claude Code plugins; manages marketplace entries

See [plugins/claudecraft/README.md](plugins/claudecraft/README.md) for the full breakdown of how the three skills relate.

### triage

    /plugin install triage@bkudria-cc-plugins

Two skills supporting an assess-then-iterate workflow:

- **assess** — investigate a scope and produce a structured, numbered findings assessment
- **iterate** — process the findings one-by-one with per-item approval

Invoke via the `/triage:assess` and `/triage:iterate` slash commands.

## Repository layout

    cc-plugins/
    ├── .claude-plugin/
    │   └── marketplace.json          # marketplace manifest (auto-regenerated)
    ├── .github/
    │   └── workflows/
    │       └── marketplace-sync.yml  # CI auto-sync
    └── plugins/
        ├── claudecraft/
        │   ├── .claude-plugin/plugin.json
        │   ├── README.md
        │   └── skills/
        │       ├── claude-code-evals/
        │       ├── plugincraft/
        │       └── skillcraft/
        └── triage/
            ├── .claude-plugin/plugin.json
            └── skills/
                ├── assess/
                └── iterate/

## How the marketplace stays in sync

Each plugin's `plugin.json` is the source of truth for `name` and `description`. The script `plugins/claudecraft/skills/plugincraft/scripts/marketplace-generate.sh` regenerates `.claude-plugin/marketplace.json` from constituent `plugin.json` files, preserving hand-edited per-entry fields (`source`, `category`, `homepage`, `keywords`) and all top-level marketplace fields.

The `.github/workflows/marketplace-sync.yml` workflow runs on PRs and pushes to `main` that touch any `plugin.json` or `marketplace.json`. On drift it auto-regenerates and commits the result back to the PR branch. See `plugins/claudecraft/skills/plugincraft/references/marketplace-spec.md` for what the generator rewrites vs preserves.

## Contributing

Issues are currently disabled on this repository. Open a PR or contact the owner directly.

## License

[MIT](LICENSE). Each plugin also carries its own `LICENSE` file at `plugins/<name>/LICENSE`.
