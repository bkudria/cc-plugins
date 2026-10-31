# Goals

## Why this exists

Claude Code keeps every session as JSONL under `~/.claude/projects/`. Questions about earlier work — what a session decided,
why an agent took a step, which skills it loaded, what a sub-agent concluded, where the tokens went — can only be answered from
those files. They are large (tens of megabytes), mostly harness bookkeeping, and their format is internal to Claude Code and
changes between releases. Reading them naively gives wrong answers and floods the reader's context.

`cc-sessions` answers those questions for an agent:

- **Correct on the current format.** It encodes the semantics that are easy to get wrong: one API message split across
  several entries, injected text that is not the user speaking, skill loads that leave no tool call, sub-agent and workflow
  transcripts stored beside the parent, large outputs saved to separate files.
- **Bounded output.** Every command fits a reader's context by default, says what it left out, and says how to continue.
- **Citable.** Every per-session record carries a handle (its line number) that other commands accept, so an answer can
  point at the evidence and a reader can drill into it.
- **One source of documentation.** `--help` is the reference for every command and field.

## Non-goals

- A human interface. Output is for agents: plain records, no colour, no pager, no prompts.
- Changing transcripts. The tool only reads.
- Live monitoring of running sessions.
- Billing. Token figures describe what a session used; Claude Code's own usage views remain the authority on cost.
- Platforms other than macOS. Linux may work but is not tested.
