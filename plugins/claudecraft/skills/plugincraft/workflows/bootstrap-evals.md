# Bootstrap Plugin Evals

Add eval coverage to an existing plugin — covering both per-component behavior (delegated to `skillcraft`'s per-skill bootstrap) and plugin-as-unit bundle behavior (the scenarios only this workflow owns).

> **References for this workflow:** `claude-code-evals/references/config-type-patterns.md` § Plugins (cross-component scenario design), `claude-code-evals/references/check-design.md` § Pre-Write Checklist (mandatory before authoring any check), `references/delegation-map.md` (what plugincraft owns vs. delegates). Run `craboodle --help`, `scuttlerun --help`, and `pincenez --help` for the canonical schemas and flag references.

**GATE — Load `claude-code-evals` before proceeding.** This workflow depends on check design rules and the Plugins config-type pattern that live in the `claude-code-evals` skill. Use the Skill tool to load it now. Do NOT proceed to Step 1 until it is loaded.

## Step 1: Select Target Plugin

If `$ARGUMENTS` specifies a plugin name or path, use it. Otherwise pick a plugin:

1. Identify up to 4 likely candidates from:
   - the plugin currently being edited (if any),
   - plugins referenced in the current conversation,
   - recently-touched plugins (`git log --name-only --since="14 days ago"` filtered to paths under `plugins/*/.claude-plugin/`, `~/.claude/plugins/marketplaces/*/plugins/*/`).
2. Use `AskUserQuestion` with those candidates plus an "Other" option.
3. If the user picks "Other", or no plausible candidates surface, ask: "Which plugin should I bootstrap evals for? Give me the name or path." Resolve the answer to a directory containing `.claude-plugin/plugin.json` and continue.

Search roots for resolution: current working tree's `plugins/*/`, `~/.claude/plugins/marketplaces/*/plugins/*/`.

Check the plugin's `evals/` directory status:
- **No `evals/` directory and no `evals.yaml`** — proceed to Step 2.
- **`evals.yaml` at plugin root + `evals/<component>-placeholder/` directories (from `craboodle init`)** — proceed to Step 2; Step 6 will reuse the existing scaffold.
- **`evals/` exists with real scenario directories** (`evals/<id>/scenario.yaml` files with non-placeholder prompts) — this workflow does not apply; you are extending an existing suite, not bootstrapping. Add scenarios incrementally, applying the Step 7 GATE per new scenario.

## Step 2: Catalog Components

Read `plugin.json` and enumerate every component the plugin ships. Build a small table — this is the universe scenarios will draw from in Steps 3 and 4.

| Component type | Source | What to record |
|---|---|---|
| Skills | `skills/*/SKILL.md` | Name, one-line purpose, auto-trigger vs. user-invoked |
| Hooks | `hooks/` + `hooks.json` (if present) | Hook type (PreToolUse, etc.), matcher, what the command does |
| Sub-agents | `agents/*.md` | Name, when it's spawned, what tools it has |
| MCP servers | `.mcp.json` | Server name, what tools it exposes |
| Commands | `commands/*.md` | Command name, what skill or workflow it invokes |

If the plugin ships only one component (a single skill, nothing else), Composition is impossible and Discoverability/Regression collapse toward the per-skill suite — **Step 4 is optional.** Record the plugin as single-component and either skip Step 4 or keep it deliberately thin, noting the decision as a coverage gap in the Final Report. Plugins with two or more components (even two skills) can compose, expose a multi-component load surface, and regress as a bundle — they proceed through Step 4 normally.

## Step 3: Delegate Per-Skill Bootstrap

For each skill in Step 2's catalog, per-skill evals are skillcraft's responsibility. Skill eval is location-agnostic: a skill inside a plugin evaluates identically to a standalone skill.

For each skill:

1. Check whether the skill already has an `evals/` directory with real scenarios. If yes, skip.
2. If not, invoke `skillcraft/workflows/bootstrap-evals.md` against the skill directory (`<plugin-root>/skills/<skill-name>`).
3. Verify skillcraft's Final Report shows `Lint: PASS` and `Run: PASS (exit code 0)`. If the report shows `Run: FAIL (exit code 3)` or is absent, return to skillcraft's Step 9 (Iterate) for that skill before continuing. Do not advance to Step 4 with a failing per-skill suite.
4. Capture both the per-skill suite location AND the verified `Lint: PASS / Run: PASS` signals for this plugin's Final Report.

**Per-skill suites are a prerequisite for Step 4.** Failing skill suites would mask bundle-level failures and make Step 10 diagnosis ambiguous. If a deferral is needed (e.g., the user explicitly wants plugin-bundle-only coverage), the deferral must be acknowledged before Step 3 begins — surface it during Step 1's target selection or plan review — and recorded as a known coverage gap in the Final Report under "Components Exercised," enumerating the specific skills whose suites are deferred. A post-hoc note added after attempting (and failing) delegation does not satisfy this gate.

## Step 4: Propose Bundle Scenarios

Bundle scenarios exercise plugin-as-unit value — what the plugin adds over its components in isolation. Generate 3+ proposals across these buckets:

| Bucket | What it tests | Example |
|---|---|---|
| Composition | Two or more components interacting in the same session | Skill A triggers hook B; agent C uses MCP D; command E invokes skill F |
| Discoverability | The plugin's components are all registered and reachable once it loads | Each skill auto-fires on its own keywords without trigger collisions; the registered command resolves |
| Regression | Loading the plugin doesn't break something it shouldn't | Existing tools remain available; baseline tasks still complete |

For each proposed scenario, draft: `id`, `name`, `prompt`, and 3 `checks`. At least one check per scenario must assert a **plugin-as-unit property** — a cross-component *interaction* for Composition (mirrors the Plugins pattern in `claude-code-evals/references/config-type-patterns.md`), the whole-bundle load surface for Discoverability, or bundle-level non-regression for Regression. A scenario that only exercises a **single component in isolation** carries no such property and belongs in the per-skill suites from Step 3.

Make scenarios realistic and specific to this plugin's actual components — not generic templates.

Check quality is enforced in Step 7.

## Step 5: Interview (when warranted)

Bundle scenarios are higher-stakes than per-skill scenarios — the design space is larger (component pairs, triples, full bundles), failures are subtler (cross-component coordination), and the bar for "useful" is higher (must distinguish bundle value from per-component value).

| Plugin shape | Interview? |
|---|---|
| Single component type (e.g., only skills) | Typically skip — there's no composition to design |
| Two component types | Often interview — composition pattern is real but compact |
| Three or more component types | Always interview — proposals require judgment on what compositions matter |

If the scenarios are straightforward (clear composition story, well-documented interactions, obvious check targets), proceed directly to Step 6. Otherwise present proposals and ask:

1. "Here are N proposed bundle scenarios for [plugin-name]. For each: approve as-is, suggest changes, or replace?"
2. "Which cross-component interactions matter most? Anything I missed?"

Revise scenarios based on feedback. Two questions is the target; three is the maximum.

## Step 6: Write Pipeline Config

### Model selection

The agent-under-test `model:` determines what your evals measure. Haiku (scuttlerun's default) is cheap and fast but its failure modes may not reflect what the plugin does under Sonnet or Opus — the models most users run. Default to Sonnet for representative bundle evals; reserve Haiku for smoke-testing scenario design or iterating cheaply. The synthetic-user `oracle_model` (under `user:`) also defaults to Haiku — raise it when bundle scenarios depend on the oracle following nuanced multi-turn prompts. Discoverability scenarios (skills auto-firing on their own keywords) are especially model-sensitive — Haiku frequently skips autonomous invocation, making those results misleading (see the skillcraft skill's `references/eval-guide.md` § Trigger Testing).

### Scaffold and inject the plugin

```bash
craboodle init <plugin-root>
```

`craboodle init` auto-detects plugin mode (presence of `.claude-plugin/plugin.json`) and writes `<plugin-root>/evals.yaml` with `version: "1"`, commented pipeline knobs (`min_pass_rate`, `max_budget_usd`, `repeats`, `artifact_retention_days`), and a commented `scenarios.base` template that includes a commented `plugins:` / `- .` self-reference under `scenarios.base.project`. In plugin mode, init also writes one `evals/<component>-placeholder/` directory per cataloged component as starter scaffolding.

Then:

1. **Uncomment `scenarios.base.project.plugins`** — the init scaffold has placed a commented `plugins:` hint with `- .` underneath; remove the leading `#` characters from both lines to activate it. This loads the entire plugin (skills + hooks + sub-agents + MCP servers + commands) into every scenario. `project.plugins` is the canonical caller surface; `sdk.plugins` is the raw SDK escape hatch. Run `scuttlerun --help` for the full field reference and for the precedence between `project.plugins` and `sdk.plugins`.
2. **Optionally add `project.skills`** — the init scaffold no longer emits a `skills:` hint in plugin mode. If a per-skill self-reference is needed alongside the bundle load (rare), add a `skills:` block under `scenarios.base.project` pointing at the specific skill (e.g. `skills/<id>`).
3. **Fill in `scenarios.base.tools`** — the `tools:` array must include both scuttlerun's defaults (run `scuttlerun --help` for the current list) **plus** any tools the plugin's components require (e.g., `Agent` for plugins with sub-agents, `mcp__*` names for MCP-provided tools). Listing your additions alone replaces the defaults rather than extending them; use `additional_tools:` if you want extension semantics.
4. **Edit the pipeline knobs in `evals.yaml` (top level)** — uncomment `min_pass_rate` and set a reachable value. Reachable pass rates are `k/(checks × reps)`; e.g. with 3 checks × 1 rep the only reachable values are `{0, 0.33, 0.67, 1.0}`, so `0.8` would collapse to requiring a perfect `1.0`.
5. **Consider the timeout for long-running bundle scenarios** — scuttlerun's session timeout defaults to 300s. Multi-skill compositions (e.g., assess→iterate) routinely exceed this. If you anticipate long runs, set a top-level `timeout: <seconds>` (e.g., `timeout: 900`) in `evals.yaml`, or pass `--timeout <seconds>` to `craboodle run` for a per-invocation override. The orchestrator-level value overrides any `scenarios.base.timeout`.

For how `scenarios.base`, `scenario.yaml`, CLI flags, and scuttlerun defaults compose (deep-merge for objects, replace for arrays, defaults applied last), see `claude-code-evals/references/config-precedence.md`.

## Step 7: Write Scenario Files

For each approved bundle scenario from Step 4, create:

- `evals/<scenario-id>/scenario.yaml` — prompt and any per-scenario scuttlerun overrides (fixtures via `project.files`, additional tools, etc.)
- `evals/<scenario-id>/checks.yaml` — context and checks in id-as-key format

**GATE — STOP. Before writing any check, you MUST Read `claude-code-evals/references/check-design.md` § Pre-Write Checklist AND run `pincenez lint --help` in this session.** The reference contains six self-tests that every check must pass before being written. Apply every self-test to every check — do not skip self-tests on checks that "look obviously fine"; over-specific and compound are the most common lint failures and they hide in checks that look concrete. Catching anti-patterns here is free; catching them via `craboodle lint` costs a lint cycle per fix.

Loading the `claude-code-evals` skill (done in the top GATE) is not the same as having the Pre-Write Checklist in context. If you have not Read the § Pre-Write Checklist section of check-design.md and run `pincenez lint --help` during this session, do so now before continuing.

For every bundle-level check, add a `note:` field naming the components (or load surface) the check exercises (e.g., `note: "skills/release-notes + hooks/slack-post — composition"`). This mirrors the `note:` discipline in `claude-code-evals/references/config-type-patterns.md` § Plugins and makes Step 10 attribution faster. For Regression-bucket checks, also declare the regression-baseline intent in the note — those checks are presence-anchored by design (see `claude-code-evals/references/check-design.md` § Check Patterns), and the declaration is what tells lint the WHETHER form is deliberate.

**Write incrementally**: Write the first scenario, then lint it with `craboodle lint --scenario <id> <plugin-root>`. Fix any issues before writing the remaining scenarios — anti-pattern tendencies caught on the first scenario won't propagate to the rest. Then write the remaining scenarios in parallel, following the same patterns.

## Step 8: Lint

```bash
craboodle lint <plugin-root>
```

Confirm zero issues across the full suite. If the incremental lint in Step 7 was clean, this will usually pass on the first run — but lint is advisory and non-deterministic, so an unexpected flag on re-run may be lint variance rather than a regression (see the *Evaluation is probabilistic* note in `claude-code-evals` and `pincenez lint --help`). Re-run and judge a surprise flag on its merits before acting on it.

If lint flags `tautological` or `always_passes` on a deliberate presence anchor or regression baseline (common in the Regression bucket), the fix is to declare the intent in the check's `note:` and re-lint — not to delete or weaken the check (see `claude-code-evals/references/check-design.md` § Check Patterns). The bar stays zero issues: declared intent clears the flag because calibrated lint stops flagging, not because the issue is waived.

## Step 9: First Run

**GATE — Lint validates form; run validates substance. Do NOT report completion or present a final summary until a run has completed and results are reviewed.**

```bash
craboodle run --repeats 1 <plugin-root>
```

Review the output. If all scenarios pass, proceed to Final Report. If failures occur, continue to Step 10.

## Step 10: Iterate

Exit-code meanings: `craboodle run --help` (canonical), or `claude-code-evals/references/results-interpretation.md` § Exit Codes.

| Exit Code | Action |
|-----------|--------|
| 0 | Done |
| 1 | Fix the offending YAML |
| 2 | Read the error message on stderr; fix what it names (often an `evals.yaml` load failure) |
| 3 | Diagnose and fix (see below) |
| 4 | Check tool installation and plugin load path; if reps failed, inspect the scenario `errors` block |

**GATE — When exit code is 3, you MUST produce a per-check diagnosis table before the Final Report. Do NOT emit "Bootstrap complete" or any final summary until every failing check has a Plugin / Component / Check attribution recorded in the Diagnosis section of the report template.**

For each failing check, diagnose:
- **Plugin problem** — The plugin's components don't compose as expected. Fix: revise the offending component (often cross-component coherence, e.g., a hook that doesn't fire when the skill triggers).
- **Component problem** — A single component within the plugin is misbehaving (and its per-skill suite likely also fails). Fix: route into `skillcraft`'s per-skill workflow for that component.
- **Check problem** — The plugin works but the check doesn't capture it correctly. Fix: revise the check.

To distinguish: read the scuttlerun transcript at `<artifact_dir>/<scenario-id>/rep-<N>/output.yaml` (the `artifact_dir` is printed in craboodle's YAML output). Cross-component failures often show one component firing and another not — that pattern points at composition, not at either component in isolation.

Iteration rules:
1. Fix one thing at a time (plugin OR component OR check, not multiple)
2. When a rewrite responds to a lint flag, re-apply the full Pre-Write Checklist to the rewrite before moving on — rewrites commonly reintroduce a different anti-pattern (run `pincenez lint --help` for worked examples)
3. Re-run targeted scenarios after each fix
4. Stop when: exit code 0, or pass rate improvement < 0.05 for 2 iterations

## Final Report

This template requires data from a `craboodle run` — it cannot be filled from lint results alone.

**Output handling**: redirect `craboodle run` to a file; never pipe it through `grep`, `head`, or `tail` before reading for the report. Filtered streams drop scenarios silently. See `claude-code-evals/references/results-interpretation.md` § Preserving Full Output.

```
## Plugin Evals Bootstrapped: {plugin-name}

Location: {plugin-root}/evals/
Scenarios: {count} bundle scenarios
Per-skill suites (from Step 3): {list each skill name and its evals/ location, or "deferred" if Step 3 was skipped}
Checks: {total bundle check count}
Lint: PASS
Run: {PASS or FAIL} (exit code {0 or 3})

### Components Exercised
{One line per cataloged component from Step 2. Mark each as "covered" if at least one bundle check tests it, "per-skill only" if only the per-skill suite tests it, or "uncovered" if neither does. Surfaces gaps for follow-up.}

### Per-Scenario Results
{paste craboodle run YAML output: scenario id, pass_rate, cost_usd for each}

### Diagnosis
{Required when Run: FAIL. One row per failing check. Omit this section only when all scenarios passed (exit code 0).}

| Scenario | Check | Pass rate | Attribution (Plugin / Component / Check) | Notes |
|----------|-------|-----------|------------------------------------------|-------|
| ...      | ...   | ...       | ...                                      | ...   |

### Iterations
{count} lint-fix cycles, {count} run-fix cycles
```

**Before submitting**: verify every scenario directory under `evals/` appears above with a numeric `pass_rate`. If any row shows `?`, `unknown`, or "succeeded" without a number, the run output was filtered — re-read it from the redirect file or artifact directory and re-populate that row. Verify the Components Exercised section accounts for every component cataloged in Step 2 — gaps there are valid future work, not silent omissions.
