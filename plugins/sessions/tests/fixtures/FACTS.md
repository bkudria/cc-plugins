# Fixture facts

`config/` stands in for `CLAUDE_CONFIG_DIR`. Paths below are relative to `config/`. A handle `L<n>` is line `n` (from 1)
of the file it is listed under. Token figures use SPEC rules: de-duplicate by `uuid`, then take the usage of the **last**
entry of each `message.id`; context = input + cache creation + cache read.

## Conventions

- The files under `config/` are edited by hand. Add a case as a new session, or as lines appended at the end of a file:
  tests cite handles, so no existing line may move. Record each addition here and in `mtimes.tsv`.
- `mtimes.tsv` lists `<path>\t<YYYYMMDDhhmm.SS>` for every file under `config/`. Apply it with `TZ=UTC touch -t`.
- Stored absolute paths inside transcripts (persisted-output paths, `persistedOutputPath`, `transcriptDir`, `scriptPath`)
  point under `/tmp/sessions-fixture/config/projects/`, which never exists. Every lookup must fall back to the tree.
  `outputFile` and `<output-file>` paths point under `/private/tmp/claude-501/` and never exist either.
- Entry uuids are patterned `<file prefix><n>-0000-4000-8000-<n>` (hex). They are never file names.
- Short names used below:

| Name | Path |
|---|---|
| `ALPHA` | `projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e` |
| `STUB` | `projects/-tmp-sessions-fixture-alpha/b5a7c9e1-0d2f-4a4b-9c6e-8f0a2b4c6d8e` |
| `BETA` | `projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e` |
| `RESUMED` | `projects/-tmp-sessions-fixture-beta/b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c` |
| `FLAT` | `projects/-tmp-sessions-fixture-flat/c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a` |
| `SDK` | `projects/-tmp-sessions-fixture-scuttlerun-project-Xy12/d1f3b5d7-9e0a-4c2e-a4b6-c8d0e2f4a6b8` |
| `RELOC` | `projects/-tmp-sessions-fixture-reloc/e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d` |
| `UNDER` | `projects/-tmp-sessions-fixture-under-score/f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4` |
| `GAMMA` | `projects/-tmp-sessions-fixture-gamma/c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f` |
| `WF` | `ALPHA/subagents/workflows/wf_5d1c9a7e-3b2` |

`X.jsonl` is the main transcript; `X/` is its session directory.

## Sessions

| Name | Session id | Lines | cwd (first) | Versions | Origin | Label (source) | Listed | mtime (UTC) |
|---|---|---|---|---|---|---|---|---|
| ALPHA | `a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e` | 83 | `/tmp/sessions-fixture/alpha` | 2.1.314 | cli | `alpha fixture session` (custom-title L79) | yes | 2026-10-30 11:30:00 |
| STUB | `b5a7c9e1-0d2f-4a4b-9c6e-8f0a2b4c6d8e` | 1 | none | none | (no entrypoint) | — | **no** (stub) | 2026-10-30 12:00:00 |
| SDK | `d1f3b5d7-9e0a-4c2e-a4b6-c8d0e2f4a6b8` | 5 | `/tmp/sessions-fixture/scuttlerun-project-Xy12` | 2.1.310 | sdk | `Rename the report generator skill` (ai-title L4) | only with an origin filter that admits sdk | 2026-10-29 12:00:00 |
| RELOC | `e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d` | 10 | `/tmp/sessions-fixture/reloc` | 2.1.312 | cli | `Show the release notes` (ai-title L2) | yes | 2026-10-28 12:00:00 |
| UNDER | `f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4` | 3 | `/tmp/sessions fixture/under_score` | 2.1.314 | cli | `List the files with spaces in their names.` (first human input L2) | yes | 2026-10-27 12:00:00 |
| GAMMA | `c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f` | 24 | `/tmp/sessions-fixture/gamma` | 2.1.316 | cli | `gamma-indexer` (agent-name L14) | yes | 2026-10-26 15:00:00 |
| RESUMED | `b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c` | 7 | `/tmp/sessions-fixture/beta` | 2.1.206 | cli | `Find where the header should live.` (first human input L1) | yes | 2026-07-20 12:00:00 |
| BETA | `b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e` | 22 | `/tmp/sessions-fixture/beta` | 2.1.206 | cli | `Summarise the beta build failures.` (first human input L2) | yes | 2026-07-15 12:00:00 |
| FLAT | `c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a` | 8 | `/tmp/sessions-fixture/flat` | 2.0.76 | cli (no entrypoint) | `Flat era config loader search` (legacy summary L1) | yes | 2026-01-03 12:00:00 |

- Default listing (cli only), newest first: ALPHA, RELOC, UNDER, GAMMA, RESUMED, BETA, FLAT. With sdk admitted, SDK sits between
  ALPHA and RELOC. STUB is newest of all and must never appear. `projects/-tmp-sessions-fixture-flat/agent-*.jsonl` are
  flat sub-agents, never sessions.
- Project directory names follow Claude Code's encoding (every character outside `[A-Za-z0-9]` becomes `-`):
  `/tmp/sessions fixture/under_score` → `-tmp-sessions-fixture-under-score`.
- RELOC changes cwd mid-session: L1 has `/tmp/sessions-fixture/reloc`, L4–L8 have `/tmp/sessions-fixture/elsewhere`
  (after the `relocated` entry at L3).
- RESUMED holds two `sessionId` values: L1–L5 carry BETA's id (copied history), L6–L7 its own.

## Resolution

`find` over `<arg>*.jsonl`, `agent-<arg>*.jsonl`, `agent-a<arg>*.jsonl`, all depths, excluding `journal.jsonl`:

| Argument | Matches | Expected |
|---|---|---|
| `a7c3`, `a7c3e9` | `ALPHA.jsonl` and `ALPHA/subagents/agent-a7c3e9b2d4f6a8c01.jsonl` | ambiguous, exit 2, both listed |
| `a7c3e9f`, `a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e` | `ALPHA.jsonl` | ALPHA |
| `a7c3e9b`, `7c3e9b`, `a7c3e9b2d4f6a8c01` | `ALPHA/subagents/agent-a7c3e9b2d4f6a8c01.jsonl` | the Explore sub-agent |
| `a4c6e8f0a2b4c6d8e`, `4c6e8f0a` | `BETA/subagents/agent-a4c6e8f0a2b4c6d8e.jsonl` | BETA's sub-agent (the only copy) |
| `5f6a7b8c` | `projects/-tmp-sessions-fixture-flat/agent-5f6a7b8c.jsonl` | flat sub-agent (8 hex, no leading `a`) |
| `9a0b1c2d` | `projects/-tmp-sessions-fixture-flat/agent-9a0b1c2d.jsonl` | flat Warmup agent |
| `acompact`, `compact-3f9a1c` | `ALPHA/subagents/agent-acompact-3f9a1c.jsonl` | internal compaction agent |
| `prompt_suggestion`, `aprompt_suggestion-8d2e4b` | `ALPHA/subagents/agent-aprompt_suggestion-8d2e4b.jsonl` | internal suggestion agent |
| `planner`, `aplanner` | `ALPHA/subagents/agent-aplanner-5e1f0a2b3c4d5e6f.jsonl` | teammate |
| `does-the-lexer`, `adoes` | `ALPHA/subagents/agent-adoes-the-lexer-0a1b2c3d4e5f6a7b.jsonl` | fork agent |
| `a3d1e5f7` | `ALPHA/subagents/agent-a3d1e5f7a9b0c2d4e.jsonl` | transcripts-fork agent (internal) |
| `a0f1`, `a9e8` | `WF/agent-a0f1e2d3c4b5a6978.jsonl`, `WF/agent-a9e8d7c6b5a4f3e21.jsonl` | workflow agents |
| `b5a7`, `b2d4`, `b9e1`, `c4e6`, `d1f3`, `e5a7`, `f6b8` | the one session with that prefix | STUB, BETA, RESUMED, FLAT, SDK, RELOC, UNDER |
| `c7d9` | `GAMMA.jsonl` | GAMMA (no session directory) |
| `wf_5d1c9a7e-3b2` | (rule 3) | ALPHA |
| `e0a0` | nothing | exit 2 (entry uuids are not file names) |
| `ALPHA/tool-results/b4k7m2q9x.txt` (as a path) | — | ALPHA |
| `RELOC/tool-results/c8n2v5x1q.txt` (as a path) | — | RELOC |

With `CLAUDE_CODE_SESSION_ID=a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e`, the current session is ALPHA: `current` resolves
to `ALPHA.jsonl`, and `list` and `search` mark its row. `ALPHA/` holds eight `.jsonl` transcripts (six in
`subagents/`, two in `WF/`; `WF/journal.jsonl` is not a transcript).

## ALPHA (current era, 2.1.314)

### Lines

| L | Entry | Role in the rules |
|---|---|---|
| 1 | `permission-mode` (`default`) | state |
| 2 | `mode` (`normal`) | state |
| 3 | attachment `hook_success` (SessionStart:startup, stdout `fixture hook ready`) | content kind `hook` |
| 4 | user, origin human, typed: ``Check the CONTENT_TERM_ALPHA parser, then please run "make test" now.`` (uuid `e0a00003-0000-4000-8000-000000000003`) | human input H1 |
| 5 | attachment `skill_listing` | NOISE_ONLY_TERM; never searched |
| 6 | attachment `instructions` | NOISE_ONLY_TERM; never searched |
| 7 | `api-request-blob` | NOISE_ONLY_TERM; never searched |
| 8 | `api-request` | never searched |
| 9 | `ai-title` `Review the parser and run the tests` | sentence title |
| 10 | assistant M1 block 0: thinking `The CONTENT_TERM_ALPHA parser lives under src; search for it first.` | kind `thinking` |
| 11 | assistant M1 block 1: text `Searching the source first.` | |
| 12 | assistant M1 block 2: tool_use T1 Bash `rg -n CONTENT_TERM_ALPHA src` (+ `wireToolInputs` with `cd /tmp/sessions-fixture/alpha && ` prefix) | |
| 13 | user tool_result T1 | |
| 14 | assistant M2 block 0: text `CONTENT_TERM_ALPHA is defined in src/parser.c. The rules live in lib.jq; running the tests next.` | |
| 15 | assistant M2 block 1: tool_use T2 Bash `make test` | |
| 16 | user tool_result T2 (persisted output) | sits between blocks of M2 |
| 17 | assistant M2 block 2: tool_use T3 `mcp__demo__fetch` | |
| 18 | user tool_result T3 (array content; `toolUseResult` is an array) | |
| 19 | assistant M3: text `Tests pass. Skipping --force-push-now; it needs your approval.` | |
| 20 | user isMeta `<local-command-caveat>…` | injected |
| 21 | user `<command-name>/effort</command-name>` (args `high`; no origin key) | human input H2 |
| 22 | user `<local-command-stdout>Set effort level to high (this session only)</local-command-stdout>` | output of H2 |
| 23 | user `<command-message>demo:review</command-message>\n<command-name>/demo:review</command-name>\n<command-args>parser changes</command-args>` (origin human) | human input H3 |
| 24 | user isMeta `Base directory for this skill: /tmp/sessions-fixture/plugins/demo/skills/review…` | injected (skill body) |
| 25 | assistant M4 block 0: text `Reviewing the parser changes.` (attributionSkill `demo:review`) | |
| 26 | assistant M4 block 1: tool_use T4 AskUserQuestion (attributionSkill `demo:review`) | |
| 27 | user tool_result T4 with `toolUseResult.answers` | human input H4 |
| 28 | assistant M5: tool_use T5 Edit (attributionSkill `demo:review`) | |
| 29 | user tool_result T5, `is_error: true`, `toolDenialKind: user-rejected` | human input H5 |
| 30 | assistant M6: tool_use T6 Bash `cat missing.txt` | |
| 31 | user tool_result T6, `is_error: true` | |
| 32 | assistant M7: tool_use T7 Skill `nope` | |
| 33 | user tool_result T7 `<tool_use_error>Unknown skill: nope</tool_use_error>`, `is_error: true` | failed Skill call |
| 34 | assistant M8: text `That skill does not exist; continuing without it.` (uuid `e0a0001e-0000-4000-8000-00000000001e`) | peak context |
| 35 | user plain `/compact` (no origin key) | merged into H6 |
| 36 | system `compact_boundary` | compaction C1 |
| 37 | user `isCompactSummary` + `isVisibleInTranscriptOnly` | summary |
| 38 | user isMeta `<local-command-caveat>…` | injected |
| 39 | user `<command-name>/compact</command-name>` | human input H6 |
| 40 | user `<local-command-stdout>\u001b[2mCompacted (ctrl+o to see full summary)\u001b[22m</local-command-stdout>` | output of H6 |
| 41 | attachment `file` (`/tmp/sessions-fixture/alpha/src/parser.c`, content `#define MODE_LENIENT 1\n`) | kind `file` |
| 42 | attachment `plan_file_reference` (`/tmp/sessions-fixture/plans/strict-parser-plan.md`) | kind `plan` |
| 43 | attachment `invoked_skills` [`demo:review`, path `plugin:demo:review`] | restore; never searched |
| 44 | user, origin human: text `The output looks wrong here: [Image #1]` + one image block (`imagePasteIds: [1]`) | human input H7 |
| 45 | assistant M9: tool_use T8 Skill `alpha-helper` | |
| 46 | user tool_result T8 `Launching skill: alpha-helper` | |
| 47 | user isMeta `Base directory for this skill: /tmp/sessions-fixture/alpha/.claude/skills/alpha-helper…` (`sourceToolUseID` = T8) | injected (skill body) |
| 48 | assistant M10: tool_use T9 Skill `alpha-helper` (attributionSkill `alpha-helper`) | |
| 49 | user tool_result T9 `Launching skill: alpha-helper` | |
| 50 | user isMeta `Skill /alpha-helper was loaded earlier (see the invoked-skills reminder above); this is a NEW invocation — …` (`sourceToolUseID` = T9) | injected; re-invoked |
| 51 | assistant M11: tool_use T10 ExitPlanMode (attributionSkill `alpha-helper`) | |
| 52 | user tool_result T10 `User has approved your plan. …` | human input H8 |
| 53 | `ai-title` `strict-parser-plan` | single token (plan slug) |
| 54 | assistant M12: text `Starting the strict-mode change.` | |
| 55 | user `[Request interrupted by user]` (`interruptedMessageId` = M12) | interrupt event |
| 56 | assistant, model `<synthetic>`: `No response requested.` | synthetic |
| 57 | user `<bash-input>git status</bash-input>` | human input H9 |
| 58 | user `<bash-stdout>On branch main\nnothing to commit, working tree clean</bash-stdout><bash-stderr></bash-stderr>` | output of H9 |
| 59 | user, origin human: `Spin up helpers for the tokenizer tests and the rollout.` | human input H10 |
| 60 | assistant M13 block 0: tool_use T11 Agent (Explore, background) | |
| 61 | user tool_result T11 (async launch) | |
| 62 | assistant M13 block 1: tool_use T12 Agent (teammate `planner`) | |
| 63 | user tool_result T12 (teammate spawn) | |
| 64 | assistant M13 block 2: tool_use T13 Workflow (`wireToolInputs` holds `args` as a string) | |
| 65 | user tool_result T13 (workflow launch) | |
| 66 | user, **no isMeta, no origin**: `Another Claude session sent a message:\n<teammate-message teammate_id="planner" …` | peer |
| 67 | user `<task-notification>` for T11 (origin `task-notification`, promptSource `system`) | notification |
| 68 | user `<task-notification>` for T13 | notification |
| 69 | attachment `queued_command` `Also check the lexer.` (commandMode `prompt`, origin human) | human input H11 |
| 70 | assistant M14: text `Both helpers finished; the lexer check is next.` | |
| 71 | system `local_command` `<command-name>/btw</command-name>` (args `does the lexer share the parser's token table?`) | human input H12 |
| 72 | system `informational` with `launchedAgentId: adoes-the-lexer-0a1b2c3d4e5f6a7b` | fork link |
| 73 | user `<command-message>doctor</command-message>\n<command-name>/doctor</command-name>` (origin human) | human input H13 |
| 74 | user isMeta `# Fixture Doctor\n\nCheck the installation and report any problems you find.` | injected (bundled body) |
| 75 | assistant M15: text `The installation looks healthy.` | |
| 76 | system `away_summary` `While you were away: the parser review finished and strict mode is planned behind a flag.` | kind `recap` |
| 77 | attachment `brand_new_kind` | unknown to every rule |
| 78 | `custom-title` `alpha draft` | |
| 79 | `custom-title` `alpha fixture session` | label |
| 80 | user, origin human: `Thanks, wrap up.` | human input H14 |
| 81 | assistant M16: text `Done.` | |
| 82 | `last-prompt` (`Thanks, wrap up.`) | never searched |
| 83 | `cost-state` | per-process totals |

Entry counts: user 37, assistant 24, attachment 8, system 4, ai-title 2, custom-title 2, and one each of
permission-mode, mode, api-request, api-request-blob, last-prompt, cost-state. No corrupt lines, no duplicate uuids, no
backwards timestamps. First timestamp `2026-10-30T10:00:01.950Z` (L3), last `2026-10-30T10:32:05.181Z` (L81).

### Human input (14) and related events

| # | Handle | Kind | Text | Timestamp |
|---|---|---|---|---|
| H1 | L4 | prompt | ``Check the CONTENT_TERM_ALPHA parser, then please run "make test" now.`` | 10:00:04.781Z |
| H2 | L21 | slash | `/effort high` | 10:00:35.550Z |
| H3 | L23 | slash | `/demo:review parser changes` | 10:00:41.998Z |
| H4 | L27 | answer | `Which parser mode should the review target?` → `Strict (Recommended)` | 10:00:51.598Z |
| H5 | L29 | denied | Edit (T5) rejected; feedback `Keep lenient mode until the release.` | 10:00:56.350Z |
| H6 | L39 (plain record L35) | slash | `/compact` — L35 and L39 are one input | 10:01:21.398Z (L35: 10:01:11.798Z) |
| H7 | L44 | prompt | `The output looks wrong here: [Image #1]` plus `[image]` | 10:01:30.117Z |
| H8 | L52 | plan | ExitPlanMode (T10) approved; plan `# Plan\n\n1. Switch the parser to strict mode behind a flag.` | 10:01:51.517Z |
| H9 | L57 | bash | `git status` | 10:02:00.717Z |
| H10 | L59 | prompt | `Spin up helpers for the tokenizer tests and the rollout.` | 10:19:53.181Z |
| H11 | L69 | queued | `Also check the lexer.` (attachment only; no user entry has this text) | 10:25:10.317Z |
| H12 | L71 | slash | `/btw does the lexer share the parser's token table?` (system `local_command`) | 10:26:41.581Z |
| H13 | L73 | slash | `/doctor` | 10:28:33.517Z |
| H14 | L80 | prompt | `Thanks, wrap up.` | 10:32:03.150Z |

- Interrupt: L55 `[Request interrupted by user]`, interrupting M12 (L54).
- Output: L22 (of H2), L40 (of H6), L58 (of H9).
- Not input: injected L20, L24, L38, L47, L50, L74; summary L37; peer L66; notification L67, L68; tool results.

### Skill loads

| Handle | Name | How | Evidence |
|---|---|---|---|
| L23 → L24 | `demo:review` | slash, `skill` | body starts `Base directory for this skill:` |
| L45 → L46 → L47 | `alpha-helper` | Skill tool | result `Launching skill: alpha-helper`; body `sourceToolUseID` = T8 |
| L73 → L74 | `doctor` | slash, `bundled` | body does not start with `Base directory` |

- Failed call: T7 (L32) Skill `nope` → L33 `<tool_use_error>Unknown skill: nope</tool_use_error>`. Not a load.
- Re-invoked: T9 (L48) Skill `alpha-helper` → L49 `Launching skill: alpha-helper` → L50 `Skill /alpha-helper was loaded
  earlier…`. A re-invoked event, not a second load.
- Restore: L43 `invoked_skills` lists `demo:review`. State, not a load.
- `attributionSkill` (never a load): `demo:review` on L25, L26, L28; `alpha-helper` on L48, L51.
- `/effort` (L21), `/compact` (L39) and `/btw` (L71) are not followed by an isMeta body: no load.

### Tool calls (13; 3 errors)

| Call | Tool use id | Tool | Input | Result | Status | Result chars |
|---|---|---|---|---|---|---|
| L12 | `toolu_01FxAlpha000000000000001` | Bash | `rg -n CONTENT_TERM_ALPHA src` | L13 | ok | 96 |
| L15 | `toolu_01FxAlpha000000000000002` | Bash | `make test` | L16 | ok, persisted | 2277 (real output 3402 bytes) |
| L17 | `toolu_01FxAlpha000000000000003` | mcp__demo__fetch | `{"url":"https://example.invalid/parser-spec"}` | L18 | ok | 49 (one text block) |
| L26 | `toolu_01FxAlpha000000000000004` | AskUserQuestion | one question, two options | L27 | ok | 153 |
| L28 | `toolu_01FxAlpha000000000000005` | Edit | `src/parser.c`, `MODE_LENIENT` → `MODE_STRICT` | L29 | error (rejected, `user-rejected`) | 231 |
| L30 | `toolu_01FxAlpha000000000000006` | Bash | `cat missing.txt` | L31 | error | 55 |
| L32 | `toolu_01FxAlpha000000000000007` | Skill | `nope` | L33 | error | 52 |
| L45 | `toolu_01FxAlpha000000000000008` | Skill | `alpha-helper` | L46 | ok | 29 |
| L48 | `toolu_01FxAlpha000000000000009` | Skill | `alpha-helper` | L49 | ok | 29 |
| L51 | `toolu_01FxAlpha000000000000010` | ExitPlanMode | plan | L52 | ok | 319 |
| L60 | `toolu_01FxAlpha000000000000011` | Agent | Explore, `Survey tokenizer tests`, background | L61 | ok | 397 (one text block) |
| L62 | `toolu_01FxAlpha000000000000012` | Agent | teammate `planner` | L63 | ok | 180 (one text block) |
| L64 | `toolu_01FxAlpha000000000000013` | Workflow | `{"name":"fixture-scan","args":{"target":"src"}}` | L65 | ok | 522 |

`is_error` is `true` on L29, L31, L33; `false` on L13, L16, L65; absent on the other results.

Persisted output (L16): the text starts with the SPEC marker, says `Output too large (3.3KB)` and
`Preview (first 2KB)`, and names
`/tmp/sessions-fixture/config/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/tool-results/b4k7m2q9x.txt`,
which does not exist. The real file is `ALPHA/tool-results/b4k7m2q9x.txt`, **3402 bytes** (60 lines). `toolUseResult`
also carries `persistedOutputPath` (the stored path) and `persistedOutputSize: 3402`.

### API messages and tokens

| Message | Lines | Blocks | Input | Cache creation | Cache read | Output | Context |
|---|---|---|---|---|---|---|---|
| M1 `msg_01FxAlpha000000000000001` | L10, L11, L12 | thinking, text, tool_use | 3 | 5200 | 12000 | 180 | 17203 |
| M2 `msg_01FxAlpha000000000000002` | L14, L15, L17 | text, tool_use, tool_use | 1 | 900 | 17200 | 240 | 18101 |
| M3 `…003` | L19 | text | 1 | 1200 | 18100 | 60 | 19301 |
| M4 `…004` | L25, L26 | text, tool_use | 2 | 1500 | 19300 | 150 | 20802 |
| M5 `…005` | L28 | tool_use | 1 | 300 | 20800 | 90 | 21101 |
| M6 `…006` | L30 | tool_use | 1 | 250 | 21100 | 40 | 21351 |
| M7 `…007` | L32 | tool_use | 1 | 200 | 21350 | 30 | 21551 |
| M8 `…008` | L34 | text | 1 | 180 | 21550 | 25 | **21731** |
| M9 `…009` | L45 | tool_use | 3 | 7000 | 4000 | 35 | 11003 |
| M10 `…010` | L48 | tool_use | 1 | 2600 | 11000 | 30 | 13601 |
| M11 `…011` | L51 | tool_use | 1 | 400 | 13600 | 120 | 14001 |
| M12 `…012` | L54 | text | 1 | 500 | 14000 | 12 | 14501 |
| `<synthetic>` `e0a0eeee-5555-4000-8000-000000000001` | L56 | text | 0 | 0 | 0 | 0 | 0 |
| M13 `…013` | L60, L62, L64 | tool_use ×3 | 2 | 800 | 14500 | 400 | 15302 |
| M14 `…014` | L70 | text | 1 | 1100 | 15300 | 50 | 16401 |
| M15 `…015` | L75 | text | 1 | 600 | 16400 | 20 | 17001 |
| M16 `…016` | L81 | text | 1 | 200 | 17000 | 5 | 17201 |

(`…NNN` abbreviates `msg_01FxAlpha000000000000NNN`.) Every split entry repeats its message's final usage (2.1.300+).

- API messages: 17 (16 real + 1 `<synthetic>`); assistant entries: 24.
- Models: `claude-opus-5-5` only (`<synthetic>` excluded).
- Totals: input **22**, cache creation **22930**, cache read **257200**, output **1487**; peak context **21731** (M8, L34).
- Traps: summing every entry gives output 3277; first entry per message gives 1487 (same as last in this era).
- `cost-state` (L83) differs on purpose (one process run): `totalCostUSD` 0.4321; `claude-opus-5-5` inputTokens 21,
  outputTokens 1487, cacheReadInputTokens 245300, cacheCreationInputTokens 22930; `claude-haiku-5-5` inputTokens 12,
  outputTokens 230, cacheReadInputTokens 9000, cacheCreationInputTokens 6000.

### Compaction

C1: L36 `compact_boundary`, `compactMetadata.trigger` `manual`, `preTokens` 21760, `postTokens` 9120,
`cumulativeDroppedTokens` 12640, `durationMs` 21000, `logicalParentUuid` = L34's uuid. The `isCompactSummary` entry is
L37 (1 line later). Restore: L43 `invoked_skills`. The user's `/compact` is L35 + L39, output L40.

### Sub-agents

| Agent id | File | Type | Label | Link evidence | Status / result | Internal |
|---|---|---|---|---|---|---|
| `a7c3e9b2d4f6a8c01` | `ALPHA/subagents/agent-a7c3e9b2d4f6a8c01.jsonl` + `.meta.json` | Explore | `Survey tokenizer tests` (meta description) | T11 `toolUseResult.agentId` (L61); meta `toolUseId` = T11; notification L67 `<tool-use-id>` = T11 | completed (L67); result `Two tokenizer tests cover strict mode: test_strict_eof and test_strict_unknown.` | no |
| `aplanner-5e1f0a2b3c4d5e6f` | `ALPHA/subagents/agent-aplanner-5e1f0a2b3c4d5e6f.jsonl` + `.meta.json` | `planner` (spawnedAgentType general-purpose, taskKind in_process_teammate) | `Plan the strict-mode rollout` | T12 `toolUseResult.agent_id` (L63; no `agentId` key); meta has no `toolUseId` | `teammate_spawned`; last text `Rollout plan: enable strict mode behind a flag, then make it the default.` | no |
| `adoes-the-lexer-0a1b2c3d4e5f6a7b` | `ALPHA/subagents/agent-adoes-the-lexer-0a1b2c3d4e5f6a7b.jsonl` + `.meta.json` | fork (`isFork: true`) | `does the lexer share the parser's token table?` | parent L72 `launchedAgentId`; agent L1 `fork-context-ref` (`parentSessionId` ALPHA, `parentLastUuid` = L71's uuid) | last text `Yes: both include tokens.h, so they share one token table.` | no |
| `a3d1e5f7a9b0c2d4e` | `ALPHA/subagents/agent-a3d1e5f7a9b0c2d4e.jsonl` + `.meta.json` | general-purpose | `Answer a transcripts question` | none (no parent call) | last text `One session loaded alpha-helper.` | **yes**: L1 starts `[cc-sessions:transcripts-fork]` |
| `acompact-3f9a1c` | `ALPHA/subagents/agent-acompact-3f9a1c.jsonl` (no meta) | — | `Your task is to create a detailed summary of the conversation so far.` (prompt) | L1 `parentUuid` = ALPHA L34's uuid | — | **yes** |
| `aprompt_suggestion-8d2e4b` | `ALPHA/subagents/agent-aprompt_suggestion-8d2e4b.jsonl` (no meta) | — | `[SUGGESTION MODE: Suggest what the user might naturally type next into Claude Code.]` (prompt) | none | — | **yes** |

Each file's L1 user entry is its `from-parent` delegation prompt (the fork's is L2, after `fork-context-ref`). Tool
results in sub-agent and workflow-agent files carry no `toolUseResult`.

| Agent | Messages | Input | Cache creation | Cache read | Output | Model |
|---|---|---|---|---|---|---|
| `a7c3e9b2d4f6a8c01` | 2 (L2, L4) | 7 | 3060 | 2950 | 52 | claude-haiku-5-5 |
| `aplanner-5e1f0a2b3c4d5e6f` | 1 (L2) | 4 | 2000 | 0 | 40 | claude-haiku-5-5 |
| `adoes-the-lexer-0a1b2c3d4e5f6a7b` | 1 (L3) | 3 | 900 | 15000 | 18 | claude-opus-5-5 |
| `a0f1e2d3c4b5a6978` (workflow) | 2 (L2, L4) | 6 | 2540 | 2500 | 40 | claude-haiku-5-5 |
| `a9e8d7c6b5a4f3e21` (workflow) | 1 (L2+L3) | 5 | 2400 | 0 | 70 | claude-haiku-5-5 |
| `a3d1e5f7a9b0c2d4e` (internal) | 1 | 3 | 700 | 0 | 9 | claude-opus-5-5 |
| `acompact-3f9a1c` (internal) | 1 | 3 | 0 | 21500 | 300 | claude-opus-5-5 |
| `aprompt_suggestion-8d2e4b` (internal) | 1 | 2 | 0 | 16000 | 6 | claude-haiku-5-5 |

Roll-up without internal agents: 7 messages, input **25**, cache creation **10900**, cache read **20450**, output **220**.
Including internal agents: 10 messages, input 33, cache creation 11600, cache read 57950, output 535.

### Workflow run `wf_5d1c9a7e-3b2`

- Call T13 (L64) → L65 `toolUseResult`: `runId` `wf_5d1c9a7e-3b2`, `taskId` `w3k9p2m7z`, `taskType` `local_workflow`,
  `workflowName` `fixture-scan`, `transcriptDir` and `scriptPath` under the nonexistent stored root.
- Run directory `WF/`; run record `ALPHA/workflows/wf_5d1c9a7e-3b2.json`: `status` completed, `agentCount` 2,
  `result` `{"status":"ok","findings":1}`, phases `Scan`, `Report`, `totalTokens` 9000, `totalToolCalls` 2,
  `durationMs` 42000, `defaultModel` claude-haiku-5-5. The saved script is
  `ALPHA/workflows/scripts/fixture-scan-wf_5d1c9a7e-3b2.js` (not a transcript).
- Completion: L68 `<task-notification>`, `<tool-use-id>` = T13, `<status>completed</status>`,
  `<result>{"status":"ok","findings":1}</result>`.
- `WF/journal.jsonl`: L1 `launched`; L2 `started` scan/`Scan` (`a0f1e2d3c4b5a6978`); L3 `result` for it, the string
  `Scanned 3 files; one parser symbol found.`; L4 `started` report/`Report` (`a9e8d7c6b5a4f3e21`); L5 `result` for it,
  the object `{"finding":"CONTENT_TERM_ALPHA is parsed leniently","severity":"low"}`.

| Agent | Meta (type, description, phase) | Journal label / phase | Transcript | Result |
|---|---|---|---|---|
| `a0f1e2d3c4b5a6978` | workflow-subagent, `scan`, `Scan` | `scan` / `Scan` | L1 prompt (contains CONTENT_TERM_ALPHA), L2 tool_use Bash `ls src`, L3 result `parser.c\nlexer.c\nmain.c`, L4 text | `Scanned 3 files; one parser symbol found.` |
| `a9e8d7c6b5a4f3e21` | workflow-subagent, `report`, `Report` | `report` / `Report` | L1 prompt, L2 empty thinking + L3 tool_use StructuredOutput (one message), L4 attachment `structured_output` (`toolUseID` = the L3 call), L5 result `Structured output provided successfully` | `{"finding":"CONTENT_TERM_ALPHA is parsed leniently","severity":"low"}` |

## BETA (pre-2.1.300, 2.1.206)

| L | Entry | Notes |
|---|---|---|
| 1 | `permission-mode` (`acceptEdits`) | |
| 2 | user prompt `Summarise the beta build failures.` | H1 |
| 3 | assistant M1 thinking (empty), `output_tokens` 1, `stop_reason` null | partial usage |
| 4 | assistant M1 text `Reading the build log.`, `output_tokens` 1 | partial usage |
| 5 | assistant M1 tool_use T1 Bash `cat build.log`, `output_tokens` 1100 | final usage |
| 6 | user tool_result T1 `error: missing header beta.h\nerror: undefined symbol beta_init` (62 chars) | ok |
| 7 | assistant M2 text `Two failures: a missing header and an undefined symbol.` | timestamp 09:00:02.600Z, earlier than L6 (09:00:06.500Z) |
| 8 | `queue-operation` enqueue, content `Also list the warnings.` | H2 (queued; text appears nowhere else) |
| 9 | user prompt `Find where the header should live.` | H3 |
| 10 | assistant M3 text `Delegating the header search.`, `output_tokens` 1 | partial usage |
| 11 | assistant M3 tool_use T2 Agent (Explore, `Check header paths`), `output_tokens` 80 | final usage |
| 12 | user tool_result T2: two text blocks (37 and 96 chars); `toolUseResult` status `completed`, `agentId` `a4c6e8f0a2b4c6d8e` | ok |
| 13 | assistant M4 text `The header belongs in include/beta.h.` | |
| 14–19 | re-appended copies of L2–L7: same uuids, plus a `slug` key | 6 duplicates |
| 20 | truncated JSON (`…"content":"Is the warn`) | 1 corrupt line |
| 21 | user prompt `List the warnings too.` | H4 |
| 22 | assistant M5 text `No warnings were reported.` | |

- Human input (4): L2, L8 (queued), L9, L21.
- Tool calls: T1 `toolu_01FxBeta0000000000000001` (L5 → L6, ok); T2 `toolu_01FxBeta0000000000000002` (L11 → L12, ok).
- Duplicate uuids 6 (L14–L19); corrupt lines 1 (L20). After de-duplication, timestamps run backwards at L6 → L7; in raw
  file order also at L13 → L14.
- Messages (5): M1 `msg_01FxBeta0000000000000001` L3–L5 (4/3000/9000/1100); M2 `…0002` L7 (1/200/12000/45); M3 `…0003`
  L10–L11 (2/400/12300/80); M4 `…0004` L13 (1/300/12900/30); M5 `…0005` L22 (1/150/13200/12).
- Totals: input **9**, cache creation **4050**, cache read **59400**, output **1267**; peak context **13351** (M5, L22).
  Traps: first entry per message gives output 89; every de-duplicated entry gives 1270; every parsed line gives 2417.
- Model: claude-opus-5-5. No ai-title, custom-title, agent-name or summary.

Sub-agent `a4c6e8f0a2b4c6d8e`: `BETA/subagents/agent-a4c6e8f0a2b4c6d8e.jsonl` + `.meta.json` (Explore, description
`Check header paths`, `toolUseId` = T2). L1 delegation prompt `Find where the missing beta.h header should live.`; L2
thinking (`output_tokens` 1) and L3 tool_use Glob `**/beta.h` (`output_tokens` 64) are one message; L4 result
`include/beta.h` (14 chars, no `toolUseResult`); L5 text `The header belongs in include/beta.h.`. Two messages: input 4,
cache creation 3090, cache read 3400, output 86; model claude-haiku-5-5. Status completed (sync).

## RESUMED (resumed copy of BETA)

- L1–L5 are byte-identical copies of BETA L9–L13 (BETA's uuids and session id). L6 user prompt
  `Now fix the include path.`, L7 assistant `Updated the include path to include/beta.h.` (own session id).
- Human input (2): L1 `Find where the header should live.`, L6 `Now fix the include path.`.
- Agent call T2 at L3 (result L4) names `a4c6e8f0a2b4c6d8e`. `RESUMED/` does not exist; the file is found only at
  `BETA/subagents/agent-a4c6e8f0a2b4c6d8e.jsonl`.
- Messages (3): `msg_01FxBeta0000000000000003` L2–L3, `msg_01FxBeta0000000000000004` L5, `msg_01FxBetaRs00000000000001`
  L7. Input 6, cache creation 4700, cache read 34200, output 135; peak context 13201 (L5). Model claude-opus-5-5.
- Timestamps run from `2026-07-15T09:01:03.950Z` (L1) to `2026-07-20T14:00:05.781Z` (L7).

## FLAT (2.0.76, flat sub-agent layout)

| L | Entry | Notes |
|---|---|---|
| 1 | `summary` `Flat era config loader search` (`leafUuid` = L8's uuid) | label |
| 2 | user `Find the flat config loader.` (no origin / promptSource keys) | H1 |
| 3 | assistant M1 text `Delegating the search.`, `output_tokens` 1 | partial |
| 4 | assistant M1 tool_use T1 `Task` (Explore, `Locate config loader`, prompt `Locate the config loader in the flat project.`), `output_tokens` 52 | final |
| 5 | `progress`, `data.type` `agent_progress`, `data.agentId` `5f6a7b8c`, `parentToolUseID` = T1 | copy of the agent's L1 |
| 6 | `progress`, `agent_progress` | copy of the agent's L2 |
| 7 | user tool_result T1: two text blocks (29 and 72 chars); `toolUseResult` status `completed`, `agentId` `5f6a7b8c` | ok |
| 8 | assistant M2 text `The config loader is config/load.rb.` | |

- Tool call: T1 `toolu_01FxFlat0000000000000001` Task (L4 → L7, ok).
- Messages (2): `msg_01FxFlat0000000000000001` L3–L4 (3/4000/8000/52), `msg_01FxFlat0000000000000002` L8
  (1/300/12000/14). Input 4, cache creation 4300, cache read 20000, output 66; peak context 12301 (L8). Model
  claude-sonnet-4-5-20250929. No `entrypoint` on any entry.
- Flat sub-agents, both in `projects/-tmp-sessions-fixture-flat/`, both with `sessionId` = FLAT, no meta files:
  - `agent-5f6a7b8c.jsonl`: L1 delegation prompt (equals the Task prompt), L2 text `The loader is config/load.rb.`
    (claude-haiku-4-5-20251001; 4/4600/0/16). Linked to T1 by `toolUseResult.agentId` and by prompt text.
  - `agent-9a0b1c2d.jsonl`: L1 `Warmup`, L2 text. Internal (Warmup).

## SDK

L1 `queue-operation` enqueue (no content), L2 dequeue, L3 user text block `Rename the report generator skill to
report-builder.` (`promptSource` sdk, `turnOrigin` sdk, no origin) = H1 kind `sdk`, L4 ai-title, L5 assistant
`Renamed the skill to report-builder.`. `entrypoint` `sdk-ts` on L3 and L5. One message
`msg_01FxSdk00000000000000001`: 3/6000/0/20, peak 6003.

## RELOC (relocated session)

| L | Entry | Notes |
|---|---|---|
| 1 | user prompt `Show the release notes.` | H1 |
| 2 | ai-title `Show the release notes` | label |
| 3 | `relocated` (`relocatedCwd` `/tmp/sessions-fixture/elsewhere`) | |
| 4 | assistant tool_use T1 Bash `cat RELEASE.md` | |
| 5 | user tool_result T1, persisted, 2245 chars | |
| 6 | assistant tool_use T2 Bash `grep -n persisted notes.txt` | |
| 7 | user tool_result T2, 154 chars, begins `notes.txt:4:<persisted-output>` | **not** persisted (marker mid-text) |
| 8 | assistant text `The release notes list forty fixes.` | |
| 9 | ai-title `release-notes-plan` | single token |
| 10 | agent-name `release-notes-plan` | |

- L5 says `Output too large (2.4KB)` and names
  `/tmp/sessions-fixture/config/projects/-tmp-sessions-fixture-elsewhere/e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d/tool-results/c8n2v5x1q.txt`
  (a project directory that exists nowhere). The real file is `RELOC/tool-results/c8n2v5x1q.txt`, **2502 bytes**;
  `persistedOutputSize` 2502.
- Tool ids: T1 `toolu_01FxReloc000000000000001`, T2 `toolu_01FxReloc000000000000002`; both ok.
- Messages (3): input 5, cache creation 6200, cache read 10900, output 82; peak context 6201 (L8). Model claude-opus-5-5.

## UNDER (cwd with a space and an underscore)

L1 isMeta `Base directory for this skill: /tmp/sessions fixture/under_score/.claude/skills/orphan-skill\n\n# Orphan
skill…` with no trigger: an orphan skill load named `orphan-skill`. L2 user prompt `List the files with spaces in their
names.` (H1, the label). L3 assistant `Two files have spaces in their names.` (3/4000/0/11).

## GAMMA (current era, 2.1.316)

### Lines

| L | Entry | Role in the rules |
|---|---|---|
| 1 | user, origin human, typed: `Rebuild the gamma index with full effort, then check the table.` | human input H1 |
| 2 | attachment `skill_listing` (`gamma-helper`) | NOISE_ONLY_TERM; never searched |
| 3 | attachment `ultra_effort_enter` (`reminderType` `full`) | state |
| 4 | user isMeta, `turnCompanion`: `<command-message>fixture-focus</command-message>\n<command-name>fixture-focus</command-name>\n<skill-format>true</skill-format>` (same `promptId` as L1) | injected; harness command trigger |
| 5 | user isMeta, `turnCompanion`: `# Fixture focus\n\nVerify each step before reporting it.` | injected (bundled body) |
| 6 | assistant M1 block 0: text `Reading the gamma table first.` | |
| 7 | assistant M1 block 1: tool_use T1 Read `/tmp/sessions-fixture/gamma/data/table.txt` | |
| 8 | user tool_result T1: 30000 characters inline | largest result; not persisted |
| 9 | attachment `nested_memory` (`/tmp/sessions-fixture/gamma/data/CLAUDE.md`, renderedRole `user`) | NOISE_ONLY_TERM; never searched |
| 10 | assistant M2: tool_use T2 Bash `make index`, `run_in_background: true` | background call |
| 11 | user tool_result T2 `Command running in background with ID: b8r2k6t4q. …` | |
| 12 | assistant M3: text `The index is rebuilding in the background.` | |
| 13 | `ai-title` `gamma-index-plan` | single token (plan slug) |
| 14 | `agent-name` `gamma-indexer` | label |
| 15 | `queue-operation` enqueue, content = L17's text | not input (the text appears at L17); never searched |
| 16 | `queue-operation` dequeue | |
| 17 | user `<task-notification>` for T2 (origin `task-notification`, promptSource `system`) | notification |
| 18 | assistant M4: text `The index rebuild finished with exit code 0.` | |
| 19 | user, origin human, typed: `I changed notes.md by hand; compare it with the table.` | human input H2 |
| 20 | assistant M5: tool_use T3 Bash `git diff --stat` | |
| 21 | user tool_result T3 | |
| 22 | attachment `edited_text_file` (`/tmp/sessions-fixture/gamma/notes.md`) | kind `file` |
| 23 | assistant M6 block 0: thinking, empty (signature only) | not content |
| 24 | assistant M6 block 1: text `Only the notes header changed; the table still matches it.` | |

Entry counts: user 8, assistant 8, attachment 4, queue-operation 2, ai-title 1, agent-name 1. No corrupt lines, no
duplicate uuids, no backwards timestamps. First timestamp `2026-10-26T14:00:03.950Z` (L1), last
`2026-10-26T14:20:13.781Z` (L24). `GAMMA/` does not exist: no sub-agents, workflows or persisted outputs.

### Human input (2)

| # | Handle | Kind | Text | Timestamp |
|---|---|---|---|---|
| H1 | L1 | prompt | `Rebuild the gamma index with full effort, then check the table.` | 14:00:03.950Z |
| H2 | L19 | prompt | `I changed notes.md by hand; compare it with the table.` | 14:20:03.550Z |

- Not input: injected L4, L5; notification L17; tool results L8, L11, L21; the enqueue L15 (its text is L17's).

### Skill loads

| Handle | Name | How | Evidence |
|---|---|---|---|
| L4 → L5 | `fixture-focus` | harness command, `bundled` | `<command-name>fixture-focus</command-name>` (no slash) with `<skill-format>`, directly followed by an isMeta body that does not start with `Base directory` |

- The trigger L4 is itself isMeta. No Skill tool call, `invoked_skills` or `attributionSkill`. The `skill_listing` (L2)
  names `gamma-helper`, which never loads.

### Tool calls (3; no errors)

| Call | Tool use id | Tool | Input | Result | Status | Result chars |
|---|---|---|---|---|---|---|
| L7 | `toolu_01FxGamma000000000000001` | Read | `/tmp/sessions-fixture/gamma/data/table.txt` | L8 | ok | **30000** |
| L10 | `toolu_01FxGamma000000000000002` | Bash | `make index` (description `Rebuild the gamma index`, `run_in_background: true`) | L11 | ok | 229 |
| L20 | `toolu_01FxGamma000000000000003` | Bash | `git diff --stat` | L21 | ok | 63 |

`is_error` is `false` on L11 and L21, absent on L8.

- L8 is a Read result in the 2.1.31x form: one unpadded `<n>\t<line>` per file line, 701 lines: `cell 0001 | weight 037
  | state settled` through `cell 0699 | weight 863 | state settled`, then `end` and 39 dots, then an empty line 701.
  It does not start with the persisted-output marker. `toolUseResult` is `{type: "text", file: {filePath, content
  (27304 characters), numLines: 701, startLine: 1, totalLines: 701}}`. With `--full`, a record carrying this result
  alone is longer than the default 20000-character budget.
- Background call: L11 `toolUseResult` is `{stdout: "", stderr: "", interrupted: false, isImage: false,
  noOutputExpected: false, backgroundTaskId: "b8r2k6t4q"}`. Completion L17: `<task-id>b8r2k6t4q</task-id>`,
  `<tool-use-id>` = T2, `<status>completed</status>`, `<summary>Background command "Rebuild the gamma index" completed
  (exit code 0)</summary>`, no `<result>`. Its `<output-file>` (also named in L11's text) is
  `/private/tmp/claude-501/-tmp-sessions-fixture-gamma/c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f/tasks/b8r2k6t4q.output`,
  which never exists and is never followed.

### API messages and tokens

| Message | Lines | Blocks | Input | Cache creation | Cache read | Output | Context |
|---|---|---|---|---|---|---|---|
| M1 `msg_01FxGamma000000000000001` | L6, L7 | text, tool_use | 3 | 6000 | 9000 | 120 | 15003 |
| M2 `…002` | L10 | tool_use | 1 | 8200 | 15000 | 60 | 23201 |
| M3 `…003` | L12 | text | 1 | 300 | 23200 | 20 | 23501 |
| M4 `…004` | L18 | text | 1 | 400 | 23500 | 15 | 23901 |
| M5 `…005` | L20 | tool_use | 2 | 500 | 23900 | 40 | 24402 |
| M6 `…006` | L23, L24 | thinking (empty), text | 1 | 350 | 24400 | 30 | **24751** |

(`…NNN` abbreviates `msg_01FxGamma000000000000NNN`.) Every split entry repeats its message's final usage (2.1.300+).

- API messages: 6; assistant entries: 8. Models: `claude-opus-5-5` only.
- Totals: input **9**, cache creation **15750**, cache read **119000**, output **285**; peak context **24751** (M6,
  first entry L23).
- Trap: summing every entry gives output 435.

### Label

No `custom-title` and no `summary`; the only `ai-title` (L13) is a single token, so the label is the `agent-name`
`gamma-indexer` (L14), not the first human input (L1).

## STUB

One line: `{"type":"ai-title","aiTitle":"Stub session title",…}`. No user or assistant entry; skipped by listings.

## Search

`CONTENT_TERM_ALPHA` appears in exactly these entries (all in session ALPHA):

| File | Handle | Kind | Searched by default | Where in the entry |
|---|---|---|---|---|
| `ALPHA.jsonl` | L4 | prompt | yes | human prompt H1 |
| `ALPHA.jsonl` | L10 | thinking | no | thinking block |
| `ALPHA.jsonl` | L12 | tool-input | yes | Bash `input.command` and `wireToolInputs` |
| `ALPHA.jsonl` | L13 | tool-result | yes | tool_result content (and `toolUseResult.stdout`) |
| `ALPHA.jsonl` | L14 | assistant | yes | text block |
| `ALPHA.jsonl` | L47 | injected | no | `alpha-helper` skill body |
| `WF/agent-a0f1e2d3c4b5a6978.jsonl` | L1 | from-parent | yes | workflow agent delegation prompt |
| `WF/agent-a9e8d7c6b5a4f3e21.jsonl` | L3 | tool-input | yes | StructuredOutput input (and `wireToolInputs`) |
| `WF/agent-a9e8d7c6b5a4f3e21.jsonl` | L4 | agent-result | yes | `attachment.structured_output.data` |
| `WF/journal.jsonl` | L5 | agent-result | yes | journal `result` |

Default search: 8 records; adding `thinking` and `injected`: 10. Corpus search finds one session, ALPHA. The term is
absent from `invoked_skills`, `api-request-blob`, `last-prompt`, notifications and the run record.

| Term | Occurrences |
|---|---|
| `NOISE_ONLY_TERM` | ALPHA L5 (`skill_listing`), L6 (`instructions`), L7 (`api-request-blob`), GAMMA L2 (`skill_listing`), L9 (`nested_memory`) only; search finds nothing (exit 0, stderr notice) |
| `GAMMA_FILE_TERM` | GAMMA L22 only (`edited_text_file`: `attachment.snippet`, also in `rendered`); kind `file`, searched by default; corpus search finds one session, GAMMA |
| `state settled` | GAMMA L8 only: 699 times in the one 30000-character tool-result (and in `toolUseResult.file.content`) |
| `b8r2k6t4q` | GAMMA L11 (tool-result), L15 (`queue-operation`; never searched), L17 (notification; not searched by default) |
| ``please run "make test" now`` | ALPHA L4 (prompt) only; on disk the quotes are `\"` |
| `make test` (fixed string) | ALPHA L4 (prompt), L15 (tool-input; also in `wireToolInputs`) |
| `--force-push-now` | ALPHA L19 (assistant) only |
| `lib.jq` (fixed string) | ALPHA L14 (assistant) only |
| `lib.jq` (regex) | ALPHA L13 (tool-result; matches `libXjq`) and L14 |
| `libXjq` | ALPHA L13 (tool-result) only |
| `[cc-sessions:transcripts-fork]` | `ALPHA/subagents/agent-a3d1e5f7a9b0c2d4e.jsonl` L1 only |

Other searchable kinds present: `hook` ALPHA L3; `file` ALPHA L41 (`file`), GAMMA L22 (`edited_text_file`); `plan`
ALPHA L42; `recap` ALPHA L76.

## Schema

- Entry types across all transcripts: `user`, `assistant`, `attachment`, `system`, `ai-title`, `custom-title`,
  `agent-name`, `summary`, `last-prompt`, `permission-mode`, `mode`, `api-request`, `api-request-blob`, `cost-state`,
  `queue-operation`, `progress`, `relocated`, `fork-context-ref`. Journal types: `launched`, `started`, `result`.
- Attachment types: `hook_success`, `skill_listing`, `instructions`, `file`, `plan_file_reference`, `invoked_skills`,
  `queued_command`, `structured_output`, `ultra_effort_enter`, `nested_memory`, `edited_text_file`, and the unknown
  **`brand_new_kind`** (ALPHA L77), which `schema` must flag.
- System subtypes: `compact_boundary`, `local_command`, `informational`, `away_summary`.

## Departures from real transcripts

- FLAT (2.0.76) carries `progress`/`agent_progress` entries; real 2.0.x files have none (progress entries exist up to
  2.1.84). The shape is copied from 2.1.84.
- ALPHA (2.1.314) has a non-meta peer entry with no origin (L66), a 2.1.2xx shape; in 2.1.31x peer messages are isMeta
  with `origin.kind` peer.
- Persisted outputs are about 3 KB (Claude Code persists at roughly 30 KB). The preview is the first ≤2 KB, cut at a
  line end.
- uuids, message ids, tool ids, signatures and hashes are patterned, not random.
- GAMMA's `agent-name` (`gamma-indexer`) differs from its `ai-title` (`gamma-index-plan`) so that the label rule is
  visible in the text; in real 2.1.31x transcripts nearly every `agent-name` repeats the `ai-title` written just
  before it.
- GAMMA's entries carry a subset of the top-level keys real 2.1.316 entries have: no `session_id`, `slug`,
  `serverClassifierRequest`, `serverClassifierContext`, `permissionDecision`, `requestRef`, `requestedModel` or
  `effort`.
