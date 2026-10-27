# Standard Plugin Audit

Full audit of a single Claude Code plugin. Aggregates findings from delegated tools (`claude plugin validate`, `skillcraft` per skill) with plugincraft's own cross-component, marketplace, README, and publish-readiness checks.

## Quick Pre-flight (Optional)

Run `scripts/quick-validate.sh` for fast structural checks before the full audit:

```bash
${CLAUDE_PLUGIN_ROOT}/skills/plugincraft/scripts/quick-validate.sh <plugin-directory>
${CLAUDE_PLUGIN_ROOT}/skills/plugincraft/scripts/quick-validate.sh --all
```

This catches PM5, PM6, PS, PR1, and MK1 issues without invoking delegated tools or doing deep coherence analysis. Use it before the full audit to fail fast on obvious structural problems.

## Step 1: Select Target Plugin

If `$ARGUMENTS` specifies a plugin name or path, use it. Otherwise pick a plugin:

1. Identify up to 4 likely candidates from:
   - the plugin currently being edited (if any),
   - plugins referenced in the current conversation,
   - recently-touched plugins (`git log --name-only --since="14 days ago"` filtered to paths under `plugins/*/.claude-plugin/`, `~/.claude/plugins/marketplaces/*/plugins/*/`).
2. Use `AskUserQuestion` with those candidates plus an "Other" option.
3. If the user picks "Other", or no plausible candidates surface, ask: "Which plugin should I audit? Give me the name or path."

Search roots for resolution: current working tree's `plugins/*/`, `~/.claude/plugins/marketplaces/*/plugins/*/`.

## Step 2: Read All Plugin Files

Read every top-level configuration file and enumerate component directories:

- `.claude-plugin/plugin.json` — manifest
- `README.md` — user-facing entry point
- `hooks.json` — if present
- `.mcp.json` — if present
- list of directories under `skills/`, `commands/`, `agents/`, `hooks/` (count + names; full reads happen via delegations)

Note any parent `.claude-plugin/marketplace.json` whose `plugins[]` lists this plugin — needed for MK checks in Step 4.

## Step 3: Run Delegations

Run these in order. Each produces its own report that becomes part of the final aggregated output.

### 3a. `quick-validate.sh` pre-flight

```bash
${CLAUDE_PLUGIN_ROOT}/skills/plugincraft/scripts/quick-validate.sh <plugin-dir>
```

Captures PM5, PM6, PS, PR1, MK1. If it fails (exit 1), surface the failures up front in the final report — they likely explain other downstream issues.

### 3b. `claude plugin validate`

```bash
claude plugin validate --strict --profile directory <plugin-dir>
claude plugin validate --strict <marketplace-root>   # only when a parent marketplace exists
```

Covers every checklist item marked **Covered by** in `references/quality-checklist.md` (manifest, component frontmatter and JSON, README, license, install line). Report its findings under those IDs. Drop `--profile directory` for a plugin that will never be submitted to Anthropic's directory, and say so in the report.

### 3c. `skillcraft` per contained skill

For each `skills/*/` inside the plugin:

1. Load `skillcraft` via the Skill tool if not already loaded.
2. Invoke its `improve-standard.md` workflow against the skill directory.
3. Capture the per-skill audit report.

This is the heaviest step. If the user wants a faster pass, offer (via `AskUserQuestion` at the top of Step 3) a "quick" mode that runs `skillcraft/scripts/quick-validate.sh` per skill instead of the full workflow.

## Step 4: Apply Remaining Checks

After delegations, run only the checklist categories not already covered. From `references/quality-checklist.md`:

| Category | IDs | Focus | Coverage |
|---|---|---|---|
| Cross-Component Coherence | PX1-PX6 | Dangling refs, hook paths, MCP names, tool consistency, name collisions, trigger overlap | Plugincraft only — see `references/component-coherence.md` for detection recipes |
| Plugin README | PR1-PR4 | Existence, sections, env vars, component listing | PR1 from `claude plugin validate`; PR2-PR4 here |
| Marketplace | MK1-MK3 | Listed in `plugins[]` (covered by pre-flight), description matches, source resolves | MK1 from pre-flight; MK2-MK3 here, only when parent marketplace exists |
| Publish Readiness | PB1-PB4 | Version, license, changelog, install instructions | PB2, PB4 from `claude plugin validate`; PB1, PB3 here |
| Plugin Evals | PE1 | Eval suite exists | Plugincraft only — see `references/component-coherence.md` § PE1 for the detection recipe |

For PX, walk every check using the detection recipes in `references/component-coherence.md`. For MK2 specifically, compare the marketplace entry's `description` field byte-for-byte with `plugin.json`'s `description` field.

For PE, walk PE1 using the detection recipe in `references/component-coherence.md`. PE1 is a filesystem check — no external tool dependency. A PE1 failure is Critical (the plugin ships no eval suite at all).

## Step 5: Anti-Pattern Scan

Walk `references/anti-patterns.md`. For each pattern, run its detection recipe (mostly grep/jq/structural). Flag any detected by ID + name.

When citing an anti-pattern, link to it: `Anti-pattern #5: Marketplace Description Drift` — and show the concrete before/after for this plugin.

## Step 6: Present Findings

Structure the aggregated report as:

```
## Plugin Audit: <plugin-name>

**Score: X/Y checks passed** (across plugincraft's 33 checks; delegated reports counted separately)

### Strengths
- (Things the plugin does well worth preserving)

### Passed
- PM1, PM2, ... (one-line list of passed plugincraft check IDs)
- claude plugin validate: (one-line summary — passed, or error/warning counts)
- skillcraft on skills/<name>: (one-line summary per skill audited)

### Issues
🔴 Critical (blocks functionality)
- PX2: Hook command path does not resolve — `${CLAUDE_PLUGIN_ROOT}/hooks/check.sh` does not exist

🟡 Warning (degrades quality)
- MK2: Marketplace description drift — `plugin.json` and `marketplace.json` differ. Suggested fix: <one-line>
- PR3: MCP env vars (`GITHUB_TOKEN`) referenced in `.mcp.json` but not documented in README

🔵 Suggestion (nice to have)
- PB1: Version `0.0.1` — bump to `0.1.0` once ready for users

### Anti-Patterns Detected
- #5 Marketplace Description Drift (see references/anti-patterns.md)
- #11 Inconsistent Naming

### Delegated Reports

**claude plugin validate**:
<paste its output verbatim under a fenced block, or summarize key issues>

**skillcraft on skills/<name>** (one block per skill):
<paste each per-skill audit under a fenced block; if any skill failed critically, surface the worst at the top of Issues>
```

## Step 7: Fix Issues Interactively

For each issue (critical first, then warnings, then suggestions), present the fix and ask the user with `AskUserQuestion`. Use the finding ID + summary as the question (e.g. "PX2: Hook command path does not resolve — fix it?") with three options:

- **Fix now** — Apply the fix immediately.
- **Skip** — Move to next issue.
- **Discuss** — Explain the issue in detail, then re-ask.

One `AskUserQuestion` call per issue. Process the user's choice before moving to the next finding.

For issues from delegated reports (`claude plugin validate`, skillcraft), route the fix back to the delegated tool's normal fix path:

- `claude plugin validate` findings → fix per its `Fix:` lines, then re-run it to confirm.
- `skillcraft` findings → route into `skillcraft`'s own interactive fix loop (its `improve-standard.md` Step 5).

## Output

The Step 6 report template is the canonical aggregated output. The bulk workflow (`improve-bulk.md`) reads several of these and produces a summary table — keep the headings (`### Issues`, `🔴 Critical`, `🟡 Warning`, `🔵 Suggestion`, `### Anti-Patterns Detected`) stable so the bulk workflow can parse them.
