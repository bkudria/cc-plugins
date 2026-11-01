# Specification

How `cc-sessions` reads Claude Code transcripts. `cc-sessions --help` and `cc-sessions <command> --help` document the
interface; this file documents the rules behind it. The rules were checked against transcripts written by Claude Code
2.0.x through 2.1.316. Claude Code treats the entry format as internal, so `cc-sessions schema` exists to show what a
newer version writes.

## Layout

| Path | Role |
|---|---|
| `bin/cc-sessions` | Dispatcher: help index, `--version`, global flags, output budget, then runs `libexec/<command>` |
| `libexec/<command>` | One executable per command. Answers `--help` and `--synopsis` (one index line) without reading transcripts |
| `lib/common.sh` | Shared shell code: session resolution, a session's agent files, argument helpers, error messages, the jq wrapper |
| `lib/sessions.jq` | Shared jq module (`s::`) holding every rule in this file |
| `lib/<command>.jq` | A command's jq program, when it has one. Its text runs as the main program (`cc_module_program`) and is never imported: jq 1.8.2 aborts when an imported module calls an `s::` function that calls another |
| `lib/render.jq` | The one-line renderings of a tool call that `tools` and `conversation` share, and the merge by time that they and `search` share; imported, so it calls only `s::` functions that call no other |
| `lib/file-separator` | The line `cc_jq_program` writes after each file when it hands jq every file as one text |
| `tests/` | scrut tests and the synthetic fixture tree they run against |

Requirements: bash 3.2 or later, jq 1.7 or later, ripgrep (for `list`, `search`, and finding a session's agents that
sit elsewhere and the sessions of its split-pane teammates), BSD `find`/`stat` (macOS).
All shell code runs under `/bin/bash` 3.2: no associative arrays, `mapfile`, `${var,,}` or `declare -n`.

## Files

The data root is `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects`, made absolute; when it is a symbolic link, it is
followed. Under it, each `<project>` directory holds:

| Path | What it is |
|---|---|
| `<project>/<session-id>.jsonl` | A session's main transcript |
| `<project>/<session-id>/subagents/agent-<agent-id>.jsonl` | A sub-agent's transcript, with `agent-<agent-id>.meta.json` beside it |
| `<project>/<session-id>/subagents/workflows/<run-id>/agent-<agent-id>.jsonl` | A workflow agent's transcript, with its `.meta.json`; the run's `journal.jsonl` sits in the same directory |
| `<project>/<session-id>/workflows/<run-id>.json` | A workflow run record (status, result, phases, agent count) |
| `<project>/<session-id>/tool-results/*` | Tool outputs too large to keep inline |
| `<project>/agent-<agent-id>.jsonl` | A sub-agent transcript in the older flat layout; linked to its parent by `sessionId` |

`journal.jsonl`, `*.meta.json`, `memory/` and `sessions-index.json` are never session or agent transcripts. A journal's
records are still read: for agent labels and results, as `agent-result` content, and by `schema`.
Project directory names are not decoded back into paths: the `cwd` field inside a transcript is the real path.

Agent ids take several shapes: `a` plus 16 hex digits, named `a<name>-<16 hex>`, internal `acompact-<hex>` and
`aprompt_suggestion-<hex>`, and older 6–8 hex ids. Session ids are UUIDs, and some start with `a`, so no rule may route on a
leading `a`.

## Session references

Every `<session>` argument accepts, in this order:

1. `current`: the main transcript of the session in `CLAUDE_CODE_SESSION_ID`. Inside a sub-agent that variable names the
   parent session.
2. A path, with a leading `~/` expanded. A `.jsonl` file is used as given; its companion directory is the sibling
   directory of the same name without `.jsonl`. A session directory resolves to its `.jsonl`. A file under `tool-results/`
   resolves to the session that owns it. A path that no longer exists falls back to its basename as an id.
3. `wf_<id>`: the session whose directory holds that workflow run.
4. An id or id prefix (`[A-Za-z0-9_-]`, at least 4 characters): one `find` over every layout for `<arg>*.jsonl`,
   `agent-<arg>*.jsonl` and `agent-a<arg>*.jsonl`, excluding `journal.jsonl`. One match resolves. No match, or more than
   one, exits 2; the error lists up to 20 candidates with their parent session and path.

## Reading

- Lines are parsed tolerantly (`jq -R 'fromjson?'`). Unparseable lines are skipped and counted in a stderr notice per
  file. `list` and `search` across sessions report sessions, not lines, and print none; `schema` sums them in one notice.
- jq and rg always get absolute paths and never read stdin (project directory names start with `-`). Files reach jq
  as one text through a pipe, never as arguments, so any number of them fits.
- Entries are de-duplicated by `uuid`, keeping the first occurrence: some files re-append an earlier block of history.
- File order is authoritative. Timestamps can run backwards in file order, and several entry types carry none.

## Messages and tokens

- Assistant entries that share `message.id` are one API message, even when other entries sit between them. Its content is the
  blocks in file order.
- A message's usage is the usage on its **last** entry. Before 2.1.300 the earlier entries carry partial `output_tokens`;
  from 2.1.300 every entry repeats the final usage. Summing per entry overcounts; taking the first entry undercounts.
- Claude Code 2.0.50 through 2.1.56 often wrote a message's last entry before its output was counted, so that no entry
  holds the final `output_tokens`. Of messages of 2,000 characters or more, the last entry counts fewer than 10 output
  tokens in none before 2.0.50, 35% from 2.0.50 to 2.1.9, 97% from 2.1.12 to 2.1.29, 43% from 2.1.30 to 2.1.56 and
  0.1% after. Output token figures from those versions are lower bounds; `overview`, `conversation --tokens` and
  `agents` say so in a stderr notice when a figure they show draws on such messages.
- Messages whose model is `<synthetic>` are harness-generated, carry zero usage, and are left out of model lists.
- A session's token totals cover its main transcript. Sub-agent totals are reported per agent; a roll-up skips internal
  agents and counts each `message.id` once. Context size per message is input + cache creation + cache read.
- `cost-state` entries cover one process run; a resumed session has several.

## Human input

After de-duplication, an entry is human input when it is one of:

1. A `user` entry that is not `isMeta`, `isCompactSummary` or `isVisibleInTranscriptOnly`; is not only tool results; has
   `origin.kind` of `human` or none; and whose text does not start with `<local-command-stdout>`, `<local-command-stderr>`,
   `<bash-stdout>`, `<bash-stderr>`, `[Request interrupted by user`, `<task-notification>`, `<bash-notification>`,
   `<agent-notification>`, `Another Claude session sent a message`, `<teammate-message`, `<agent-message`, `[Usage limit`,
   `<local-command-caveat>` or `Caveat:`, nor with a `<command-name>` element (a `<command-message>` element may come
   first) whose name lacks the leading `/` (a harness command, `injected`).
   Its kind is `slash` when the text starts with such an element naming `/…`; text that only mentions the tag is a
   `prompt`. A plain `/x …` entry and the next `<command-name>/x` entry are one input, recorded at the `<command-name>`
   entry's line; non-user entries and user entries that are `isMeta`, `isCompactSummary` or `isVisibleInTranscriptOnly`
   can sit between them. The kind is `bash` for `<bash-input>`, `sdk` when `promptSource` is `sdk` or `system`, and
   `prompt` otherwise.
2. A `system` entry of subtype `local_command` whose content starts with `<command-name>` (kind `slash`).
3. An `attachment` of type `queued_command` with `commandMode` `prompt`, origin `human` or none, not an `<agent-message`,
   whose text appears in no user entry and is not a slash command run later (kind `queued`; a `prompt` array is joined
   from its text blocks).
4. A `queue-operation` enqueue whose plain text appears nowhere else (kind `queued`): not as the text blocks of a user
   entry (an image beside them does not count), in a `queued_command`, or as the name and arguments of a slash command
   run later. An enqueue is not input when the next queue operation holding its text is a `popAll`, which puts the text
   back into the prompt: what the user sends after that is recorded where it appears.
5. An AskUserQuestion answer (kind `answer`: the question and the chosen labels or typed text), a tool rejection (kind
   `denied`: the result starts `The user doesn't want to proceed with this tool use`; with the user's feedback when
   there is any), and an ExitPlanMode decision (kind `plan`): `approved` when the result starts `User has approved`,
   `rejected` when a rejected call is ExitPlanMode. Denials and approvals are read from the result line alone, as the
   call can sit in an earlier session, and then name no tool; a rejection is a plan decision only beside its
   ExitPlanMode call. An ExitPlanMode result that is a tool error is no decision.

Related events that are not input: `interrupt` (`[Request interrupted by user…`), `output` (a slash or `!` command's
stdout/stderr, in a user entry or a `system` `local_command` entry, attached to its command), and images, shown as
`[image]` inside the input that carried them.

Other user entries: tool results; `injected` (isMeta text: skill bodies, caveats, scheduled and auto-continuation prompts);
`summary` (compaction summaries); `notification` (`<task-notification>` and similar); `peer` (messages from other sessions
or teammates); `from-parent` (a sub-agent transcript's first user entry and later SendMessage deliveries).

## Skill loads

A load is one of:

- A Skill tool call whose result text is `Launching skill: <name>`. A call that errors or has no result is a failed call,
  not a load. `toolUseResult` is absent in most sub-agent files and is not used.
- A slash or harness command (`<command-name>/x`, or `<command-name>x` with `<skill-format>`) directly followed by an
  isMeta body. It is a `skill` load when the body starts with `Base directory for this skill:`, otherwise a
  `bundled` load (built-in skills and legacy commands).
- A `Base directory for this skill:` body with no trigger, named from its directory.

A repeat call that injects only "Skill /x was loaded earlier…" is a `re-invoked` event. `invoked_skills` attachments are
restored state after compaction, not loads. `attributionSkill` names the active skill of the session that spawned an agent;
it is never a load. Bare and namespaced names (`skillcraft`, `claudecraft:skillcraft`) match by their last segment; output
shows the exact name.

## Content kinds

`search` looks only at these kinds:

| Kind | Source | Searched by default |
|---|---|---|
| `prompt` | human input (all kinds above) | yes |
| `assistant` | assistant text blocks | yes |
| `tool-input` | tool_use input, plus the wire form in `wireToolInputs` | yes |
| `tool-result` | tool_result text | yes |
| `from-parent` | a sub-agent's delegation prompt and SendMessage deliveries | yes |
| `agent-result` | `attachment.structured_output` and workflow journal results | yes |
| `plan` | `attachment.plan_file_reference` | yes |
| `file` | `attachment.file` and `attachment.edited_text_file` (user-referenced files) | yes |
| `hook` | hook attachment stdout/content | yes |
| `recap` | `system.away_summary` | yes |
| `thinking` | non-empty thinking blocks | no |
| `injected`, `summary`, `notification`, `peer` | as defined under Human input; a notification can also be an attachment (see Sub-agents) | no |

Everything else (`api-request*`, `progress`, `queue-operation` apart from the enqueues of Human input rule 4,
`last-prompt`, file-history entries, titles, mode and state markers, and every other attachment type such as
`skill_listing`, `invoked_skills`, `instructions` and `nested_memory`) copies system content or records state, and is
never searched. `lib/sessions.jq` lists every known entry
type, attachment type and system subtype by name (`hook_*` attachments and `model_*_fallback` subtypes match as
patterns), and which attachment types and system subtypes can hold content; `schema` reports any type outside those
lists.

## Search

- `<text>` is literal and matched in the decoded text, or a jq (Oniguruma) regex with `--regex`. Smart case: text with
  no uppercase letter (a regex's backslash escapes do not count) matches any case.
- Within sessions: one record per hit. With several sessions `src` names each session's own transcript by its id;
  `--agents` adds each session's agents and run journals (a split-pane teammate's session named by its id).
- Across sessions: one record per session. Hits in its agents and run journals count toward it (`agent` ends the kinds
  list); internal agents are left out. `hits` ends in `+`, a lower bound, when a file had more matching lines than
  were read from it (100 after the noise filter, 300 before).

## Sub-agents and workflows

- A session's agents are its nested and flat-layout agent transcripts, those its Agent and Workflow calls name
  elsewhere under the root (a resumed copy's agents stay in the original's directory), and the sessions of the
  split-pane teammates it spawned. Every command that reads a session's agents uses this set.
- Agent call → transcript: `toolUseResult.agentId` (or `agent_id` for teammates) names `subagents/agent-<id>.jsonl` in the
  session directory; if absent there, any `agent-<id>.jsonl` under the root (resumed sessions keep the original's directory).
  The sub-agent's `.meta.json` `toolUseId`, when present, confirms the link.
- A teammate whose spawn result (`teammate_spawned`) names it only `agent_id` `<name>@<team>` names no file. In process,
  its transcript is the `subagents/` file whose meta `name` and `teamName` are the result's `name` and `team_name`. In a
  split pane (`is_splitpane`), it runs as a session of its own: the main transcript in the lead's project directory
  whose user and assistant entries carry `teamName` and `agentName` equal to them. Such a session is still listed and
  searched across sessions as itself; read as the lead's agent, its records name it by its session id.
- An agent whose meta names `parentAgentId` was started by another agent, whose transcript holds its call. Calls are
  read only from the session's own transcript, so it is listed without a call.
- Workflow call → run: `toolUseResult.runId` and `transcriptDir` name `subagents/workflows/<run-id>/`; if absent there, any
  directory of that name under the root. The run record is `workflows/<run-id>.json`; each agent's label, phase and result
  come from `journal.jsonl`.
- Flat-layout sub-agents link to their parent by `sessionId`, and to the Task call by `agentId` or by prompt text.
- Fork agents link through the parent's `system` entry carrying `launchedAgentId` and their own `fork-context-ref` line.
- A background completion arrives as a `notification` user entry or, from 2.1.31x, as a `queued_command` attachment
  with `commandMode` `task-notification`; some exist only as a `queue-operation` enqueue. One text can hold several
  `<task-notification>` or `<agent-notification>` blocks, each a completion of its own; 2.0.x names the agent of an
  `<agent-notification>` by `<agent-id>` alone. A completion links to its call by `<tool-use-id>`, else by `<task-id>`
  or `<agent-id>` to the call's task or agent id, taking the first one after the call, as calls that resume an agent
  share its id. A delivered completion is preferred over an enqueue.
  `/private/tmp/.../tasks/<id>.output` paths are ephemeral and never followed.
- Internal agents are left out of corpus search, listings and roll-ups: `agent-acompact-*`, `agent-aprompt_suggestion-*`,
  agents whose first prompt is `Warmup`, and forks of the `sessions:transcripts` skill (their first prompt contains
  `[cc-sessions:transcripts-fork]`). They stay reachable through an explicit `<session>` argument.
- An agent's kind is the first that applies: `internal`; `teammate` (meta `taskKind` names a teammate, its call's
  result is `teammate_spawned`, or it is a split-pane teammate's session); `fork` (meta `isFork`, or a
  `fork-context-ref` line); `flat`; `workflow-agent`; `agent`.
- `agents` lists one row per agent or run, at the first call that names it; a call that resumes it (`resume`,
  `resumeFromRunId`) adds no row, and the row's status and result come from the last call. Rows follow their call's
  line, each run's agents right after it; agents and runs that no call links come last.
- An agent's result is, in order of preference: its last call's notification `<result>`, its journal result, its last
  `structured_output`, its last assistant text. Teammates get no notification.
- An agent's or run's status is one of `completed`, `failed`, `killed`, `running`, `denied` and `unknown`, in order of
  preference: its journal (a result means `completed`), its run record, its last call's notification, that call's own
  outcome, else the transcript's end. A call's outcome is `killed` when the user interrupted it (the result starts
  `[Request interrupted by user`), otherwise its result's status: `completed` for a finished synchronous call, `failed`
  for an error, `denied` for a rejection; a launch or spawn gives none. The transcript's end is `completed` when the
  last user or assistant entry is an assistant message that stopped (`end_turn`, `stop_sequence`, or, before 2.1.300,
  no `stop_reason` and no tool call), `failed` on an API error message, otherwise `unknown`. `s::lifecycle_status`
  holds this order for a call.
- An agent's output tokens are its transcript's, except that a finished call reports the usage of the agent's final
  message: when that call is the last and reports more for that message than its last entry holds, the reported count
  replaces the transcript's.

## Tool calls and persisted outputs

A tool call's status is `ok`, `error` (its result is marked `is_error` and is not a rejection), `denied` (the user
rejected it: the result starts `The user doesn't want to proceed with this tool use`) or `none` (no result recorded);
`tools` prints an ok result that is persisted (below) as `persisted`. A denial is the user's choice, never counted as an
error.

The status is the call's own outcome. An Agent, Task or Workflow call's result in `tools` names the agent or run it
started and that one's status by `s::lifecycle_status`, the rule `agents` uses (see Sub-agents): the agent is linked by
its id, its meta's `toolUseId`, or a teammate's team and name, and only its last lines are read for the transcript's
end. An agent killed or failed after its call returned is therefore not an error of the call.

A tool result is persisted only when its text **starts** with:

    <persisted-output>\nOutput too large (<n><B|KB|MB>). Full output saved to: <path>\n\nPreview (first <n><B|KB|MB>):\n

A tool result's size is the length of its text in characters, text blocks joined by newlines; an image block adds
nothing, though the text shows it as `[image]`. A persisted result's real size is the saved file's size on disk, in
bytes, and is what commands print (`<n>B`), sum and rank by. When `<path>` does not exist, the file of the same name
under the owning session's `tool-results/` is used; when neither exists, the size the marker states. Text that quotes
the marker mid-result is not a persisted output.

## Labels and origin

- Session label: the last `custom-title`; else the last `ai-title` that contains a space (single-token titles are plan
  slugs); else `agent-name`; else a legacy `summary`; else the first human input of kind `prompt`, `slash`, `bash`,
  `sdk` or `queued` (a decision on a call from an earlier session can come before it). Every command shows it on one
  line, whitespace runs as one space, cut at 100 characters unless `--full`.
- A listing's pattern matches the session id, every title entry (`custom-title`, `ai-title`, `agent-name`, `summary`)
  and that first input. `--cwd PATH` matches any cwd of the transcript equal to PATH or under it; PATH is made
  absolute but not resolved through links.
- Sub-agent label: its `.meta.json` `description` or `name`, else its journal label, else its delegation prompt, truncated.
- Origin: `sdk` when `entrypoint` starts with `sdk` or a prompt's `promptSource` is `sdk`; otherwise the `entrypoint`
  value, or `cli` when there is none. Listings show `cli` sessions unless asked for others.
- Stub sessions (no user or assistant entry) are left out of listings.
- The current session is the one whose id is `CLAUDE_CODE_SESSION_ID`: `current` names its main transcript, and
  `list` and `search` mark its row.

## Output

- One record per line; fields separated by a tab; tabs, newlines, carriage returns and backslashes inside a field
  escaped as `\t`, `\n`, `\r` and `\\`, and every other control character (U+0000 to U+001F) and DEL as `\u00XX`
  (lowercase hex); an empty field printed as `-`. No header line. Each command's `--help` names its fields in order.
- Per-session records start with a handle: `L<line>` within the transcript, or within the file named by the record's
  `src` field. `entry` accepts
  a handle, a `uuid`, a `toolu_…` id or a `msg_…` id. `--since`/`--until` accept a handle, a timestamp, or a relative
  age (`30m`, `2h`, `7d`); a timestamp that names no real date or time (`2026-02-30`) is a usage error. With several
  files, a handle bound applies to each file's own lines. A time bound compares each
  record's timestamp, or the nearest earlier one in file order; records before a file's first timestamp match only handle
  bounds.
- Timestamps print as `YYYY-MM-DDTHH:MM:SSZ` (UTC, milliseconds dropped), so a printed timestamp passed back to `--since`
  or `--until` selects the same record.
- Every per-session command takes `--since` and `--until`, and every command that cuts text takes `--full`; long text
  fields are cut to a per-command width, ending in `…`, unless `--full` is given. Across sessions (`list`, and `search`
  and `schema` without `<session>`), `--since` and `--until` compare modified times, and a handle is a usage error.
- When records come from several files (`--agents`, or several sessions in `search`), `tools`, `conversation` and
  `search` merge them by time, each file keeping its own order; the records of a file with no timestamps (a run
  journal) come last. Such records start with handle, `src` and time.
- Output budget: stdout stops at a record boundary after `--max-chars` characters (default 20000; 0 removes the limit;
  characters, not bytes, whatever the locale; a record counts its newline) or `--limit` records (no default unless the
  command's help names one). A one-line stderr notice then states how many records were left out and how to continue:
  - records from one file whose handles, shown and left out, run forward: `--since L<next>`;
  - records shown and left out from several files: `--since <time of the next record>`, unless a record left out has
    an earlier time or none; `--since` is inclusive, so the notice says how many records already shown carry that
    second and will repeat;
  - otherwise a larger `--limit` or `--max-chars`.
- A cross-session command with a default limit applies `--limit` and `--max-chars` itself, stops reading at a row
  boundary and writes past the dispatcher's filter. A page never ends inside the sessions that share one modified
  second: it ends before them, or holds them all when they alone fill it. The notice says that older sessions were not
  all examined and to continue with `--until <modified of the next row>`, a time no row shown has.
- Notices and errors go to stderr, prefixed `cc-sessions:`. An error states the problem, the fix, and
  `cc-sessions <command> --help`.
- An empty answer's notice reads `no <things> in <what was read>`, then `with` and the options that narrowed it.
- Exit codes: 0 when the command answered, including an empty answer (with a stderr notice saying what was searched);
  1 when it could not (unreadable file, missing dependency); 2 for a usage error (unknown command or flag, bad value,
  unresolvable or ambiguous `<session>`). `cc-sessions jq` returns jq's exit code. When the reader closes stdout
  early, output ends quietly, with nothing on stderr, and the exit code is 0.
- `--` ends options for every command. `cc-sessions`, `-h` and `--help` print the index; `<command> -h|--help` prints that
  command's help. Help never reads transcripts and always exits 0; the index ends with the status of each dependency.

## Commands

| Command | Answers |
|---|---|
| `list` | Which sessions exist, newest first, filtered by text, skill, cwd, time or origin |
| `search` | Where text appears: per session across the corpus, or per record within given sessions |
| `overview` | What a session is: ids, path, cwd, label, models, duration, tokens, tools, largest results, compactions, skill loads, agents, errors |
| `prompts` | What the human did: inputs, answers, denials, plan decisions, interrupts |
| `conversation` | What was said: human and assistant turns, tool one-liners, injected content as markers |
| `tools` | What tools ran: calls paired with results, filtered by name, input, result or error |
| `agents` | What sub-agents and workflow runs a session started, where their transcripts are, and what they returned |
| `entry` | One entry in full, with its parent chain |
| `schema` | Which entry types, kinds and fields transcripts contain |
| `jq` | Anything else: jq with `lib/sessions.jq` importable as `s` |

## Tests

`scrut test plugins/sessions/tests` runs the suite. A shared setup copies `tests/fixtures/config/` to a temporary
`CLAUDE_CONFIG_DIR`, sets file times, fixes `TZ=UTC` and `LC_ALL=C`, clears `CLAUDE_CODE_SESSION_ID`, and puts this
plugin's `bin/` first on `PATH`. The fixtures are synthetic transcripts built to the shapes above; `tests/fixtures/FACTS.md`
records what each one contains. The suite also runs representative cases under `/bin/bash` and with jq 1.7, runs
`shellcheck` on every shell file, and compiles every jq program.
