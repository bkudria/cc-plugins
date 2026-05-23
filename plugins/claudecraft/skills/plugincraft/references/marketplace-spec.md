# Marketplace.json Spec

What `marketplace-generate.sh` implements and what it preserves. See `scripts/marketplace-generate.sh` for the implementation.

## File Location

A marketplace's manifest lives at `<marketplace-root>/.claude-plugin/marketplace.json`. The marketplace root is the directory containing `.claude-plugin/` — it also typically contains a `plugins/` directory with one subdirectory per constituent plugin.

## Top-Level Schema

```json
{
  "name": "<marketplace-slug>",
  "owner": { "name": "<owner display name>" },
  "description": "<optional human-readable description>",
  "plugins": [ ... ]
}
```

`marketplace-generate.sh` preserves **every top-level field** byte-for-byte. Only `plugins[]` is regenerated.

## Per-Plugin Entry Schema

Each entry in `plugins[]` describes one installable plugin:

```json
{
  "name": "<plugin-name>",
  "description": "<one-line plugin description>",
  "source": "<source spec — see below>",
  "category": "<optional>",
  "homepage": "<optional URL>",
  "keywords": ["<optional>", "<tags>"]
}
```

### What `marketplace-generate.sh` rewrites vs preserves

| Field | Source | Behavior |
|---|---|---|
| `name` | `plugin.json`'s `name` field | Authoritative — always rewritten from the plugin's own manifest |
| `description` | `plugin.json`'s `description` field | Authoritative — always rewritten from the plugin's own manifest (this is what fixes drift) |
| `homepage` | `plugin.json`'s `homepage` field | Authoritative if present in `plugin.json` — overwrites the marketplace entry. Preserved from existing entry if absent from `plugin.json`. |
| `keywords` | `plugin.json`'s `keywords` field | Authoritative if present in `plugin.json` — overwrites the marketplace entry. Preserved from existing entry if absent from `plugin.json`. |
| `source` | Existing marketplace entry; defaults to `"./plugins/<dirname>"` for new plugins | Preserved if present; auto-generated for plugins added since last regeneration |
| `category`, and any other per-entry field | Existing marketplace entry | Preserved verbatim — these are hand-edited metadata. `category` belongs in marketplace entries only (`claude plugin validate --strict` warns when it appears in plugin.json). |

Plugins that exist in `plugins/*/` but not yet in `plugins[]` are added (with `source` defaulted to `./plugins/<dirname>`). Plugins in `plugins[]` whose `plugins/*/` directory no longer exists are removed.

`plugins[]` is sorted alphabetically by `name` for deterministic diffs.

## Source Formats

The `source` field accepts four shapes. `marketplace-generate.sh` only generates the **relative path string** form for new plugins; the other three are preserved verbatim if a human or another tool put them there.

| Form | Example | When to use |
|---|---|---|
| Relative path (string) | `"./plugins/foo"` | Plugin lives in this marketplace's tree (the default — what the generator emits) |
| Git source | `{"type": "git", "url": "https://...", "revision": "main"}` | Plugin lives in a separate git repo, pinned to a ref |
| GitHub source | `{"type": "github", "repo": "owner/repo", "path": "plugins/foo"}` | Convenience form for GitHub-hosted plugins |
| Local absolute | `{"type": "local", "path": "/abs/path"}` | Development convenience; never appropriate for published marketplaces |

If you switch a plugin to a non-local source, edit `marketplace.json` directly and `marketplace-generate.sh` will preserve the new `source` field on its next run.

## What Drift Looks Like

The most common drift is a stale `description` on a marketplace entry — `plugin.json` is updated when the plugin gains a new component, but the marketplace entry's description still describes the older shape. Users install from the marketplace listing and get something different than expected.

`marketplace-generate.sh --check` exits 1 when any field that the generator rewrites differs from what's in `marketplace.json`. The CI workflow at `.github/workflows/marketplace-sync.yml` uses this mode to prevent drift from accumulating.

## Hand-Editable Fields

Anything **not** in the rewrite list is hand-editable in `marketplace.json` and will survive regeneration:

- Per-entry: `source`, `category`, plus any per-entry field not in the rewrite table above (e.g., a future `icon` field). Hand-edits to `homepage` or `keywords` will be overwritten on the next run if `plugin.json` defines them — edit `plugin.json` instead.
- Top-level: everything (`name`, `owner`, `description`, any future top-level fields)

If you need to override a plugin's `description`, `homepage`, or `keywords` in the marketplace listing, the generator currently cannot honor that — it always sources these from `plugin.json`. Fix this by changing the value in `plugin.json` instead. (`category` does not have this constraint — it's hand-edited in `marketplace.json` directly.)
