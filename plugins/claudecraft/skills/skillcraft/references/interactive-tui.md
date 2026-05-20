# Interactive Prompts in Skills

How to ask the user for input from inside a skill workflow. Two mechanisms are enough for almost every case.

## Choosing the Mechanism

| Need | Mechanism |
|------|-----------|
| Pick one of ≤4 mutually-exclusive options | `AskUserQuestion` (built-in) |
| Yes / No / Discuss-style decision per item | `AskUserQuestion` |
| Confirm a single inferred candidate | `AskUserQuestion` with the candidate + "Other" |
| Pick from a long list (5+ skills, files, branches…) | Conversational chat |
| Free-form text input (name, description, comma-separated list) | Conversational chat |
| Multi-field "form" | Conversational chat (batch the questions naturally) |

`AskUserQuestion` is preferred whenever it fits — it renders inline in the Claude Code UI, requires no external dependencies, and gives a structured answer. Reach for chat when the input shape genuinely exceeds the tool's contract (4 options, no text input).

## Pattern: Confirming an Inferred Candidate

When the skill can plausibly infer the user's intent from context, propose 1–4 candidates rather than asking blindly. `AskUserQuestion` always offers a built-in "Other" escape hatch, so users can type a free-form alternative.

```
Question: "Which skill should I bootstrap evals for?"
Options:
  - claude-code-evals (currently loaded)
  - skillcraft (recently edited)
  - testing-strategy
```

When the user picks "Other" or none of the inferred candidates apply, fall back to a conversational follow-up: "OK — which skill? Give me the name or path."

## Pattern: Multi-Field Collection

For workflows that need several fields (e.g. creating a new skill: name, purpose, location, triggers), prefer batched conversational asks over multiple round-trips:

> "I need four things to scaffold this skill:
> 1. Skill name (hyphen-case, ≤64 chars) — I'm thinking `<inferred-name>`. OK?
> 2. One-sentence purpose
> 3. Trigger phrases (3+)
>
> Where should it live: global (`~/.claude/skills/`) or project-local (`.claude/skills/`)?"

Use `AskUserQuestion` for the location field (it's binary). Ask the open-ended fields in chat.

## Anti-Patterns

| Anti-pattern | Why it's a problem | Fix |
|---|---|---|
| Asking a 7-option question via two `AskUserQuestion` calls | Splits one decision into two, confusing | Use conversational chat with the full list |
| `AskUserQuestion` with 4 options when the actual candidate set is 20+ | Selects arbitrary 4; misleads the user | Use conversational chat with the full list, or rank-and-show top 4 with an explicit "or another" follow-up |
| Asking a free-form text question via `AskUserQuestion` "Other" | The tool isn't a text input; "Other" is a fallback signal, not the primary input mode | Ask conversationally |
| Re-asking confirmations the user already gave in context | Wastes turns | Skip the prompt; proceed with the inferred answer |

## Quick Reference

- **≤4 mutually-exclusive options** → `AskUserQuestion`
- **>4 options, free text, or multi-field forms** → conversational chat
- **Inferred candidate + escape hatch** → `AskUserQuestion` with 1–4 candidates; chat fallback on "Other"
