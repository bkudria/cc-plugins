---
name: assess
description: "Investigate a scope for problems and opportunities. Use when investigating a codebase, reviewing a feature, auditing configuration, assessing for problems, or exploring and reporting findings."
argument-hint: "[scope to investigate, e.g. 'this codebase' or 'the auth module']"
---

# Assess

Investigate a scope and produce a structured, numbered findings assessment. Each finding describes an observation, problem, or opportunity — never a solution or fix. Output is designed for consumption by the `iterate` skill.

The investigation itself — planning areas, investigating each in parallel, cross-verifying claims, synthesizing the numbered findings, and writing the file — runs as a background Workflow defined in `workflows/investigate.js`. **That script is the single source of truth for investigation behavior, output format, and the observation-only discipline.** This skill resolves the scope, then delegates to it.

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

1. **`$ARGUMENTS` is populated** — treat it as the scope and proceed to Phase 2.
2. **Arguments empty but conversation implies a scope** — confirm the inferred scope with the user, then proceed to Phase 2.
3. **Neither source available** — proceed to Phase 1 (Scope Interview) to gather scope, focus, and (optional) effort from the user.

Phase 1 is the fallback path, not the default entry point.

---

## Phase 1: Scope Interview (fallback)

Determine what to investigate. Use `AskUserQuestion` to gather:

1. **Scope** — What area to investigate (codebase, feature, skill, session, configuration, etc.)
2. **Focus** — What to look for (problems, gaps, risks, or opportunities for improvement)
3. **Effort** (optional) — How much compute to spend. The default is adaptive: the workflow's planner judges scope complexity and allocates effort (and area count) per area itself. Offer this only as an optional ceiling/bias (low / medium / high); omit it to let the planner decide.

If the scope is broad (entire codebase, "everything"), ask for priority areas or known pain points.

---

## Phase 2: Investigate (delegated)

Once the scope is resolved, run the investigation workflow. It plans the areas, investigates each in parallel (observation-only), cross-verifies overlapping claims, synthesizes the numbered assessment, and writes it to disk.

Invoke:

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/skills/assess/workflows/investigate.js",
  args: {
    scope: "<resolved scope>",
    focus: "<focus from Phase 1; omit to use the workflow default>",
    effort: "<low | medium | high>  // OPTIONAL ceiling; omit to let the planner allocate adaptively",
    sessionId: "${CLAUDE_SESSION_ID}"
  }
})
```

- `scope` is **required**; the workflow bails if it is missing.
- `focus` and `effort` come from Phase 1 when the interview ran. When the scope came straight from `$ARGUMENTS` (Phase 0, step 1), omit `focus` and `effort` — the workflow uses its default (broad focus) and allocates effort adaptively.
- `effort` is an OPTIONAL ceiling: when the interview produced one, map quick scan → `low`, standard review → `medium`, comprehensive analysis → `high`. Omit it entirely to let the planner judge complexity and allocate effort (and how many areas) itself.
- Always pass `sessionId: "${CLAUDE_SESSION_ID}"` so the assessment is written to `/tmp/assessment-${CLAUDE_SESSION_ID}.md`.

**The `Workflow` call is non-blocking.** It returns immediately with a task id; the investigation then runs in the background — usually several minutes, though a high-effort run over a broad scope can take considerably longer (tens of minutes). The real result — `{ scope, effort, areas, observationCount, findingsCount, outPath, markdown }` — arrives later as a `<task-notification>` carrying that task id, *not* as the return value of the `Workflow` call.

**After invoking `Workflow`, stop. Your turn is over.** Do not call any tool, do not investigate the scope yourself, do not read the assessment file or the workflow's journals, and do not assume, summarize, or imagine a result — fabricating a `<task-notification>` or a completion you have not received is a failure. There is nothing to do but wait. You are re-prompted automatically when the genuine `<task-notification>` arrives; only then continue to Phase 3.

---

## Phase 3: Present

Enter Phase 3 only when the genuine `<task-notification>` for the workflow's task id arrives with `status: completed`. Its payload carries the investigation result — `findingsCount`, `areas`, `outPath`, and the assessment `markdown`. A long `markdown` is truncated in the notification, so the written file is the complete copy.

1. `Read` the canonical file the workflow wrote — `/tmp/assessment-${CLAUDE_SESSION_ID}.md` — and output its full contents **verbatim** in the conversation: reproduce the document exactly as written, preserving every `### N.` finding heading, `**Significance**:` line, and body paragraph. Do NOT reorganize, regroup (e.g. by severity), renumber, summarize, or collapse findings into a list — the document's structure is deterministic and is consumed downstream, so reshaping it breaks `iterate`'s recovery and the format contract. Reading retrieves the complete assessment the notification may have truncated; do not re-write the file (the workflow already did).
2. State: "Assessment saved to `/tmp/assessment-${CLAUDE_SESSION_ID}.md` — run `/triage:iterate` to process findings."

**Never fabricate.** If no genuine completion notification has arrived, or the result carries an `error` (no scope, no areas planned), or `findingsCount` is 0, say so plainly — never reconstruct findings by investigating the scope yourself, and never act on a completion you have not actually received. The findings format and observation-only rules are enforced inside the workflow; do not re-run or post-edit the assessment to "fix" its phrasing — if it drifts, the fix belongs in `workflows/investigate.js`.
