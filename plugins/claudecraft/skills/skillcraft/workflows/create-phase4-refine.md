# Phase 4: Refine

Lint, run evals, and iterate until the skill passes. This phase is autonomous — no user interaction needed.

> **References for this phase:** `references/eval-guide.md` (check patterns by skill type). Load the `claude-code-evals` skill for general eval methodology. Run `craboodle --help` for CLI reference. Do not read other references unless a specific question arises.

## Prerequisites

- `craboodle` and `pincenez` available on PATH

## Step 1: Lint Checks

```bash
craboodle lint <skill-dir>
```

Fix any flagged issues. Run `craboodle lint --help` for options.

## Step 2: Run Evals

```bash
craboodle run <skill-dir>
```

Run `craboodle run --help` for all available options.

## Step 3: Iterate

Exit-code meanings: `craboodle run --help` (above), or `claude-code-evals/references/results-interpretation.md` § Exit Codes.

| Exit Code | Action |
|-----------|--------|
| 0 | Done |
| 1 | Fix the offending YAML |
| 2 | Read the error message on stderr; fix what it names (often an `evals.yaml` load failure) |
| 3 | Diagnose and fix (see below) |
| 4 | Check tool installation and skill load path; if reps failed, inspect the scenario `errors` block |

For each failing check, diagnose:
- **Skill problem** — The skill doesn't cause the intended behavior. Fix: revise the skill.
- **Check problem** — The skill works but the check doesn't capture it correctly. Fix: revise the check.

To distinguish: read the scuttlerun transcript at `<artifact_dir>/<scenario-id>/rep-<N>/output.yaml` (the `artifact_dir` is printed in craboodle's YAML output).

Iteration rules:
1. Fix one thing at a time (skill OR check, not both)
2. Re-run targeted scenarios after each fix
3. Stop when: exit code 0, or pass rate improvement < 0.05 for 2 iterations

## Final Report

```
## Created: {skill-name}

Location: {path}
Type: {skill-type}
Files: {count}

### Eval Results
Iterations: {count}
Final pass rate: {overall_pass_rate}
```
