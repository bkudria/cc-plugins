# Bulk Plugin Audit

Audit every installed plugin and present a summary.

## Process

### 1. Discover Plugins

Walk these roots:

- `~/.claude/plugins/marketplaces/*/plugins/*/` — marketplace-installed plugins
- Current working tree's `plugins/*/` — only if `./.claude-plugin/marketplace.json` exists at cwd (the cwd is itself a marketplace root)

A directory is a plugin if it contains `.claude-plugin/plugin.json`.

### 2. Audit Each Plugin

Run steps 1-6 of `workflows/improve-standard.md` against each discovered plugin. **Skip Step 7** (interactive fix loop) — bulk audit is read-only.

By default, bulk audit also **skips Step 3c (per-skill `skillcraft` delegation)** because it is slow at scale. The per-skill audits run only when `$ARGUMENTS` includes `--deep`.

Capture each plugin's report in the same structure as `improve-standard.md` Step 6 — the parser in Step 3 below depends on that shape.

### 3. Aggregate Into Summary Table

```
| Plugin | Score | Critical | Warnings | Suggestions | Anti-patterns |
|---|---|---|---|---|---|
| claudecraft | 28/34 | 0 | 2 | 1 | 1 (marketplace-drift) |
| triage      | 26/34 | 0 | 4 | 2 | 0 |
| plugin-dev  | 30/34 | 0 | 1 | 3 | 0 |
```

Sort by score ascending (most-troubled first).

For each row:
- **Score**: count of passed plugincraft checks / total applicable checks for that plugin. MK1-MK3 only count when a parent marketplace.json exists; PB1-PB4 always count; PE1 always counts (filesystem check, no external dependency).
- **Critical / Warning / Suggestion**: counts from the plugin's `### Issues` section (🔴/🟡/🔵).
- **Anti-patterns**: count + comma-separated short names of detected anti-patterns.

### 4. Optional: Enter Fix Loop For Selected Plugins

After the summary, ask via `AskUserQuestion`: "Which plugin(s) should I fix interactively?" Offer up to 4 of the worst-scoring plugins plus "None" and "Other" options.

For each selected plugin, route into `workflows/improve-standard.md` Step 7 (interactive fix loop). One plugin at a time — finish fixes on one plugin before moving to the next.

### 5. Delegated Report Summary (when `--deep`)

When `$ARGUMENTS` includes `--deep`, the per-skill `skillcraft` delegation runs. Aggregate per-skill scores into a second table:

```
| Plugin | Skill | Score | Critical | Warnings |
|---|---|---|---|---|
| claudecraft | skillcraft         | 42/44 | 0 | 2 |
| claudecraft | claude-code-evals  | 40/44 | 0 | 4 |
| claudecraft | plugincraft        | 41/44 | 0 | 3 |
```

This is expensive — only emit when explicitly requested.

## Arguments

| Argument | Effect |
|---|---|
| (none) | Bulk audit, skip per-skill skillcraft delegation |
| `--deep` | Bulk audit with per-skill skillcraft delegation (slow, but covers skills inside plugins) |
| `--base <path>` | Audit only plugins under `<path>` instead of all known roots |

## When To Use This Workflow

- Quarterly sweep across all installed plugins to catch drift early
- After a Claude Code release that introduces new plugin features (check for new anti-patterns)
- Before publishing a new marketplace, to verify every plugin meets a baseline
- After adding several plugins at once, to catch common authorship issues

For audits of a single plugin, use `workflows/improve-standard.md` directly.
