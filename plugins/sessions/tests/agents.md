---
prepend: [setup.md]
---

# cc-sessions agents

Values come from `fixtures/FACTS.md`.

## Synopsis and help

```scrut
$ cc-sessions agents --synopsis
agents <session>  sub-agents, teammates, forks and workflow runs: their transcripts, status and results
```

```scrut
$ cc-sessions --help | grep '^  agents '
  agents <session>  sub-agents, teammates, forks and workflow runs: their transcripts, status and results
```

Help names the operand, every option, the first record, the fields in order, the kinds, the widths, the empty-answer
notice and the exit codes.

```scrut
$ cc-sessions agents --help > help.txt; echo "exit $?"
> grep -E '^Usage: cc-sessions agents <session>' help.txt
> awk '/^Fields/ { f = 1; next } f && /^  [a-z_]+  / { printf "%s ", $1 } /^$/ { f = 0 } END { print "" }' help.txt
> grep -o -E -e '--(since|until|full)' help.txt | sort -u | paste -s -d ' ' -
> for k in agent teammate fork flat workflow workflow-agent internal; do grep -q -w -e "$k" help.txt || echo "missing $k"; done
> grep -o -E 'dir  <absolute session directory>|80 characters|150|no sub-agent or workflow calls in <transcript>|Exit status' help.txt
exit 0
Usage: cc-sessions agents <session> [--since T] [--until T] [--full]
handle kind id type status model output_tokens label path result 
--full --since --until
80 characters
150
dir  <absolute session directory>
no sub-agent or workflow calls in <transcript>
Exit status
```

```scrut
$ [ "$(wc -l < help.txt)" -lt 40 ] && echo short
> CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions agents --help | cmp - help.txt && echo same
short
same
```

## A current-era session

ALPHA: the background Explore agent (linked by `agentId`, finished by its notification), the teammate (linked by
`agent_id`), the workflow run with its two agents right after it, the fork (linked by `launchedAgentId`), then the
internal agents, which no call links to. Paths under the `dir` record are relative to it.

```scrut
$ cc-sessions agents a7c3e9f | cc_test_rel
dir\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e (escaped)
L60\tagent\ta7c3e9b2d4f6a8c01\tExplore\tcompleted\tclaude-haiku-5-5\t52\tSurvey tokenizer tests\tsubagents/agent-a7c3e9b2d4f6a8c01.jsonl\tTwo tokenizer tests cover strict mode: test_strict_eof and test_strict_unknown. (escaped)
L62\tteammate\taplanner-5e1f0a2b3c4d5e6f\tplanner\tcompleted\tclaude-haiku-5-5\t40\tPlan the strict-mode rollout\tsubagents/agent-aplanner-5e1f0a2b3c4d5e6f.jsonl\tRollout plan: enable strict mode behind a flag, then make it the default. (escaped)
L64\tworkflow\twf_5d1c9a7e-3b2\tfixture-scan\tcompleted\tclaude-haiku-5-5\t110\tScan the source and report findings.\tsubagents/workflows/wf_5d1c9a7e-3b2\t{"status":"ok","findings":1} (escaped)
L64\tworkflow-agent\ta0f1e2d3c4b5a6978\tworkflow-subagent\tcompleted\tclaude-haiku-5-5\t40\tscan\tsubagents/workflows/wf_5d1c9a7e-3b2/agent-a0f1e2d3c4b5a6978.jsonl\tScanned 3 files; one parser symbol found. (escaped)
L64\tworkflow-agent\ta9e8d7c6b5a4f3e21\tworkflow-subagent\tcompleted\tclaude-haiku-5-5\t70\treport\tsubagents/workflows/wf_5d1c9a7e-3b2/agent-a9e8d7c6b5a4f3e21.jsonl\t{"finding":"CONTENT_TERM_ALPHA is parsed leniently","severity":"low"} (escaped)
L72\tfork\tadoes-the-lexer-0a1b2c3d4e5f6a7b\tfork\tcompleted\tclaude-opus-5-5\t18\tdoes the lexer share the parser's token table?\tsubagents/agent-adoes-the-lexer-0a1b2c3d4e5f6a7b.jsonl\tYes: both include tokens.h, so they share one token table. (escaped)
-\tinternal\ta3d1e5f7a9b0c2d4e\tgeneral-purpose\tcompleted\tclaude-opus-5-5\t9\tAnswer a transcripts question\tsubagents/agent-a3d1e5f7a9b0c2d4e.jsonl\tOne session loaded alpha-helper. (escaped)
-\tinternal\tacompact-3f9a1c\t-\tcompleted\tclaude-opus-5-5\t300\tYour task is to create a detailed summary of the conversation so far.\tsubagents/agent-acompact-3f9a1c.jsonl\t<summary>The parser review is under way and the tests pass.</summary> (escaped)
-\tinternal\taprompt_suggestion-8d2e4b\t-\tcompleted\tclaude-haiku-5-5\t6\t[SUGGESTION MODE: Suggest what the user might naturally type next into Claude C…\tsubagents/agent-aprompt_suggestion-8d2e4b.jsonl\trun the lexer tests (escaped)
```

`wf_<run-id>` and `current` name the same session; the paths in the records resolve against `dir`.

```scrut
$ cc-sessions agents a7c3e9f > alpha.txt && cc-sessions agents wf_5d1c9a7e-3b2 | cmp - alpha.txt && echo same
> CLAUDE_CODE_SESSION_ID=a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e cc-sessions agents current | cmp - alpha.txt && echo same
> dir=$(head -n 1 alpha.txt | cut -f 2); tail -n +2 alpha.txt | cut -f 9 | while read -r p; do [ -e "$dir/$p" ] || echo "missing $p"; done; echo resolved
same
same
resolved
```

## Older layouts and the resumed copy

BETA (2.1.206): a synchronous agent, completed by its call's result. The corrupt line is skipped with a notice.

```scrut
$ cc-sessions agents b2d4 2>/dev/null | cc_test_rel
dir\t<root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e (escaped)
L11\tagent\ta4c6e8f0a2b4c6d8e\tExplore\tcompleted\tclaude-haiku-5-5\t86\tCheck header paths\tsubagents/agent-a4c6e8f0a2b4c6d8e.jsonl\tThe header belongs in include/beta.h. (escaped)
```

```scrut
$ cc-sessions agents b2d4 2>&1 >/dev/null | cc_test_rel
cc-sessions: skipped 1 unparseable line in <root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e.jsonl: L20
```

The resumed copy has no session directory; its call names an agent whose file lives only in BETA's directory. A path
outside `dir` is absolute, so that it names the file even where `dir` does not exist.

```scrut
$ cc-sessions agents b9e1 | cc_test_rel
dir\t<root>/projects/-tmp-sessions-fixture-beta/b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c (escaped)
L3\tagent\ta4c6e8f0a2b4c6d8e\tExplore\tcompleted\tclaude-haiku-5-5\t86\tCheck header paths\t<root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e/subagents/agent-a4c6e8f0a2b4c6d8e.jsonl\tThe header belongs in include/beta.h. (escaped)
```

FLAT (2.0.76): flat-layout agents beside the transcript, linked by `sessionId`; the Task call's agent is linked by its
`agentId`, and the Warmup agent is internal.

```scrut
$ cc-sessions agents c4e6 | cc_test_rel
dir\t<root>/projects/-tmp-sessions-fixture-flat/c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a (escaped)
L4\tflat\t5f6a7b8c\tExplore\tcompleted\tclaude-haiku-4-5-20251001\t16\tLocate the config loader in the flat project.\t<root>/projects/-tmp-sessions-fixture-flat/agent-5f6a7b8c.jsonl\tThe loader is config/load.rb. (escaped)
-\tinternal\t9a0b1c2d\t-\tcompleted\tclaude-haiku-4-5-20251001\t12\tWarmup\t<root>/projects/-tmp-sessions-fixture-flat/agent-9a0b1c2d.jsonl\tI'm ready to help search the flat project. (escaped)
```

Without an agent id in the result, the flat agent is still linked by its prompt text.

```scrut
$ V=$CC_TEST_TMP/variants && mkdir -p "$V/projects/-tmp-sessions-fixture-flat"
> cp "$P"/-tmp-sessions-fixture-flat/agent-*.jsonl "$V/projects/-tmp-sessions-fixture-flat/"
> jq -c 'del(.toolUseResult.agentId) | del(.data.agentId)
>   | if input_line_number == 7 then .message.content[0].content |= map(select(.text | startswith("agentId:") | not)) else . end' "$FLAT.jsonl" > "$V/projects/-tmp-sessions-fixture-flat/c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a.jsonl"
> CLAUDE_CONFIG_DIR=$V cc-sessions agents "$V/projects/-tmp-sessions-fixture-flat/c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a.jsonl" | cut -f 1-3,9 | cc_test_rel "$V"
dir\t<root>/projects/-tmp-sessions-fixture-flat/c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a (escaped)
L4\tflat\t5f6a7b8c\t<root>/projects/-tmp-sessions-fixture-flat/agent-5f6a7b8c.jsonl (escaped)
-\tinternal\t9a0b1c2d\t<root>/projects/-tmp-sessions-fixture-flat/agent-9a0b1c2d.jsonl (escaped)
```

## Missing and unlinked files

A copy of ALPHA in which the Explore agent's file is gone, the Workflow call names a run that exists nowhere, and the
fork's last text is long. The call rows keep what the calls and notifications say; the real run is listed without a
call, with its agents after it.

```scrut
$ C=$CC_TEST_TMP/copy && mkdir -p "$C/projects" && cp -R "$P/-tmp-sessions-fixture-alpha" "$C/projects/"
> S=$C/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e
> rm "$S/subagents/agent-a7c3e9b2d4f6a8c01.jsonl" "$S/subagents/agent-a7c3e9b2d4f6a8c01.meta.json"
> jq -c 'if input_line_number == 65 then .toolUseResult.runId = "wf_0000missing" else . end' "$ALPHA.jsonl" > "$S.jsonl"
> jq -c 'if .type == "assistant" then .message.content[0].text = ("word " * 40) else . end' "$ALPHA/subagents/agent-adoes-the-lexer-0a1b2c3d4e5f6a7b.jsonl" > "$S/subagents/agent-adoes-the-lexer-0a1b2c3d4e5f6a7b.jsonl"
> CLAUDE_CONFIG_DIR=$C cc-sessions agents "$S.jsonl" | cc_test_rel "$C"
dir\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e (escaped)
L60\tagent\ta7c3e9b2d4f6a8c01\tExplore\tcompleted\t-\t-\tSurvey tokenizer tests\t-\tTwo tokenizer tests cover strict mode: test_strict_eof and test_strict_unknown. (escaped)
L62\tteammate\taplanner-5e1f0a2b3c4d5e6f\tplanner\tcompleted\tclaude-haiku-5-5\t40\tPlan the strict-mode rollout\tsubagents/agent-aplanner-5e1f0a2b3c4d5e6f.jsonl\tRollout plan: enable strict mode behind a flag, then make it the default. (escaped)
L64\tworkflow\twf_0000missing\tfixture-scan\tcompleted\t-\t-\t-\t-\t{"status":"ok","findings":1} (escaped)
L72\tfork\tadoes-the-lexer-0a1b2c3d4e5f6a7b\tfork\tcompleted\tclaude-opus-5-5\t18\tdoes the lexer share the parser's token table?\tsubagents/agent-adoes-the-lexer-0a1b2c3d4e5f6a7b.jsonl\tword word word word word word word word word word word word word word word word word word word word word word word word word word word word word word… (escaped)
-\tworkflow\twf_5d1c9a7e-3b2\tfixture-scan\tcompleted\tclaude-haiku-5-5\t110\tScan the source and report findings.\tsubagents/workflows/wf_5d1c9a7e-3b2\t{"status":"ok","findings":1} (escaped)
-\tworkflow-agent\ta0f1e2d3c4b5a6978\tworkflow-subagent\tcompleted\tclaude-haiku-5-5\t40\tscan\tsubagents/workflows/wf_5d1c9a7e-3b2/agent-a0f1e2d3c4b5a6978.jsonl\tScanned 3 files; one parser symbol found. (escaped)
-\tworkflow-agent\ta9e8d7c6b5a4f3e21\tworkflow-subagent\tcompleted\tclaude-haiku-5-5\t70\treport\tsubagents/workflows/wf_5d1c9a7e-3b2/agent-a9e8d7c6b5a4f3e21.jsonl\t{"finding":"CONTENT_TERM_ALPHA is parsed leniently","severity":"low"} (escaped)
-\tinternal\ta3d1e5f7a9b0c2d4e\tgeneral-purpose\tcompleted\tclaude-opus-5-5\t9\tAnswer a transcripts question\tsubagents/agent-a3d1e5f7a9b0c2d4e.jsonl\tOne session loaded alpha-helper. (escaped)
-\tinternal\tacompact-3f9a1c\t-\tcompleted\tclaude-opus-5-5\t300\tYour task is to create a detailed summary of the conversation so far.\tsubagents/agent-acompact-3f9a1c.jsonl\t<summary>The parser review is under way and the tests pass.</summary> (escaped)
-\tinternal\taprompt_suggestion-8d2e4b\t-\tcompleted\tclaude-haiku-5-5\t6\t[SUGGESTION MODE: Suggest what the user might naturally type next into Claude C…\tsubagents/agent-aprompt_suggestion-8d2e4b.jsonl\trun the lexer tests (escaped)
```

## Status from the transcript's end

With nothing else to go by, an agent's status comes from its transcript's end: completed when the last message stopped
(`end_turn`, or no `stop_reason` and no tool call, as before 2.1.300), failed on an API error, else unknown (a pending
tool call, or a user entry last).

```scrut
$ E=$CC_TEST_TMP/ends && D=$E/projects/-tmp-ends/e0d1 && mkdir -p "$D/subagents" && printf '%s\n' '{"type":"user","uuid":"m1","message":{"role":"user","content":"Go."}}' > "$D.jsonl"
> end() { printf '%s\n' '{"type":"user","uuid":"x1","message":{"role":"user","content":"Do it."}}' "$2" > "$D/subagents/agent-$1.jsonl"; }
> end a0000000000000001 '{"type":"assistant","uuid":"x2","message":{"id":"m","model":"claude-haiku-5-5","stop_reason":"end_turn","content":[{"type":"text","text":"Done."}]}}'
> end a0000000000000002 '{"type":"assistant","uuid":"x2","isApiErrorMessage":true,"message":{"id":"m","model":"<synthetic>","content":[{"type":"text","text":"API Error: 529"}]}}'
> end a0000000000000003 '{"type":"assistant","uuid":"x2","message":{"id":"m","model":"claude-haiku-5-5","stop_reason":"tool_use","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{}}]}}'
> end a0000000000000004 '{"type":"assistant","uuid":"x2","message":{"id":"m","model":"claude-haiku-5-5","stop_reason":null,"content":[{"type":"text","text":"Done."}]}}'
> end a0000000000000005 '{"type":"user","uuid":"x2","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"ok"}]}}'
> CLAUDE_CONFIG_DIR=$E cc-sessions agents "$D.jsonl" | tail -n +2 | cut -f 3,5
a0000000000000001\tcompleted (escaped)
a0000000000000002\tfailed (escaped)
a0000000000000003\tunknown (escaped)
a0000000000000004\tcompleted (escaped)
a0000000000000005\tunknown (escaped)
```

## Notifications delivered as queued commands

From 2.1.31x a completion can arrive as a `queued_command` attachment (`commandMode` `task-notification`) instead of a
user entry. A variant of ALPHA whose L67 is such an attachment, with its own `<result>`:

```scrut
$ Q=$CC_TEST_TMP/queued && mkdir -p "$Q/projects" && cp -R "$P/-tmp-sessions-fixture-alpha" "$Q/projects/"
> jq -c 'if input_line_number == 67 then {parentUuid, isSidechain, type: "attachment", uuid, timestamp, sessionId, version, cwd, entrypoint,
>   attachment: {type: "queued_command", commandMode: "task-notification", origin, prompt: (.message.content | sub("<result>[^<]*</result>"; "<result>Notified result.</result>"))}} else . end' \
>   "$ALPHA.jsonl" > "$Q/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl"
> CLAUDE_CONFIG_DIR=$Q cc-sessions agents a7c3e9f | awk -F '\t' '$1 == "L60" { print $5 "\t" $10 }'
completed\tNotified result. (escaped)
```

## Call order, resumed runs and teammates

DELTA (2.1.220): rows run in call order, the workflow run of L2 with its agent right after it, before the agent called at
L4. The run's second call (L15) resumes it and adds no row; the run's result is that call's notification. The
in-process teammate (L6), whose spawn result names it only `reviewer@session-d5e7f9a1`, is its `subagents/` file with
that meta `name` and `teamName`. The split-pane teammate (L8) is the session in the same project directory whose
entries carry its `teamName` and `agentName`; its id is that session's id. The interrupted call (L10) is `killed`.
The reviewer's own agent, whose call is in the reviewer's transcript, is listed without a call.

```scrut
$ cc-sessions agents d5e7 | cc_test_rel
dir\t<root>/projects/-tmp-sessions-fixture-delta/d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13 (escaped)
L2\tworkflow\twf_8c2e4a6b-1d3\taudit\tcompleted\tclaude-haiku-5-5\t33\tAudit the logs.\tsubagents/workflows/wf_8c2e4a6b-1d3\t{"errors":1} (escaped)
L2\tworkflow-agent\ta6d8f0b2c4e6a8b0d\tworkflow-subagent\tcompleted\tclaude-haiku-5-5\t33\tcount\tsubagents/workflows/wf_8c2e4a6b-1d3/agent-a6d8f0b2c4e6a8b0d.jsonl\tOne error: a timeout at 09:58. (escaped)
L4\tagent\ta1e3c5a7b9d1f3e5a\tExplore\tcompleted\tclaude-haiku-5-5\t86\tCheck the audit log\tsubagents/agent-a1e3c5a7b9d1f3e5a.jsonl\tThe audit log's last error is a timeout at 09:58. (escaped)
L6\tteammate\tareviewer-1a2b3c4d5e6f7a8b\treviewer\tcompleted\tclaude-haiku-5-5\t80\tReview the audit findings\tsubagents/agent-areviewer-1a2b3c4d5e6f7a8b.jsonl\tFix list: raise the audit timeout in config/audit.yml. (escaped)
L8\tteammate\tf3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\tgeneral-purpose\tcompleted\tclaude-opus-5-5\t105\tFix the timeout\t<root>/projects/-tmp-sessions-fixture-delta/f3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f.jsonl\tRaised the audit timeout to 30s; the check passes. (escaped)
L10\tagent\ta2b4d6f8a0c2e4a6b\tExplore\tkilled\tclaude-haiku-5-5\t28\tTrace the slow query\tsubagents/agent-a2b4d6f8a0c2e4a6b.jsonl\t- (escaped)
-\tagent\ta5c7e9a1b3c5d7e9f\tExplore\tcompleted\tclaude-haiku-5-5\t20\tLook up the timeout setting\tsubagents/agent-a5c7e9a1b3c5d7e9f.jsonl\tThe audit timeout is set in config/audit.yml. (escaped)
```

Because rows follow their handles, the `--since` that a cut names shows every row left out.

```scrut {output_stream: combined}
$ cc-sessions agents d5e7 --limit 4 2>&1 | cut -f 1-3 | cc_test_rel
dir\t<root>/projects/-tmp-sessions-fixture-delta/d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13 (escaped)
L2\tworkflow\twf_8c2e4a6b-1d3 (escaped)
L2\tworkflow-agent\ta6d8f0b2c4e6a8b0d (escaped)
L4\tagent\ta1e3c5a7b9d1f3e5a (escaped)
cc-sessions: output stopped at --limit 4 after 4 records; 4 more left out; continue with --since L6
```

```scrut
$ cc-sessions agents d5e7 | sort -u > all.txt; for n in 2 3 4 5 6; do
>   next=$(cc-sessions agents d5e7 --limit "$n" 2>&1 > page1.txt | grep -o -e '--since L[0-9]*$' | cut -d ' ' -f 2)
>   cc-sessions agents d5e7 --since "$next" > page2.txt; sort -u page1.txt page2.txt | cmp -s - all.txt || echo "lost rows after a cut at $n"
> done; echo checked
checked
```

## Older completions, resumed agents and interrupts

ECHO (2.0.65, flat layout): one user entry (L10) holds two `<agent-notification>` blocks, each keyed by `<agent-id>`; the
completion of L6 exists only as a `queue-operation` enqueue (L8). The agent of L11 is resumed at L13: one row, at its
first call, with the result of the last. That call reports 650 output tokens for the agent's final message, whose last
entry recorded 2, so the output is 40 + 3 + 650. The interrupted call (L15) is `killed`.

```scrut
$ cc-sessions agents e2c4 2>/dev/null | cc_test_rel
dir\t<root>/projects/-tmp-sessions-fixture-echo/e2c4a6b8-0d2f-4b4d-8e6f-1a3b5c7d9e0f (escaped)
L2\tflat\ta1d2e3f\tExplore\tcompleted\tclaude-haiku-4-5-20251001\t32\tExplore the schema inference code.\t<root>/projects/-tmp-sessions-fixture-echo/agent-a1d2e3f.jsonl\tSchema inference lives in lib/schema/infer.rb. (escaped)
L4\tflat\ta4b5c6d\tExplore\tcompleted\tclaude-haiku-4-5-20251001\t2\tExplore how state updates are written.\t<root>/projects/-tmp-sessions-fixture-echo/agent-a4b5c6d.jsonl\t- (escaped)
L6\tflat\ta7e8f9a\tExplore\tcompleted\tclaude-haiku-4-5-20251001\t1\tList the schema migrations.\t<root>/projects/-tmp-sessions-fixture-echo/agent-a7e8f9a.jsonl\tThree migrations: create_schemas, add_defaults and add_nullable. (escaped)
L11\tflat\ta0b1c2d\tgeneral-purpose\tcompleted\tclaude-haiku-4-5-20251001\t693\tSummarise the schema rules in five bullets.\t<root>/projects/-tmp-sessions-fixture-echo/agent-a0b1c2d.jsonl\tSix rules now: the five before, and nullable fields say so. (escaped)
L15\tflat\ta3c4d5e\tExplore\tkilled\tclaude-haiku-4-5-20251001\t1\tCheck that the fixtures match the schema.\t<root>/projects/-tmp-sessions-fixture-echo/agent-a3c4d5e.jsonl\t- (escaped)
```

## Output tokens that are lower bounds

Claude Code 2.0.50 through 2.1.56 often wrote a message's last entry before its output was counted. When a row shown
draws on messages from those versions, a notice says that their output tokens are lower bounds.

```scrut
$ cc-sessions agents e2c4 2>&1 >/dev/null; cc-sessions agents c4e6 2>&1 >/dev/null
cc-sessions: output tokens are lower bounds for messages written by Claude Code 2.0.65: versions 2.0.50 through 2.1.56 often did not record a message's final output count
cc-sessions: output tokens are lower bounds for messages written by Claude Code 2.0.76: versions 2.0.50 through 2.1.56 often did not record a message's final output count
```

```scrut
$ for s in a7c3e9f b2d4 d5e7; do cc-sessions agents "$s" 2>&1 >/dev/null | grep -c 'lower bounds'; done | paste -s -d ' ' -
0 0 0
```

## Widths and --full

The result is cut to 150 characters and the label to 80; `--full` keeps both whole.

```scrut
$ CLAUDE_CONFIG_DIR=$C cc-sessions agents "$S.jsonl" | awk -F '\t' '$3 ~ /^adoes/ { print $10 } $3 ~ /^aprompt/ { print $8 }' | jq -R 'length'
> CLAUDE_CONFIG_DIR=$C cc-sessions agents "$S.jsonl" --full | awk -F '\t' '$3 ~ /^adoes/ { print $10 } $3 ~ /^aprompt/ { print $8 }' | jq -R 'length'
150
80
200
84
```

## --since and --until

A handle bound selects rows by their call's line; rows without a call count as after the last line. The `dir` record
always comes first.

```scrut
$ cc-sessions agents a7c3e9f --until L62 | cut -f 1-3 | cc_test_rel
> cc-sessions agents a7c3e9f --since L64 | cut -f 1-3 | paste -s -d ' ' - | cc_test_rel
dir\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e (escaped)
L60\tagent\ta7c3e9b2d4f6a8c01 (escaped)
L62\tteammate\taplanner-5e1f0a2b3c4d5e6f (escaped)
dir\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e L64\tworkflow\twf_5d1c9a7e-3b2 L64\tworkflow-agent\ta0f1e2d3c4b5a6978 L64\tworkflow-agent\ta9e8d7c6b5a4f3e21 L72\tfork\tadoes-the-lexer-0a1b2c3d4e5f6a7b -\tinternal\ta3d1e5f7a9b0c2d4e -\tinternal\tacompact-3f9a1c -\tinternal\taprompt_suggestion-8d2e4b (escaped)
```

A time bound compares the call's time (L60 10:19:54, L62 10:19:58, L64 10:20:02, L72 10:26:42), or the agent's first
time when no call links it (`acompact` 10:00:53, `a3d1…` 10:29:03, `aprompt_suggestion` 10:31:03).

```scrut
$ cc-sessions agents a7c3e9f --since 2026-10-30T10:20:00Z --until 2026-10-30T10:30:00Z | cut -f 1,3 | tail -n +2 | paste -s -d ' ' -
> cc-sessions agents a7c3e9f --until 2026-10-30T10:19:54Z | cut -f 1,3 | tail -n +2 | paste -s -d ' ' -
L64\twf_5d1c9a7e-3b2 L64\ta0f1e2d3c4b5a6978 L64\ta9e8d7c6b5a4f3e21 L72\tadoes-the-lexer-0a1b2c3d4e5f6a7b -\ta3d1e5f7a9b0c2d4e (escaped)
L60\ta7c3e9b2d4f6a8c01 -\tacompact-3f9a1c (escaped)
```

Ages count back from now; later options override earlier ones.

```scrut
$ cc-sessions agents a7c3e9f --until 1s | wc -l | tr -d ' '; cc-sessions agents a7c3e9f --since L80 --since L72 | wc -l | tr -d ' '
10
5
```

## Output budget

The `dir` record has no handle, so a cut after it continues with `--since`, which keeps `dir` first.

```scrut {output_stream: combined}
$ cc-sessions agents a7c3e9f --limit 3 2>&1 | cut -f 1-3 | cc_test_rel
dir\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e (escaped)
L60\tagent\ta7c3e9b2d4f6a8c01 (escaped)
L62\tteammate\taplanner-5e1f0a2b3c4d5e6f (escaped)
cc-sessions: output stopped at --limit 3 after 3 records; 7 more left out; continue with --since L64
```

A workflow run's rows all carry its call's handle, so a page that cannot hold them continues with a larger budget from
that handle, not with a `--since` that would print the same page again.

```scrut {output_stream: combined}
$ cc-sessions agents a7c3e9f --since L64 --limit 3 2>&1 | cut -f 1-3 | cc_test_rel
> n=$(($(cc-sessions agents a7c3e9f --since L64 | head -n 2 | wc -c) + 50))
> cc-sessions agents a7c3e9f --since L64 --max-chars $n 2>&1 >/dev/null | sed "s/ $n / N /"
dir\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e (escaped)
L64\tworkflow\twf_5d1c9a7e-3b2 (escaped)
L64\tworkflow-agent\ta0f1e2d3c4b5a6978 (escaped)
cc-sessions: output stopped at --limit 3 after 3 records; 5 more left out; continue with a larger --limit (0 removes the limit) and --since L64
cc-sessions: output stopped at --max-chars N after 2 records; 6 more left out; continue with a larger --max-chars (0 removes the limit) and --since L64
```

A cut among the rows without a call continues with a larger budget.

```scrut
$ cc-sessions agents a7c3e9f --limit 8 2>&1 >/dev/null
cc-sessions: output stopped at --limit 8 after 8 records; 2 more left out; continue with a larger --limit (0 removes the limit)
```

## Empty answers

Sessions without agents, and agent transcripts that start none, answer with nothing on stdout and a notice.

```scrut
$ out=$(cc-sessions agents c7d9 2> err.txt); echo "exit $? stdout ${#out}"; cc_test_rel < err.txt
> cc-sessions agents a7c3e9b 2>&1 >/dev/null | cc_test_rel
> cc-sessions agents a7c3e9f --since L73 --until L80 2>&1 >/dev/null | cc_test_rel
exit 0 stdout 0
cc-sessions: no sub-agent or workflow calls in <root>/projects/-tmp-sessions-fixture-gamma/c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f.jsonl and no agent files under <root>/projects/-tmp-sessions-fixture-gamma/c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f
cc-sessions: no sub-agent or workflow calls in <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-a7c3e9b2d4f6a8c01.jsonl
cc-sessions: no sub-agent or workflow calls in <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl and no agent files under <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e with --since L73 --until L80
```

The SDK session, the relocated session and UNDER start no agents either.

```scrut
$ for s in d1f3 e5a7 f6b8; do cc-sessions agents "$s" 2>/dev/null | wc -l | tr -d ' '; done | paste -s -d ' ' -
0 0 0
```

## Usage errors

```scrut {output_stream: stderr}
$ cc-sessions agents
cc-sessions: agents needs a <session>; pass a session id or a prefix of 4 or more characters, a path, wf_<run-id> or current; see cc-sessions agents --help
[2]
```

```scrut {output_stream: stderr}
$ cc-sessions agents a7c3e9f b2d4
cc-sessions: agents takes one <session>, got 2; run it once per session; see cc-sessions agents --help
[2]
```

```scrut {output_stream: stderr}
$ cc-sessions agents a7c3e9f --agents
cc-sessions: unknown option "--agents" for agents; valid options: --since, --until, --full; to pass text that starts with -, put it after --; see cc-sessions agents --help
[2]
```

```scrut {output_stream: stderr}
$ cc-sessions agents a7c3e9f --until
cc-sessions: --until needs a value; pass one after it; see cc-sessions agents --help
[2]
```

```scrut {output_stream: stderr}
$ cc-sessions agents a7c3e9f --since soon
cc-sessions: --since takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got "soon"; pass one of those forms; see cc-sessions agents --help
[2]
```

```scrut
$ cc-sessions agents e0a0 2>/dev/null; echo "exit $?"; cc-sessions agents a7c3 2>/dev/null; echo "exit $?"
exit 2
exit 2
```

`--` ends options.

```scrut
$ cc-sessions agents -- a7c3e9f | wc -l | tr -d ' '; cc-sessions agents -- --full 2>/dev/null; echo "exit $?"
10
exit 2
```

## jq 1.7

```scrut
$ mkdir -p "$CC_TEST_TMP/jq17" && ln -sf /usr/bin/jq "$CC_TEST_TMP/jq17/jq"
> for s in a7c3e9f b9e1 c4e6 d5e7 e2c4; do cc-sessions agents "$s" > now.txt 2>&1 && PATH="$CC_TEST_TMP/jq17:$PATH" cc-sessions agents "$s" 2>&1 | cmp - now.txt && echo same; done
same
same
same
same
same
```
