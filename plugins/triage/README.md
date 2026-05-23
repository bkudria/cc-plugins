# triage

Assess a scope to produce findings, then address them one-by-one.

## What's in this plugin

triage bundles two skills that compose into an assess-then-iterate workflow:

- **[assess](skills/assess/SKILL.md)** — investigates a scope and produces a structured, numbered findings assessment. Each finding describes an observation or opportunity, never a fix. Output is persisted to `/tmp/assessment-<session-id>.md` and printed to the conversation.
- **[iterate](skills/iterate/SKILL.md)** — walks a list of items (typically from an assess output) one at a time, presents each with an `AskUserQuestion` gate (Implement / Plan first / Skip), and processes them in turn.

## How the skills relate

assess and iterate are designed to be chained:

1. Run `/triage:assess <scope>` to produce a numbered findings document.
2. Run `/triage:iterate` (no args) to recover the assessment and process findings one at a time.

Either skill can also be used independently:

- assess on its own produces a standalone report.
- iterate accepts any source list — assess output, a manual list pasted into the conversation, PR review comments, etc.

## Example

    /triage:assess the auth module for security issues
    # → produces /tmp/assessment-<session-id>.md with N numbered findings

    /triage:iterate
    # → recovers the assessment, prompts per-finding for Implement / Plan first / Skip

Filter or scope `iterate` with arguments:

    /triage:iterate 1,3,5             # only findings 1, 3, 5
    /triage:iterate only security-related
    /triage:iterate be thorough with tests

## Auto-trigger behaviour

Each skill is auto-loaded by its own description string. See each `SKILL.md` for trigger conditions:

- **assess** loads when investigating a codebase, reviewing a feature, auditing configuration, or any "explore and report findings" task
- **iterate** loads when processing a list of items, working through review feedback, or batch-implementing changes
