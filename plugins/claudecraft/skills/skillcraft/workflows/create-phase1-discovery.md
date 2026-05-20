# Phase 1: Discovery

Gather requirements for the new skill. If `$ARGUMENTS` is provided, pre-fill the name/topic.

> **References for this phase:** `references/naming-conventions.md` (for name validation). Do not read other references unless a specific question arises.

## Step 1: Concrete Examples

Ask the user to describe 2-3 concrete examples of how they'd use this skill:

> "Give me 2-3 examples of when you'd want this skill to activate, or how you'd invoke it. Be specific — describe the situation and what you'd expect the skill to do."

Use these examples to:
- Derive a clear skill name and purpose
- Extract natural trigger phrases
- Identify use cases
- Infer skill type (knowledge, workflow, tool, hybrid) — do NOT ask the user to classify

## Step 2: Success Criteria

Ask the user what "good" looks like:

> "What does good output look like when this skill is working? Describe 2-3 examples of the skill performing correctly — what should change about Claude's behavior?"

Optionally, ask about anti-patterns:

> "Is there anything the skill should NOT do, or behaviors to avoid?"

These answers become eval checks in Phase 2.

## Step 3: Collect Skill Metadata

Collect four fields from the user conversationally. Lead with whatever you can already infer from Steps 1–2 and `$ARGUMENTS`; ask only what's missing. Use `AskUserQuestion` for the location field (it's binary); ask the open-ended fields in chat.

| Field | Prompt | Notes |
|---|---|---|
| `name` | "What should this skill be called? (hyphen-case, ≤64 chars)" | If you inferred a name in Step 1, propose it and ask "use this, or change it?" |
| `purpose` | "One-sentence purpose — what does this skill do?" | If you inferred one in Step 1, propose it for confirmation. |
| `location` | `AskUserQuestion` with two options: "`~/.claude/skills/` (global)" and "`.claude/skills/` (project-local)". | If the request mentions a specific project context, pre-select project-local. |
| `triggers` | "Give me 3+ trigger phrases (situations that should make Claude reach for this skill)." | If Step 1's concrete examples include trigger language, propose phrases extracted from them. |

Batch the chat questions naturally — a single message asking for name + purpose + triggers is fine if the user hasn't already provided them. Use one `AskUserQuestion` call for location.

## Pre-fill from Arguments

If `$ARGUMENTS` is non-empty:
- If it looks like a hyphen-case name, pre-fill the name field
- If it's a topic phrase, pre-fill both name (converted to hyphen-case) and purpose
- Still run the interview for remaining fields

## Validation

Before proceeding, verify:
- Name is hyphen-case, ≤64 characters (see `references/naming-conventions.md`)
- Purpose is a clear single sentence
- At least 2 concrete use cases collected
- At least 3 trigger phrases
- At least 2 success criteria (these become eval checks)

## Output

Summarize before proceeding:
1. **Requirements**: name, purpose, use cases, triggers
2. **Success criteria**: what good output looks like (→ eval checks)
3. **Anti-patterns**: what to avoid (→ absence checks)
4. **Inferred design decisions**: skill type, resource needs, invocation strategy

**Next**: Proceed to Phase 2 (read `workflows/create-phase2-implement.md`)
