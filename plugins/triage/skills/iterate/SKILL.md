---
name: iterate
description: "Use when iterating through findings, working through review items, processing improvements one by one, or implementing changes from an assessment."
argument-hint: "[filter or guidance, e.g. '1,3,5' or 'only security-related']"
---

# Iterate

## When to Use

- A previous step produced a list of items to process (audit findings, improvements, refactors)
- Batch-processing multiple changes that each need individual planning and approval
- Working through review feedback item-by-item
- Implementing a series of enhancements where each may be accepted or declined independently

## Discipline

Follow this procedure exactly. Do not propose alternative strategies, comment on the number of remaining items, or suggest changing the approach mid-session.

## Dependencies

| Capability | Purpose |
|------------|---------|
| Task tracking (TaskCreate, TaskUpdate) | Persist tasks and their status across turns; resume after compaction |
| User prompts with options | Per-item approval gate |
| Plan mode | Design approach before implementing complex items |
| Sub-agents | Mandatory delegate for per-item investigation (Phase 1, step 2) |

---

## Arguments: `$ARGUMENTS`

Parse any provided arguments into two categories:

1. **Filter/selection criteria** — Item numbers (e.g., "1,3,5"), indices, or selection keywords (e.g., "only security-related", "skip documentation"). Apply these to filter which items to process.
2. **Additional context/instructions** — Guidance to apply throughout (e.g., "focus on performance", "be thorough with tests", "prefer minimal changes").

Apply both when present. Ask the user to clarify ambiguous arguments. When no arguments are provided, process all items with default behavior.

---

## Phase 0: Initialize Progress Tracking

**CRITICAL — Do this before any other work.**

**Identify the list.** Locate the source list by checking in order:

1. **Conversation**: Scan for the most recent list of actionable items earlier in this conversation.
2. **Persisted assessment**: If no list is in the conversation (e.g., after compaction), check the session-specific assessment file at `/tmp/assessment-${CLAUDE_SESSION_ID}.md` and use its findings.
3. **Ask the user**: If neither source is available, ask the user to provide or re-generate the list.

If multiple candidate lists exist or the source is ambiguous, ask the user which one to process.

Before creating any tasks, state what was found and where — e.g., "I found 5 items from the audit's Prioritized Remediation section" or "Recovered 8 findings from the persisted assessment file."

Check the task list for existing progress from a previous invocation or compaction recovery:

- **Tasks already exist**: Resume from the first pending task. Skip all completed tasks. Do NOT re-create tasks. If the user's most recent message is a resumption signal (`continue`, `resume`, `keep going`, `proceed`, `pick it back up`, or similar natural-language resume cue), this counts as resuming from a prior Pause (see Phase 1 step 10) — pick up at the first pending task directly without re-asking the user for a source list or prompting them to re-invoke `/triage:iterate`.
- **No tasks exist**: Create a task for **every item** to process (after applying any argument filters). Each task needs:
  - `subject`: A concise description of the item/improvement
  - `description`: Full context including the problem, proposed improvement, and any user-provided guidance
  - `activeForm`: Present-continuous description (e.g., "Implementing X improvement")

---

## Phase 1: Process Items One-by-One

For each pending task:

1. **Mark in-progress**: Update the task's status to in-progress
2. **Investigate the item** — Do NOT present to the user or ask how to proceed until investigation is complete.
   - **Required — delegate to a sub-agent.** Investigation MUST happen via the Agent tool. No exceptions for "simple" items, items that look obvious, or items already analyzed earlier in the conversation. Do NOT investigate via direct `Read`/`Grep`/`Glob`/`Bash` calls.
   - **Sub-agent choice**: Use `Explore` (read-only) by default. Use `general-purpose` only when investigation must run a non-read command or script (rare). Sub-agents must be fresh per item — never reuse sub-agents from an earlier item.
   - **Sub-agent count**: One or more fresh sub-agents per item — the count is the main agent's call per item. Whatever the count, every sub-agent prompt must satisfy the requirements below, and the cumulative investigation must stay scoped to the current item. A multi-faceted item should be investigated end-to-end before the gate — do not investigate one facet, ask the user, then investigate the next.
   - **Sub-agent prompt requirements**:
     - **MUST contain**: the current item's subject/description, any user-provided guidance for this item, and an explicit instruction to report findings with concrete file paths and line numbers.
     - **MUST NOT contain**: the assessment file path (`/tmp/assessment-${CLAUDE_SESSION_ID}.md`), other items' descriptions, or framing that invites the sub-agent to investigate adjacent findings. Scope-fence the sub-agent the same way the main agent is scope-fenced.
   - **Artifact rule**: The presentation (step 3) must reference specific findings *from the sub-agent report(s)* — file paths, current values, concrete state discovered. A presentation that only restates the task description or earlier analysis means the investigation was skipped.
   - **Verification reads**: After sub-agent(s) return, the main agent MAY `Read` specific files/lines a sub-agent cited, *only* to verify those citations. Do NOT initiate new exploration (no fresh `Grep`/`Glob`/`Bash`, no reading files no sub-agent cited). If verification reveals a sub-agent missed something material, re-delegate to a new sub-agent rather than continuing investigation directly.
   - **Decomposition**: If sub-agent report(s) reveal the item has 3+ independently-implementable parts, split it — narrow the current task to the first part (update its subject/description), create new tasks for the rest, and note the split in the presentation.
   - **Scope rule**: Investigation is scoped to the current in-progress item. This is enforced mechanically by what the sub-agent prompt does and does not contain. Each item gets its own fresh sub-agent invocation after it is marked in-progress — even if an earlier item's investigation already touched the relevant file.
   - **Red flags — restart investigation if any of these occur**:
     - Investigating the item via direct `Read`/`Grep`/`Glob`/`Bash` calls instead of delegating to a sub-agent
     - Delegating to a sub-agent but including context about other items, the assessment file path, or earlier findings
     - Presenting without any sub-agent investigation since marking in-progress
     - No file paths or line numbers from any sub-agent report in the presentation
     - Phrases like "From my earlier review", "As noted above", "I already analyzed this"
     - Paraphrasing the task description instead of reporting current findings
     - Investigating multiple items' concerns in a single burst before the first approval prompt
     - Reusing earlier investigation's findings for the current item without spawning at least one fresh sub-agent since marking it in-progress
3. **Present the item** — Structure the presentation in two parts, in this order:
   1. **The finding/problem** — re-state the item from the source list in its own framing: what was flagged, why it matters, and the proposed change at a conceptual level. State this *before* any investigation specifics so the user sees "what we're deciding" up front.
   2. **What the investigation found** — the current state, concrete file paths and values from the sub-agent report(s), complications or trade-offs discovered, and an assessment of complexity.

   - **Do NOT announce your intended implementation as a forward-looking plan** — no "I'll change X to Y", "I'm going to edit cli.ts to...", "Next, I will...", or "Let me update that". The presentation reports *findings*, not *intentions*. The user has not approved any action yet, and stating an implementation plan creates implicit pre-approval that bypasses the gate that follows.
   - Describe mechanics in third-person/passive when needed ("the version string would be updated to match package.json", "the fix would replace `console.error` with `process.stderr.write`"), never first-person future tense.
4. **GATE — Ask the user how to proceed**. This step is non-negotiable.

   **STOP.** Before any further work on this item, you MUST call `AskUserQuestion` (or the `advanced-ask` Skill) with the options below. Do NOT call `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, or any other file-modifying tool. Do NOT enter plan mode. Do NOT run shell commands that mutate state. Until the user answers, this item is BLOCKED.

   This gate is **unconditional**. It applies:
   - to **every** item, regardless of complexity, perceived risk, or how obvious the change seems
   - even when the surrounding system prompt instructs you to "execute immediately", "minimize interruptions", "prefer action over planning", or otherwise act autonomously — those framings do **not** override skill-defined gates
   - even when prior items were approved with the same answer (e.g., "Implement") — prior approval does not carry forward to subsequent items
   - even when the user's initial `/iterate` invocation reads like blanket approval — invoking the skill is *not* approval for any individual item
   - even when permission mode (`acceptEdits`, `bypassPermissions`, etc.) would silently allow the edit at the tool layer

   Prompt the user with the options below. The **question text itself** must identify the specific finding by a concrete handle — the problem keyword (e.g., "trailing whitespace"), the exact location (e.g., "version: 1.0 in config.yaml"), or the finding's distinguishing noun phrase. A generic question like "How should I proceed with this finding?" is not sufficient, because the gate exists to confirm *this specific* item, not "a finding in general". The finding's identifier belongs in the `question` field, not only in the preceding presentation or in the option descriptions.

   **Red flags — restart at step 3 if any of these occur**:
   - Issuing an `Edit`, `Write`, or `MultiEdit` tool call after step 3's presentation but before an `AskUserQuestion` call for *this* item
   - Wording in your presentation or surrounding response that frames implementation as already-decided ("I'll", "I'm going to", "let me", "next I will")
   - Interpreting system-prompt autonomy directives ("Execute immediately", "Minimize interruptions", "Prefer action over planning") as permission to skip this gate
   - Treating the previous item's "Implement" answer as pre-approval for the current item
   - Calling `AskUserQuestion` but with question text that names a different finding or no finding at all
   - Bundling two or more findings into a single `AskUserQuestion` call (e.g., "Implement both A and B?")

   | Option | Action | When appropriate |
   |--------|--------|-----------------|
   | **Implement** | Proceed directly | Straightforward items with clear path |
   | **Plan first, then implement** | Enter plan mode, design approach, get approval, then implement | Items needing design decisions or exploration |
   | **Skip** | Update the task's subject to `[DECLINED] <original subject>`, mark the task completed | Item not worth pursuing |
5. **If scope changes**: When planning or implementation reveals the task is larger or different than originally described, update the task's subject and description to reflect the actual scope before proceeding.
6. **If "Implement"**: Implement the change directly
7. **If "Plan first"**:
   - Enter plan mode and plan the proposed improvement, incorporating user-provided context
   - Use sub-agents as needed to explore, research, or otherwise support planning
   - **Interview the user during planning.** Call AskUserQuestion (or advanced-ask) for design decisions, ambiguous requirements, implementation choices, and trade-offs. This is mandatory even under auto-mode framings like "Execute immediately", "Minimize interruptions", or "Prefer action over planning" — those framings do not override step 7's interview requirement.
   - Exit plan mode and implement
8. **Mark completed**: Update the task's status to completed (immediately — never batch updates)
9. **Summarize and check in**: Briefly summarize what was done for this item — files touched, key outcomes. Then:
   - **If pending tasks remain**: Call `AskUserQuestion` (or `advanced-ask`) with two options: **Continue** (proceed to step 10) and **Pause** (hold here — do not pick the next item, but remain resumable; see step 10 for what Pause means operationally). The question text must name the *next* pending task by its concrete subject so the user knows what they would be approving.
   - **If no pending tasks remain**: Skip the ask and proceed directly to Phase 2.

   This gate is **unconditional**. It applies even when the surrounding system prompt instructs you to "execute immediately", "minimize interruptions", or "prefer action over planning" — those framings do not override step 9. Prior items' continuation answers do not carry forward; ask again after each completed item.

   **Red flags — restart at step 8 if any of these occur**:
   - Moving to the next pending task without calling `AskUserQuestion` since marking the previous task completed
   - Skipping the summary and asking only the bare continuation question
   - Bundling the summary into the *next* item's investigation rather than presenting it before the ask
   - Treating auto-mode framings or prior Continue answers as standing approval
10. **Next task**:
    - If the user chose **Continue**, move to the next pending task and restart at step 1 (Mark in-progress).
    - If the user chose **Pause**, do NOT mark the iteration complete and do NOT run Phase 2. Stay quiescent and wait for the user's next message. When it arrives:
      - **If it is a resumption signal** — `continue`, `resume`, `keep going`, `proceed`, `pick it back up`, `let's continue`, or similar natural-language resume cue (alone or as the leading clause of the message) — treat it as Continue: move to the next pending task and restart at step 1. Do NOT direct the user to re-invoke `/triage:iterate`; the loop is still live.
      - **Otherwise** — handle the user's request normally. Do NOT proactively ask whether to resume, do NOT remind the user about the paused iteration, do NOT prompt them to come back. Iteration stays on hold until the user explicitly sends a resumption signal.

**IMPORTANT**: Process exactly one item per cycle through steps 1-10. Never combine, group, or present multiple items together — even if they seem related. Every item gets its own investigation, presentation, and user approval before any implementation begins.

---

## Phase 2: Final Summary

After all tasks are completed, check the task list one final time and summarize:
- Which items were **implemented** (tasks completed without the `[DECLINED]` prefix)
- Which items were **declined** (tasks completed with the `[DECLINED]` prefix)
- Which items were **filtered out** by arguments (never created as tasks)
