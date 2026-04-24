---
name: assess
description: "Investigate a scope for problems and opportunities. Use when investigating a codebase, reviewing a feature, auditing configuration, assessing for problems, or exploring and reporting findings."
argument-hint: "[scope to investigate, e.g. 'this codebase' or 'the auth module']"
---

# Assess

Investigate a scope and produce a structured, numbered findings assessment. Each finding describes an observation, problem, or opportunity — never a solution or fix. Output is designed for consumption by the `iterate` skill.

## When to Use

- Conducting an investigation or analysis of a codebase, feature, or tool
- Reviewing for problems and opportunities for improvement
- Auditing configuration, session transcripts, or documentation
- Exploring a topic where findings need to be actioned later via `/iterate`
- Any task matching: "explore and present findings", "investigate and report", "review in detail"

## Dependencies

| Tool | Purpose |
|------|---------|
| `Read`, `Grep`, `Glob`, `Bash` (read-only) | Investigation and evidence gathering |
| `Agent` | Sub-agents for deep-area investigation |
| `AskUserQuestion` | Phase 1 scope interview |
| `TaskCreate`, `TaskUpdate` | Progress tracking across areas |
| `Write` | Persist the assessment file |

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

## Phase 2: Exploration Planning

Break the scope into areas that can be explored semi-independently and assess complexity. Each area is a facet of the scope, not a disconnected inventory — it should contribute to a cohesive investigation of the overall question.

- **Quick** (1-2 reads) — investigate directly
- **Moderate** (5-10 tool calls) — investigate directly
- **Deep** (extensive exploration) — dispatch a sub-agent

If the investigation has 4+ areas, create a task (via `TaskCreate`) for each to track progress.

### Sub-agent prompts

When a Deep area warrants a sub-agent, the prompt must include: (1) the observation-only constraint — no fixes or solutions, (2) the output format — numbered observations, each a single paragraph with a short title and specific evidence, and (3) a one-line list of the other areas in the overall scope for context (these areas may be investigated by the main agent directly or by other sub-agents — do not assert parallelism that does not exist).

> Investigate [AREA] within [SCOPE]. Other areas in this investigation: [LIST OF OTHER AREAS]. Look for problems, inconsistencies, surprising patterns, missing pieces, and opportunities for improvement. Do NOT suggest fixes or solutions — only describe what is found. Report as numbered observations, each a single paragraph with a short title. Include specific evidence (file paths, line numbers, values) in every observation.

---

## Phase 3: Investigation

Execute the exploration plan. For each area:

1. Read relevant files, search for patterns, examine configuration
2. Note concrete observations — always include file paths, line numbers, or specific values
3. Identify relationships between areas (a test gap may relate to a code pattern)
4. Mark area complete via `TaskUpdate` if progress tasks exist

### Investigation discipline

- **Specificity required** — Every finding must reference concrete evidence: a file path, a configuration value, a pattern with examples, or a metric. Findings without evidence are opinions, not findings.
- **Breadth before depth** — Survey all areas at surface level first. Go deep only where initial survey reveals something noteworthy.
- **No solutions** — Record what IS, not what SHOULD BE. Describe the current state and why it is noteworthy. The urge to prescribe a fix means the finding is ready to write down as-is.

### Sub-agent verification

When sub-agents were dispatched, complete these checks before proceeding to Phase 4:

1. **Cross-reference claims between sub-agents** — If any two sub-agents' areas overlap on a shared file, value, or claim, verify the shared element independently before synthesis. If their domains are fully disjoint, state that explicitly and move on.
2. **Spot-check numerical claims** — Counts, frequencies, and statistics are especially error-prone. Run one independent check on the most significant number.
3. **Test tool reliability** — If a sub-agent relied on a tool that could have timed out, truncated, or silently failed, verify the tool produced complete results.

If a check does not apply (e.g., no numerical claims), note why and move on — do not skip silently.

---

## Phase 4: Synthesis and Output

### Organize findings

The numbered observations returned by sub-agents are an input, not the final form. Sub-agent numbering is discarded; each finding's number comes from significance order after merging, splitting, and filtering. A single sub-agent observation may become zero findings (filtered out), one finding (preserved or rewritten), or multiple findings (split). A finding may also aggregate observations from several sub-agents.

1. Group related observations into discrete findings
2. **Filter for actionability** — Drop observations that are purely informational (neutral descriptions of working-as-designed behavior, positive observations with no implied problem or opportunity). A finding belongs in the assessment only if it identifies a problem, a gap, a risk, or a concrete opportunity for improvement. "X works correctly" is not a finding, but "X works correctly and is undocumented" is a documentation gap and qualifies.
3. Order by significance — most impactful first
4. **Merge overlapping observations** — If two findings share a root cause or near-identical concluding clause, they describe the same issue. Keep the stronger framing; fold the other's unique evidence into it.
5. Split compound issues into separate findings

### Write the assessment

Produce an assessment with this structure:

```
## Assessment: [Scope Description]

**Scope**: [what was investigated]
**Areas covered**: [list of areas explored]

## Findings

### 1. [Short descriptive title]

[Detailed observation. What was found, where (file paths, line numbers),
current state, and why this is noteworthy. Includes specific evidence.]

### 2. [Short descriptive title]

[...]

## Summary

[N] findings. [Brief overall assessment — describe the concentration of problems, recurring root causes, and severity. The filter-for-actionability rule applies here too: do not include positive observations or working-as-designed notes.]
```

### Finding format rules

- Each finding is an h3 subsection under `## Findings`, numbered in the heading text (e.g., `### 1. Title`)
- The heading contains the finding number and a short descriptive title — no bold markers, no em dash, no body text on the heading line
- Body is a regular paragraph after the heading — no sub-bullets, no nested structure
- Body includes concrete evidence: file paths, values, patterns observed
- Body describes WHAT and WHY it is noteworthy — never HOW to fix it
- Each finding stands alone without requiring context from other findings

### Red flags — rewrite the finding if it contains any of these

- "Consider..." / "Should..." / "Could..." / "Recommend..."
- "Fix by..." / "Solution:" / "To resolve this..."
- "Migrate to..." / "Replace with..." / "Switch to..."
- Any imperative verb directed at future action
- **Modal verbs of obligation or suggestion anywhere in the body** — `should`, `could`, `would`, `must`, `ought to`. Mid-sentence modals are the common slip: "debug endpoints that should not be accessible" prescribes just as clearly as "Should disable debug endpoints". Rewrite as pure description: "debug endpoints are exposed in `config.py`".

These signal a solution, not a finding. Strip the prescription and keep only the observation — describe the current state and what makes it noteworthy, not what the system should be.

### Persist and present

1. Write the complete assessment to `/tmp/assessment-${CLAUDE_SESSION_ID}.md`
2. Output the full assessment in the conversation message

State at the end: "Assessment saved to `/tmp/assessment-${CLAUDE_SESSION_ID}.md` — run `/iterate` to process findings."

---

## Compaction Recovery

If a compaction occurred and the assessment needs to be reconstructed, read `/tmp/assessment-${CLAUDE_SESSION_ID}.md` and output it again in conversation so `iterate` can find it.
