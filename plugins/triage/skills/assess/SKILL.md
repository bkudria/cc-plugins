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
| `Read` | Present the written assessment |

The investigation's read-only tools (`Read`, `Grep`, `Glob`, `Bash`), the planning/verifying/synthesizing sub-agents (`Agent`), and the file write (`Write`) all run *inside* the workflow — they are not invoked directly by this skill.

---

## Phase 0: Scope Resolution

Determine the investigation scope before any work begins. Check in order:

1. **`$ARGUMENTS` is populated** — treat it as the scope and proceed to Phase 2.
2. **Arguments empty but conversation implies a scope** — confirm the inferred scope with the user, then proceed to Phase 2.
3. **Neither source available** — proceed to Phase 1 (Scope Interview) to gather scope, focus, and depth from the user.

Phase 1 is the fallback path, not the default entry point.

---

## Phase 1: Scope Interview (fallback)

Determine what to investigate. Use `AskUserQuestion` to gather:

1. **Scope** — What area to investigate (codebase, feature, skill, session, configuration, etc.)
2. **Focus** — What to look for (problems, gaps, risks, or opportunities for improvement)
3. **Depth** — How deep to go (quick scan, standard review, comprehensive analysis)

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
    depth: "<quick | standard | comprehensive>",
    sessionId: "${CLAUDE_SESSION_ID}"
  }
})
```

- `scope` is **required**; the workflow bails if it is missing.
- `focus` and `depth` come from Phase 1 when the interview ran. When the scope came straight from `$ARGUMENTS` (Phase 0, step 1), omit `focus` and `depth` — the workflow uses its defaults (broad focus, `standard` depth).
- Map the interview's depth answer: quick scan → `quick`, standard review → `standard`, comprehensive analysis → `comprehensive`. `depth` controls how many areas the investigation is broken into.
- Always pass `sessionId: "${CLAUDE_SESSION_ID}"` so the assessment is written to `/tmp/assessment-${CLAUDE_SESSION_ID}.md`.

The workflow runs in the background and returns when complete, yielding `{ scope, depth, areas, observationCount, findingsCount, outPath, markdown }`.

---

## Phase 3: Present

When the workflow completes:

1. Output the full assessment in the conversation — use the returned `markdown`, or `Read` it back from the returned `outPath`.
2. State: "Assessment saved to `/tmp/assessment-${CLAUDE_SESSION_ID}.md` — run `/triage:iterate` to process findings."

If the workflow returns an `error` (no scope, no areas planned) or `findingsCount` of 0, report that plainly rather than presenting an empty assessment. The findings format and observation-only rules are enforced inside the workflow; do not re-run or post-edit the assessment to "fix" its phrasing — if it drifts, the fix belongs in `workflows/investigate.js`.
