# Check Design

Write checks that test what your configuration specifically adds, not what Claude already does.

---

## Check Rules

1. **Objectively verifiable** — A grader must determine pass/fail unambiguously from the output
2. **Specific** — Reference concrete elements (patterns, structures, values), not vague qualities
3. **Config-targeted** — Test behavior the configuration specifically changes, not generic Claude capabilities

## The Key Question

Before writing a check, ask:

> **"Would Claude do this WITHOUT this configuration?"**

If yes, the check tests baseline behavior, not config value. Revise it to target what the configuration specifically adds.

**Example**: If your CLAUDE.md says "always validate user input" —
- Weak: `"Output contains a function"` — Claude writes functions without any instruction
- Strong: `"Output validates input before processing, including edge cases like empty string and null"` — tests whether the instruction changed behavior

---

## Check Patterns

| Pattern | When to Use | Example |
|---------|-------------|---------|
| **Presence** | Config teaches specific content or terminology | `"Output uses parameterized queries for database access"` |
| **Absence** | Config steers away from anti-patterns | `"Output does NOT use string concatenation for SQL queries"` |
| **Structural** | Config requires specific output format | `"The file contains a TypeScript interface, not a plain object"` |
| **Behavioral** | Config changes what tools or actions are used | `"A test file was created using the Write tool before production code"` |
| **Process** | Config enforces ordering or workflow steps | `"The agent asks the user for confirmation before deleting files"` |
| **Specificity** | Config teaches the idiomatic approach over a generic one, **and the alternative is incorrect or an anti-pattern** | `"Uses parameterized queries, not string concatenation for SQL"` |

Most scenarios need 2-3 different pattern types.

**Pair negative and ordering checks with a Presence check.** An **Absence** (`"no X…"`) or **Process** (`"…before any X"`) check passes *vacuously* on a transcript where X never happens — it cannot fail on a bad run, so it cannot tell good behavior from bad. Add a Presence check that X occurs, giving the negative or ordering claim something real to constrain. Lint flags the un-paired form as **unfalsifiable**.

**When presence IS the signal, declare it in `note:`.** Two check designs are deliberate WHETHER checks: the Presence *anchor* added for the pairing above, and a *regression baseline* ("the baseline task still completes with this config loaded" — it fails when the config breaks the behavior). Both look like lint's tautological/always_passes targets, so say what the check is for in its `note:` in plain prose — e.g. `note: "Presence anchor paired with no-edit-without-ask"` or `note: "Regression baseline — the config must not break plain file edits"`. Lint reads notes and honors declared intent; there is no special syntax. The declaration settles only the WHETHER objection — a vague, compound, or unverifiable check is still flagged.

Presence-only is also frequently the *correct* form, not a fallback: scuttlerun transcripts drop the content written by Write/Edit (`content`, `old_string`, `new_string`) by design, so a content-level assertion forces the grader to infer the written text from prose and grades flakily run-to-run. Asserting the write occurred (by path), constrained by a paired negative or ordering check, is the gradeable design.

---

## Anti-Patterns

Run `pincenez lint --help` for the authoritative definitions (each anti-pattern has a description plus a bad/fixed example). Brief overview:

| Anti-Pattern | Quick Take |
|---|---|
| **vague** | Subjective terms without specifics ("high quality", "best practices") |
| **compound** | Tests two+ independent things; split them |
| **tautological** | Restates the prompt instead of asserting HOW |
| **always_passes** | Tests baseline Claude behavior, not config-added value |
| **unverifiable** | Tests internal state the grader can't observe |
| **over_specific** | Mandates one implementation when multiple valid outcomes exist |
| **unfalsifiable** | Structurally can't fail — a negative/ordering check that passes vacuously when its subject never occurs |

When writing checks, apply the Pre-Write Checklist below (§ Pre-Write Checklist) — it translates each anti-pattern into a self-test question with concrete action. One sanctioned exception: a check whose `note:` declares it as a presence anchor or regression baseline (see § Check Patterns) deliberately tests WHETHER, and lint honors that declaration for **tautological**/**always_passes** only.

### Splitting Compound Checks

Before (compound — if it fails, which case is missing?):
```yaml
- handles-both-cases:
    check: "Expression handles both the internal and external cases, not just one"
```

After (split — each check fails independently):
```yaml
- handles-internal-case:
    check: "Expression contains a select condition targeting services with type \"internal\" and setting their port to 8080"
- handles-external-case:
    check: "Expression contains a select condition targeting services with type \"external\" and setting their port to 443"
```

Before (compound — "valid syntax" + "no jq-only constructs" are independent claims):
```yaml
- produces-valid-yq:
    check: "The complete expression is valid yq v4 syntax with no jq-only functions like def, foreach, limit, or inputs"
```

After (split — syntax validity and jq avoidance tested separately):
```yaml
- no-jq-only-constructs:
    check: "Expression contains none of the jq-only constructs: def, foreach, limit, inputs, or reduce (use ireduce for yq v4)"
```

---

## Good vs Bad Checks

| Bad (Subjective/Vague) | Good (Objective/Specific) |
|------------------------|--------------------------|
| "Output is high quality" | "Output contains a markdown table with at least 3 rows" |
| "Code follows best practices" | "Code uses parameterized queries, not string concatenation for SQL" |
| "Answer is correct" | "Output includes the formula `E = mc^2` or equivalent" |
| "Handles errors well" | "Output includes a try/catch or error check before the file read" |
| "Uses the right approach" | "Uses .[] \| select(.age > 18) pattern, not map(select(...))" |
| "CLAUDE.md was followed" | "Tests were written before production code, matching the TDD instruction" |
| "Hook worked" | "Pre-commit output appears in the transcript before the commit completes" |

---

## Check Count

- **Minimum**: 2 per scenario
- **Recommended**: 3-5 per scenario
- **Maximum**: 7 per scenario (more adds noise without improving signal)

---

## Targeting Config-Specific Value

Different configuration types add value in different ways. Target checks accordingly:

| Config Type | Claude's Default | What Config Adds | Good Check Targets |
|-------------|-----------------|------------------|----------------------|
| Skills | Generic approach | Specific method, domain knowledge | The taught method appears, generic shortcuts are avoided |
| CLAUDE.md | Follows request as stated | Consistent behavioral rules | Rules are followed even when not explicitly asked |
| Hooks | No side effects | Pre/post processing, gates | Side effects are visible in transcript, gates block when they should |
| MCP Servers | No external tools | Domain-specific tool access | Agent discovers and uses the MCP tool, results are incorporated |
| Settings | Default tool/model config | Constrained or expanded capabilities | Behavior reflects the constraint (e.g., limited tools, specific model) |

---

## Pre-Write Checklist

Apply these tests to each check **before writing it to a file**, and again to any rewrite you produce in response to a lint flag — don't narrow focus to the flagged row; re-run every self-test, because rewrites frequently reintroduce a different anti-pattern (see Common Slips below). Catching anti-patterns here is free; catching them via `craboodle lint` costs a lint cycle per fix.

| Anti-Pattern | Self-Test | If Yes |
|---|---|---|
| **Compound** | Enumerate every independent fact this check asserts. If the count is >1, it's compound. Signals: "and", "both", "as well as", "likewise", "also", "then", semicolons joining clauses, capitalized "AND" (including after a "fix"), temporal/ordering phrases like "before X-ing" or "after Y-ing" that bundle a second claim onto the first. | Split into separate checks — one per independent fact. If one claim is a precondition of another (e.g., "X happens before Y"), keep the ordering claim as a single check; do not bundle it with a claim about X's content. |
| **Vague** | Could two graders disagree on pass/fail? Signals: "valid", "correct", "appropriate", "proper", plus abstract nouns standing in for observable actions ("investigation", "presentation", "consideration", "review") without a concrete criterion. | Add a concrete syntactic example or name the specific element to look for. Replace abstract nouns with the observable tool call, file, or output pattern that would satisfy the claim. |
| **Always-passes** | Would Claude do this without the configuration? | Revise to target what the config specifically adds — the delta, not the baseline. Exception: a regression baseline deliberately asserts the baseline survives the config — keep the check and declare the intent in `note:`. |
| **Tautological** | Does this check mirror the prompt wording? (Prompt: "write a function" → Check: "output contains a function") | Assert HOW — the specific structure, approach, or method — not WHETHER. Exception: presence anchors and regression baselines deliberately assert WHETHER — keep the check and declare the intent in `note:`. |
| **Unverifiable** | Can the grader observe this in the output? Signals: "understood", "considered", "thought about". | Rewrite as observable behavior: what the agent produced, not what it reasoned. |
| **Over-specific** | Does this check mandate a specific function/operator/tool when the outcome is what matters? Signals: "uses [function name]" as a requirement, "uses X rather than Y" when Y isn't actually wrong. | Rewrite to test the outcome or behavior. Optionally mention specific approaches as non-exhaustive examples: "achieves X (e.g., via ireduce or map\|add)". |
| **Unfalsifiable** | Could any realistic transcript make this check FAIL? Signals: "no X without Y", "never X unless Y", or an ordering clause whose subject (X) the agent might simply never do. | Pair it with a Presence check asserting X occurs, so the negative/ordering claim has something to constrain — or drop it if no realistic transcript could fail it. Give the added Presence anchor a `note:` declaring the pairing, so lint reads it as deliberate. |

### Common Slips

Patterns that look like single checks but fail lint as compound, vague, or unfalsifiable. Recognize them on sight. The "Capitalized AND after a fix" row catalogues the rewrite failure mode specifically — re-run the full Pre-Write Checklist against every rewrite, not just the flagged row.

| Pattern | Why it slips | Example | Fix |
|---|---|---|---|
| **Likewise-joined intervals** | "likewise"/"also" isn't in the usual "and/both" signal set, but it joins two independent claims. | "Between the edits to A and B there is an AskUserQuestion; **likewise** between B and C" | Two checks: one per interval. |
| **Before/after-clause embedding** | A temporal clause quietly adds a second claim (the ordering). | "The agent asks about item 2 **before making any edit to** hello.py" | Split: (1) asks about item 2; (2) the ask precedes any edit to hello.py. |
| **Abstract-noun stand-ins** | Nouns like "investigation", "presentation", "review" sound concrete but need a grader to infer what counts. | "investigation before presentation" | Replace with observable: "at least one Read/Grep/Bash call against the file before writing findings". |
| **Capitalized "AND" after a fix** | Re-authoring a compound check often introduces a second compound in the "fix" (the agent sees the first conjunction, misses the next). | "...makes an investigative tool call **AND** asks a separate AskUserQuestion" | Apply the enumeration test to the rewrite, not just the original. |
| **Enumerated list as requirement** | A short list of specific tools, files, or syntaxes looks concrete but disallows equivalent alternatives — lint treats "X or Y" as "only X or Y" when an outcome-equivalent Z exists. | "**Read or Grep** tool call targeting notes.md" (misses `cat`/`head`/`Bash`); "**pyproject.toml, setup.py, setup.cfg, or requirements.txt**" (misses `package.json`, `Cargo.toml`, `go.mod`); "**ATX-style headings (`#`)**" (misses setext); "'**trailing whitespace' or 'version: 1.0'**" (misses other concrete triggers) | Ask: would an equivalent alternative satisfy the intent? If yes, rewrite as the outcome ("any file-reading tool call against notes.md", "a project-manifest file") and keep the enumeration as non-exhaustive examples ("e.g., Read, Grep, or Bash cat"). |
| **Vacuous negative-universal** | A "no X without Y" / "never X unless Y" check reads as strict but passes trivially when X never occurs — it can't fail on a bad transcript. | "**No** edit to `config.py` **without a preceding** AskUserQuestion" — passes in any run that never touches `config.py`. | Pair with a Presence check for the subject: (1) "an edit to `config.py` occurs"; (2) the no-edit-without-ask claim. |

---

## Lint Before Running

Always lint checks before spending money on eval runs:

- **Review rules first**: `pincenez lint --help` — shows the full anti-pattern definitions with examples and check-writing guidance. Read this before writing checks to avoid common issues.
- **Single checks file**: `pincenez lint checks.yaml` — catches anti-patterns in one checks file
- **Full eval suite**: `craboodle lint <root>` — checks all scenarios

Linting catches vague, compound, tautological, always-passes, unverifiable, over-specific, and unfalsifiable checks before they waste LLM calls. Fix flagged issues, then run. One class of flag is fixed by declaring rather than rewriting: a tautological/always_passes flag on a deliberate presence anchor or regression baseline means the check is missing its `note:` intent declaration — add it and re-lint; don't delete a legitimate anchor.

---

## How Checks Get Graded

Each check is graded independently by pincenez (one LLM call per check) against the agent's transcript. This independence prevents cross-contamination — earlier verdicts cannot influence later ones.

With multiple repetitions, pass rates are averaged across reps:

- `pass_rate = 1.0` — check passed in all reps
- `pass_rate = 0.67` — passed in 2 of 3 reps
- `pass_rate = 0.0` — failed in all reps

Failures include per-rep evidence explaining why the check failed. This evidence helps diagnose whether the issue is in the configuration or the check itself.

### Grading notes

The `note:` field on checks significantly improves grading accuracy. Use it to tell the grader what to look for:

```yaml
checks:
  - check: "Tests were written before production code"
    note: "Look for Write tool calls — test file should appear before the main implementation file"
```

Notes are hints, not definitions. They orient the grader toward the right evidence without changing what pass/fail means.

Notes do double duty at lint time: `pincenez lint` reads the same field as declared intent. A note naming the check's design — presence anchor for a paired negative check, regression baseline — keeps deliberate WHETHER checks from being misflagged as tautological/always_passes. Grading semantics are unchanged: notes still orient, and never redefine pass/fail.
