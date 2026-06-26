---
name: assess
description: "Investigate a scope for problems and opportunities. Use when investigating a codebase, reviewing a feature, auditing configuration, assessing for problems, or exploring and reporting findings."
argument-hint: "[scope to investigate, e.g. 'this codebase' or 'the auth module']"
---

# Assess

Investigate a scope and produce a structured, numbered findings assessment. Each finding describes an observation, problem, or opportunity — never a solution or fix. Output is designed for consumption by the `iterate` skill.

The investigation itself — planning areas, investigating each in parallel, checking coverage for gaps with targeted re-investigation, cross-verifying claims, synthesizing the numbered findings and writing the file, then grounding each finding's citations against source and re-writing the file to correct any finding whose body contradicts source — runs as a background Workflow defined in `workflows/investigate.js`. **That script is the single source of truth for investigation behavior, output format, and the observation-only discipline.** This skill resolves the scope, then delegates to it.

## When to Use

- Conducting an investigation or analysis of a codebase, feature, or tool
- Reviewing for problems and opportunities for improvement
- Auditing configuration, session transcripts, or documentation
- Exploring a topic where findings need to be actioned later via `/triage:iterate`
- Any task matching: "explore and present findings", "investigate and report", "review in detail"

## Dependencies

| Tool | Purpose |
|------|---------|
| `AskUserQuestion` | Phase 1 scope interview |
| `Workflow` | Run the investigation (`workflows/investigate.js`) |
| `Read` | Present the full assessment by reading the file the workflow wrote (`outPath`) |

The investigation's read-only tools (`Read`, `Grep`, `Glob`, `Bash`), the planning/verifying/synthesizing sub-agents (`Agent`), and the file write (`Write`) all run *inside* the workflow — they are not invoked directly by this skill.

---

## Phase 0: Scope Resolution

Determine the investigation scope before any work begins. Check in order:

1. **`$ARGUMENTS` is populated** — resolve scope **and** focus from it, then proceed to Phase 2:
   - Scope-only arguments (no directional intent) → the whole string is the `scope`; leave `focus` unset (the workflow uses its default).
   - Arguments that also carry a **focus directive** — any clause that narrows *what to look for* within the scope, as opposed to naming *what area to look at* — must be **split**: the area portion becomes `scope`, the steering portion becomes `focus`. Recognize the directive by that function, not by a fixed vocabulary: explicit markers ("focus on…", "I care about…", "looking for…", "rather than…", "not …") are the clearest signal, but unmarked phrasing carries the same intent and counts equally ("…, especially the token refresh path"; "the parser, particularly its error recovery"; "with emphasis on retry handling"). Do **not** fold the directive into an expanded `scope`; a directive left inside `scope` never reaches the workflow's `focus` parameter, so the investigation falls back to its generic default focus and the user's steer is lost. When the directional intent is clear — whether marked or unmarked — do the split silently; only when it is genuinely ambiguous which part is scope vs. focus (or whether a directive is present at all) confirm the inferred split with the user before proceeding (as in step 2).
2. **Arguments empty but conversation implies a scope** — confirm the inferred scope with the user, then proceed to Phase 2.
3. **Neither source available** — proceed to Phase 1 (Scope Interview) to gather scope, focus, and (optional) effort from the user.

Phase 1 is the fallback path, not the default entry point.

---

## Phase 1: Scope Interview (fallback)

Determine what to investigate. Use `AskUserQuestion` to gather:

1. **Scope** — What area to investigate (codebase, feature, skill, session, configuration, etc.)
2. **Focus** — What to look for (problems, gaps, risks, or opportunities for improvement)
3. **Effort** (optional) — How much investigative rigor to spend, not merely compute. The default is adaptive: the workflow's planner judges scope complexity and allocates effort (and area count) per area itself. Offer this only as an optional ceiling/bias (low / medium / high); omit it to let the planner decide. Effort **gates qualitative stages**, so disclose what each level buys when you offer it: at **low** the workflow runs a bare investigate→synthesize pass with the completeness-gap loop, adversarial cross-verification of findings, citation grounding, **and** the plan critique all skipped; **medium** adds one completeness round, two verification lenses, and grounding; **high** adds a second completeness round and a third (over-claim) lens. Because `low` drops most of the quality checks, surface that trade-off when a user reaches for it to "save time," and prefer omitting effort (adaptive) over forcing `low`.

If the scope is broad (entire codebase, "everything"), ask for priority areas or known pain points.

---

## Phase 2: Investigate (delegated)

Once the scope is resolved, run the investigation workflow. It plans the areas, reads the source once to share an orientation map with the area investigators, investigates each area in parallel (observation-only), checks coverage for gaps with targeted re-investigation, cross-verifies overlapping claims, synthesizes the numbered assessment and writes it to disk, then grounds each finding's citations against source.

Invoke:

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/skills/assess/workflows/investigate.js",
  args: {
    scope: "<resolved scope>",
    focus: "<focus from Phase 1, or the focus directive split out of combined $ARGUMENTS; omit only when scope-only and no interview ran>",
    effort: "<low | medium | high>  // OPTIONAL ceiling; omit to let the planner allocate adaptively",
    sessionId: "${CLAUDE_SESSION_ID}"
  }
})
```

- `scope` is **required**; the workflow bails if it is missing.
- `focus` comes from Phase 1 (interview) **or** from Phase 0 step 1 when the arguments embedded a focus directive. Pass it whenever either path produced one; omit it only when the arguments were scope-only and no interview ran — then the workflow uses its default (broad focus). Never fold a focus directive into `scope`; route it to `focus`.
- `effort` comes from Phase 1 when the interview ran. When the scope came straight from `$ARGUMENTS`, omit `effort` so the planner allocates it adaptively.
- `effort` is an OPTIONAL ceiling: when the interview produced one, map quick scan → `low`, standard review → `medium`, comprehensive analysis → `high`. Omit it entirely to let the planner judge complexity and allocate effort (and how many areas) itself. Remember `low` disables the completeness, adversarial-verification, grounding, and plan-critique stages (see Phase 1), so reserve it for genuinely quick scans.
- Always pass `sessionId: "${CLAUDE_SESSION_ID}"` so the assessment is written to `/tmp/assessment-${CLAUDE_SESSION_ID}.md`.

**The `Workflow` call is non-blocking.** It returns immediately with a task id; the investigation then runs in the background — usually several minutes, though a high-effort run over a broad scope can take considerably longer (tens of minutes). The real result — `{ findingsCount, areas, outPath, markdown, status, coverage, effort }` (`status` is `ok` / `degraded` / `failed`; `coverage` is `{ planned, completed, dropped }`; `effort` is the run's overall effort — the ceiling you passed, or, when you omitted it, the most ambitious effort the planner chose for any area, so an `effort` you did not set reflects a planner decision rather than your input) — arrives later as a `<task-notification>` carrying that task id, *not* as the return value of the `Workflow` call.

**After invoking `Workflow`, stop. Your turn is over.** Do not call any tool, do not investigate the scope yourself, do not read the assessment file or the workflow's journals, and do not assume, summarize, or imagine a result — fabricating a `<task-notification>` or a completion you have not received is a failure. There is nothing to do but wait. You are re-prompted automatically when the genuine `<task-notification>` arrives; only then continue to Phase 3.

---

## Phase 3: Present

Enter Phase 3 only when the genuine `<task-notification>` for the workflow's task id arrives with `status: completed`. Its payload carries the investigation result described in Phase 2. A long `markdown` is truncated in the notification, so the written file is the complete copy.

1. `Read` the canonical file the workflow wrote — `/tmp/assessment-${CLAUDE_SESSION_ID}.md` — and output its full contents **verbatim** in the conversation: reproduce the document exactly as written, preserving every `### N.` finding heading, `**Significance**:` line, and body paragraph. Do NOT reorganize, regroup (e.g. by severity), renumber, summarize, or collapse findings into a list — the document's structure is deterministic and is consumed downstream, so reshaping it breaks `iterate`'s recovery and the format contract. Reading retrieves the complete assessment the notification may have truncated; do not re-write the file (the workflow already did).
2. **If `status` is not `ok`, surface the reliability state** after the verbatim output (the document you just read already reflects any corrections the workflow persisted — the corrective grounding pass re-writes the file in place). Report, as a short caveat block:
   - **Auto-corrections** — when `grounding.corrected` is non-empty, state that N finding(s) were automatically corrected against source after synthesis (they are already fixed in the file above).
   - **Unresolved citations** — list each remaining entry in `grounding.ungrounded` (its `findingNumber`, `citation`, `problem`, and `detail`) as a caveat the reader should weigh before acting on that finding.
   - **Reliability flags** — surface any `reliabilityFlags` (e.g. a skipped critic, partial verification, or a failed corrective re-write).

   This is surfacing only: do NOT edit the file or rephrase findings to "fix" the residual — the corrections that could be made were already applied by the workflow; what remains is what it could not auto-correct.
3. State: "Assessment saved to `/tmp/assessment-${CLAUDE_SESSION_ID}.md` — run `/triage:iterate` to process findings."

**Never fabricate.** If no genuine completion notification has arrived, or the result carries an `error` (no scope, no areas planned), or `findingsCount` is 0, say so plainly — never reconstruct findings by investigating the scope yourself, and never act on a completion you have not actually received. The findings format and observation-only rules are enforced inside the workflow; do not re-run or post-edit the assessment to "fix" its phrasing — if it drifts, the fix belongs in `workflows/investigate.js`.
