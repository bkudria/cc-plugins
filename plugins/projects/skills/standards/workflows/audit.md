# Audit Mode

> **References:** `references/project-yaml-schema.md` (project.yaml schema), `profiles/` (every standard YAML lives in its profile directory; the YAML itself describes what it checks).

The audit runs in **two collection rounds** plus render:

1. Round 1 — collect required standards, dispatch their pending entries, merge.
2. Gate — if every required standard PASSed, proceed; otherwise skip to render.
3. Round 2 — collect suggested standards, dispatch their pending entries, merge.
4. Render — final table, counts, optional skipped-suggested line, fix plan.

Suggested standards are gated behind required-pass: round 2 only runs when every required standard from round 1 has status PASS. This saves haiku dispatches on failing audits and keeps the output focused on FAILs.

**GATE — Read-only audit.** Leave every file in the project under audit untouched, `project.yaml` included. An audit that edits its subject reports on a project the user never wrote, so its result means nothing. If the runner exits non-zero (schema validation failure, missing project.yaml, etc.), show its stderr verbatim and stop. A non-zero exit is the audit result, so don't edit, rewrite, or "migrate" `project.yaml` to get `--collect` through.

Paths below are relative to `<skill-dir>`, the skill directory named in SKILL.md. Run each runner verb as its own Bash command that starts with the script's absolute path, so the skill's pre-approved commands match and don't prompt.

## Steps

### 1a. Collect required

First, create a per-audit state directory:

```bash
STATE_DIR=$(<skill-dir>/scripts/run-audit.sh --init) && echo "$STATE_DIR"
```

Capture `$STATE_DIR` from stdout and use that literal path in every subsequent tool_use — shell variables don't persist across Bash tool_uses, only files do. Then collect the required-scope round:

```bash
<skill-dir>/scripts/run-audit.sh --collect <project-root> "$STATE_DIR" --scope required
```

The runner reads `<project-root>/project.yaml` (and exits with a descriptive error if missing — there's no need to pre-read or `cat` it yourself), validates its schema via `lint-project-yaml.sh` (any unknown top-level keys cause `--collect` to fail-fast with the linter's error output before any standards run), walks every YAML in each selected profile's directory, **filters to effective-required standards only** (intrinsic `required: true` OR id in project.yaml's `required:` overrides), executes deterministic `check.script` standards immediately, and writes `<state-dir>/collect-required.json` of the form:

```json
{
  "resolved": [
    { "id": "base/readme", "status": "PASS", "detail": "...", "description": "..." }
  ],
  "pending": [
    { "id": "base/lockfile", "required": true, "description": "...", "prompt_path": "<state-dir>/prompts/base/lockfile.txt", "response_path": "<state-dir>/responses/base/lockfile.txt" }
  ],
  "disabled_count": 0,
  "suggested_total": 4,
  "project_context": "Detected project context (auto-detected from manifest files; verify before relying on it):\n- Language/runtime: …\n- Package manager: …\n- Primary manifest: …\n"
}
```

`suggested_total` is the count of would-have-been-suggested standards that round 1 *deliberately skipped* — render uses it to surface the skipped count if the gate later trips.

**GATE — No prompt extraction.** Keep prompt content out of the main conversation. Each verdict is only trustworthy if a fresh verifier formed it from that one standard's prompt, so the main agent never reads, prints, or copies a `prompt_path` file — not through Bash (`cat`, loops, `echo`), not with a file-reading tool (`Read`, `Grep`, `Glob`), and not into a side file. The pending entries carry only file *paths* (`prompt_path`, `response_path`) plus `id`/`required`/`description`, and that index is all the workflow needs; its verifiers read the prompt files themselves.

Extract the pending index (paths and ids only) and hand it to the verification workflow. The workflow runs one haiku verifier per pending entry; each reads its `prompt_path` file, follows the directive the runner baked into it, and writes `{"met": true|false, "detail": "<one-line>"}` to its `response_path`. The `parallel()` inside the script does the fan-out, so there is no per-entry dispatch to drive or count by hand.

```bash
jq -c '.pending' "$STATE_DIR/collect-required.json"
```

If that array is empty (every required standard was deterministic), skip the workflow and go straight to merge. Otherwise dispatch the plugin's saved workflow by name:

```
Workflow({
  name: "projects:standards-verify",
  args: { scope: "required", pending: <the array printed by jq above> }
})
```

If the tool reports that workflow name as not found (the plugin was loaded from a directory with `--plugin-dir`, which doesn't register plugin workflows), dispatch the same script by path instead, in this round and the next:

```
Workflow({
  scriptPath: "<skill-dir>/workflows/verify.js",
  args: { scope: "required", pending: <the array printed by jq above> }
})
```

**If the `Workflow` tool is unavailable, stop the audit here.** It is missing from the tool list (and `ToolSearch` can't load it) when Dynamic workflows are switched off, which is the default on Claude Pro. Don't verify the pending standards yourself or with `Agent` sub-agents: the audit's verdicts depend on one isolated verifier per standard, and an improvised fan-out can't promise that. Instead, tell the user:

- how many prompt-based standards were not verified (the length of the pending array),
- the deterministic results so far — counts by status from `.resolved` in `collect-required.json`, plus the id and detail of each FAIL,
- that turning on **Dynamic workflows** in `/config` and re-running the audit will verify the rest.

Skip merge, gate, and render; `--merge` would record every unverified standard as FAIL.

**The `Workflow` call is non-blocking.** It returns a task id immediately and the fan-out runs in the background. After dispatching, wait without verifying any standard yourself and without reading the prompt or response files; you are re-prompted when the `<task-notification>` arrives with `status: completed`.

**Check the fan-out before merging.** The workflow already retries any verifier that died once. Its result carries `requested` and `dispatched` counts plus `failed`, the ids still unverified after the retry. `--merge` records each of those as FAIL (failure to verify is itself a failure), so when `failed` is non-empty, name those standards alongside the rendered result so the user can tell an unverified FAIL from a real one.

Then run merge:

```bash
<skill-dir>/scripts/run-audit.sh --merge "$STATE_DIR"
```

The runner reads `collect-required.json` plus each pending entry's response file, validates `met` and `detail`, applies the status rule below, and treats missing files / parse failures / non-bool `met` as `FAIL` regardless of `required:`.

| `met` | `required` | Final status |
|-------|-----------|--------------|
| `true` | any | `PASS` |
| `false` | `true` | `FAIL` |
| `false` | `false` | `SUGG` |

### 1b. Gate

Run the gate to decide whether round 2 should run:

```bash
<skill-dir>/scripts/run-audit.sh --gate "$STATE_DIR"
```

Exit codes:
- **0** — every effective-required entry has status PASS. Proceed to step 1c.
- **1** — at least one effective-required entry has status FAIL. **Skip directly to step 3 (render)** — round 2 never runs; render will surface the skipped count line.
- **≥2** — operational error (missing/malformed merged.json). Halt and surface stderr.

A required prompt-based standard whose sub-agent failed to write a response file is treated as FAIL by merge (matching the existing "failure to verify is itself a failure" contract) and trips the gate just like a deterministic FAIL.

### 1c. Collect suggested (only after gate=0)

```bash
<skill-dir>/scripts/run-audit.sh --collect <project-root> "$STATE_DIR" --scope suggested
```

The runner walks the same profiles but **filters to effective-suggested standards only** (intrinsic `required: false` AND id NOT in project.yaml's `required:` overrides). Output is `<state-dir>/collect-suggested.json` with the same shape as round 1 (minus `suggested_total`).

**GATE — No prompt extraction (round 2).** The round 1 rule holds: the main agent never reads, prints, or copies a prompt file, by Bash or by any file-reading tool. The workflow's verifiers read them.

Extract this round's pending index and hand it to the same workflow with `scope: "suggested"`:

```bash
jq -c '.pending' "$STATE_DIR/collect-suggested.json"
```

If the array is empty, skip the workflow and run merge directly. Otherwise dispatch it the same way as round 1 — by name, or by `scriptPath` if round 1 needed the path:

```
Workflow({
  name: "projects:standards-verify",
  args: { scope: "suggested", pending: <the array printed by jq above> }
})
```

As in round 1 the call is non-blocking: dispatch, wait for the `<task-notification>`, and check `failed` before merging. Then run merge again:

```bash
<skill-dir>/scripts/run-audit.sh --merge "$STATE_DIR"
```

The second merge reads BOTH `collect-required.json` and `collect-suggested.json`, unions their resolved/pending arrays, re-reads response files, and writes `merged.json` with `scopes_collected: ["required","suggested"]`.

### 3. Render

```bash
<skill-dir>/scripts/run-audit.sh --render "$STATE_DIR"
```

The runner emits, in order:

- A markdown table with three columns (`Standard`, `Status`, `Detail`) listing only `FAIL` and `SUGG` rows, sorted FAIL → SUGG, alphabetical by id within each bucket. PASS rows are intentionally omitted from the table — the per-status count line preserves the PASS total.
- A blank line, then a per-status count: `X PASS, Y FAIL, Z SUGG`.
- Optionally, a single line `N standards disabled in project.yaml` (omitted when N == 0).
- Optionally, a single line `N suggested standards skipped (<reason>)` — emitted iff `scopes_collected` lacks `"suggested"` AND `suggested_total > 0` (i.e., round 2 did not run and there were suggesteds to skip). The `<reason>` is `required failures present` when the audit has at least one `FAIL`, otherwise `suggested round not run`.
- Optionally, a "lock-in" suggestion block. Triggers iff round 2 ran (`scopes_collected` includes `"suggested"`) AND zero `FAIL` AND zero `SUGG` AND at least one PASSing standard is SUGG-style (its YAML has `required: false`) AND not already in the project's `required:` list.

The render step never invents `MANUAL`, `SKIP`, or `DISABLED` rows. Every row in the table is `FAIL` or `SUGG`. PASS rows and disabled standards are absent from the table; their existence is signaled only by the count line below the table.

**GATE — Verbatim render.** The render phase's stdout is the audit: the FAIL/SUGG table, the `X PASS, Y FAIL, Z SUGG` count line, the optional `N standards disabled` line, and the optional `N suggested standards skipped` line. Present it verbatim: it is the runner's deterministic record of each verdict, and a paraphrased detail cell, an added heading, or a count line rewritten as prose can drop or distort a verdict the user relies on. The prioritized fix plan in step 4 goes below the runner's output as an extra section and never replaces any of it.

### 4. Synthesize a prioritized fix plan

Below the runner's output, write a **prioritized fix plan**: one item per FAIL row in the table. Each item is a single sentence with a single imperative that names the outcome to reach, e.g. "Add CLAUDE.md to the project root" or "Fix the 5 RuboCop offenses". Leave out the steps to get there, any second action joined by "and" or "then", and any clause explaining why. The table's Detail cell already carries the specifics, so the plan stays a list someone can scan and tick off. Read `$STATE_DIR/merged.json` to look up each failing standard's `description` field — that one-line statement of what the standard verifies — and let it shape the outcome the item names, so the item addresses the standard's intent, not just the symptom in `detail`. The `description` is for orientation, not verbatim inclusion.

**GATE — Plan composition.** List every FAIL (no upper bound), ordered by the profile sequence in `project.yaml` — e.g., with `profiles: [base, public]`, all `base` FAILs precede all `public` FAILs — so the plan follows the order the project declares its profiles in. Within each profile group, order by which fix unlocks the most value (e.g., adding a license matters more than adding a code-of-conduct). Leave SUGGs out of the plan whenever any FAIL exists, so the plan stays on what blocks the audit; with zero FAILs, list SUGGs using the same profile-then-value ordering. With zero FAIL and zero SUGG rows, omit the plan.

### 5. Pass/fail signal

The audit **passes** iff the rendered table contains zero `FAIL` rows. `SUGG` rows are non-blocking. When required FAILs caused suggesteds to skip, `merged.json` contains required entries only — `--check` still gives the correct CI signal because the FAIL rows are present in the file regardless of whether round 2 ran.

`--render` is a pure formatter and exits **0** on any successful render (including renders that contain `FAIL` rows). The pass/fail signal lives in `--check`:

```bash
<skill-dir>/scripts/run-audit.sh --check "$STATE_DIR"
```

`--check` exits **0** when the audit passes (no `FAIL` rows), **1** when ≥1 `FAIL` row is present, and **≥2** for operational errors (missing `merged.json`, malformed JSON, unresolved pending entries). CI pipelines use `--check`'s exit code directly without grepping stdout.

`--gate` (used between rounds) and `--check` (used at the end) have the same exit-code shape but answer different questions: `--gate` filters to effective-required entries only; `--check` looks at every entry in merged.json. Don't conflate them.

## After the audit

The audit ends at the render and pass/fail signal above. The read-only **GATE** at the top of this mode governs the audit itself and applies only through render — nothing in this mode edits the project under audit.

Implementing the prioritized fix plan is a **separate activity, outside audit mode**. Switching from auditing to implementing is a deliberate mode change, not a continuation of the audit: the read-only constraint lifts (project files may now be edited), and the fixes follow the project's own testing and commit discipline — this skill does not prescribe which. Do not begin editing under the audit's read-only contract.

Re-auditing after fixes is a **fresh audit run**, not a resume of this one. Start again at step 1a with a new `--init` state directory; the two-round flow (required → gate → suggested) is a single run that is never re-collected in place, and a prior run's state directory is never reused for a post-fix re-audit.

## Notes

- The runner does not invoke sub-agents itself — it only walks YAML, executes scripts, and formats output. The per-standard verification in steps 1a and 1c is delegated to the `projects:standards-verify` workflow (`workflows/verify.js`), which fans out one verifier agent per pending entry; prompt content stays in the per-entry `prompt_path` files and is never dumped through Bash. The deterministic runner verbs (`--collect`/`--merge`/`--gate`/`--render`/`--check`) run directly and are CI-safe; the verification fan-out needs the Workflow runtime, so a bare-CI run resolves only the deterministic standards.
- Standards are activated by directory listing: every `.yaml` file under `profiles/<profile-name>/` is a standard. To skip a standard for a specific project, list it in the project's `disabled:` map with a non-empty reason — see `references/project-yaml-schema.md`.
- A standard's *check* is fully described inside its YAML. The only severity knob `project.yaml` can turn is the `required:` list, which upgrades named standards from `SUGG` to `FAIL`. The check itself remains unparameterized. If you need a stricter check, add a separate standard YAML in a profile (e.g., `public/readme-sections.yaml` is a separate file from `base/readme.yaml`).
- The two-pass flow is the only audit flow. There is no single-pass `--collect` (without `--scope`); it errors clearly. The state-dir holds `collect-required.json` (always written), `collect-suggested.json` (only after gate=0), and `merged.json` (rebuilt on each `--merge` from the union of present collect files).
- The `project_context` block prepended to every prompt includes a `git ls-files` listing (capped at 200 entries) alongside language/manifest metadata, so sub-agents start with a project-tree map instead of running their own `find`. Use it as a starting point; Read individual files when their content matters to the standard. Non-git projects get the metadata lines but no listing.
- Each prompt-based standard's `notes:` field (if present) is threaded into the rendered verifier prompt as a labeled background section between `project_context` and the check body. Verifiers receive maintainer-written precedence rules and edge cases without the runner needing to know which fields matter to which standard.
