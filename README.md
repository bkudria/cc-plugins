# bkudria/cc-plugins

A Claude Code plugin marketplace by Benjamin Kudria.

## What this is

A marketplace for Claude Code plugins. See the catalog below for current entries. Plugins live under `plugins/`; the marketplace manifest lives at `.claude-plugin/marketplace.json`.

## Installation

In Claude Code:

    /plugin marketplace add bkudria/cc-plugins
    /plugin install <name>@bkudria-cc-plugins
    /reload-plugins

Replace `<name>` with a plugin name from the catalog below. See per-plugin sections below for the exact commands.

## Plugin catalog

| Plugin | Description | README |
|--------|-------------|--------|
| [`claudecraft`](plugins/claudecraft/) | Create, audit, and publish Claude Code skills and plugins. Bundles skillcraft (skill authoring discipline), claude-code-evals (eval pipeline reference), and plugincraft (plugin authoring + marketplace lifecycle). | [plugins/claudecraft/README.md](plugins/claudecraft/README.md) |
| [`projects`](plugins/projects/) | Audit a project's standards compliance or scaffold a new one, driven by declarative project.yaml profiles. | [plugins/projects/README.md](plugins/projects/README.md) |
| [`sessions`](plugins/sessions/) | Investigate past Claude Code sessions from their transcripts with cc-sessions, an agent-oriented CLI that reads the current transcript format correctly and keeps its output bounded. | [plugins/sessions/README.md](plugins/sessions/README.md) |
| [`triage`](plugins/triage/) | Assess a scope to produce findings, then address them one-by-one. | [plugins/triage/README.md](plugins/triage/README.md) |

### claudecraft

    /plugin install claudecraft@bkudria-cc-plugins

Bundles three skills:

- **skillcraft** — discipline and tooling for creating, auditing, improving, and updating skills
- **claude-code-evals** — reference manual for the `scuttlerun` / `pincenez` / `craboodle` eval pipeline, and when to use the official `claude plugin eval` instead
- **plugincraft** — discipline and tooling for creating, auditing, and publishing whole Claude Code plugins; manages marketplace entries

See [plugins/claudecraft/README.md](plugins/claudecraft/README.md) for the full breakdown of how the three skills relate.

### projects

    /plugin install projects@bkudria-cc-plugins

One skill for project standards compliance:

- **standards** — audit an existing project against the standards its `project.yaml` selects, or scaffold a new project from those profiles. Standards are self-contained YAML files under `profiles/`; the model is language- and tool-agnostic, inspecting the project itself rather than reading declarations.

Auto-triggers on "audit this project", "check compliance", "new project", and similar. See [plugins/projects/README.md](plugins/projects/README.md) for the audit/scaffold workflows and the `project.yaml` schema.

### sessions

    /plugin install sessions@bkudria-cc-plugins

Ships `cc-sessions`, a read-only CLI for answering questions about past sessions from their transcripts: which sessions exist, where text appears, what a session did, what the human asked, which tools and sub-agents ran and with what results. While the plugin is enabled, `cc-sessions` is on `PATH` in the session's Bash tool; `cc-sessions --help` is its reference. See [plugins/sessions/README.md](plugins/sessions/README.md).

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
    │       ├── marketplace-sync.yml  # CI auto-sync
    │       ├── plugin-validate.yml   # CI plugin validation
    │       └── sessions-tests.yml    # CI tests for the sessions plugin
    └── plugins/
        ├── claudecraft/
        │   ├── .claude-plugin/plugin.json
        │   ├── README.md
        │   └── skills/
        │       ├── claude-code-evals/
        │       ├── plugincraft/
        │       └── skillcraft/
        ├── projects/
        │   ├── .claude-plugin/plugin.json
        │   ├── README.md
        │   └── skills/
        │       └── standards/
        ├── sessions/
        │   ├── .claude-plugin/plugin.json
        │   ├── README.md
        │   ├── bin/cc-sessions
        │   ├── lib/
        │   ├── libexec/
        │   └── tests/
        └── triage/
            ├── .claude-plugin/plugin.json
            ├── README.md
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
