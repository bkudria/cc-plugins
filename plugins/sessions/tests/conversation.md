---
prepend: [setup.md]
---

# cc-sessions conversation

Values come from `fixtures/FACTS.md`.

## Help

The index lists conversation with its synopsis line.

```scrut
$ cc-sessions --help | grep '^  conversation '
  conversation <session> [--around L<n>[:N]] [--thinking] [--events] [--tokens] [--agents]  what was said, turn by turn
```

Help names every option and each field in order, stays short, and never reads transcripts.

```scrut
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions conversation --help > help.txt; echo "exit $?"
> sed -n '/^Fields/,/^$/p' help.txt | awk '/^  [a-z]/ { print $1 }' | paste -s -d ' ' -
> grep -A1 '^With --tokens' help.txt | tail -n 1 | awk '{ print $1, $2, $3, $4, $5 }'
> for o in --thinking --events --tokens --around --agents --since --until --full; do grep -q -e "^  $o" help.txt || echo "missing $o"; done
> [ "$(wc -l < help.txt)" -le 40 ] && echo short
exit 0
handle src time role text input
input cache_read cache_creation output context
short
```

```scrut
$ grep -E -c 'Empty answer|Exit status|600 characters|default 10' help.txt
4
```

`-h` prints the same help, and the synopsis comes from `--synopsis`.

```scrut
$ cc-sessions conversation -h | cmp - help.txt && "$CC_TEST_ROOT/libexec/conversation" --synopsis | cut -c1-23
conversation <session> 
```

## Records

Each record is a handle, src, the time of its entry, a role and a text.

```scrut
$ cc-sessions conversation a7c3e9f | head -n 3
L4\tmain\t2026-10-30T10:00:04Z\tprompt\tCheck the CONTENT_TERM_ALPHA parser, then please run "make test" now. (escaped)
L11\tmain\t2026-10-30T10:00:11Z\tassistant\tSearching the source first. (escaped)
L12\tmain\t2026-10-30T10:00:13Z\ttool\tBash rg -n CONTENT_TERM_ALPHA src → ok 96 (escaped)
```

The whole of ALPHA: human input with its kind as the role, one assistant record per API message (its text blocks merged, at its first text line), one tool record per call, and markers for injected content.

```scrut
$ cc-sessions conversation a7c3e9f | cut -f1,4,5
L4\tprompt\tCheck the CONTENT_TERM_ALPHA parser, then please run "make test" now. (escaped)
L11\tassistant\tSearching the source first. (escaped)
L12\ttool\tBash rg -n CONTENT_TERM_ALPHA src → ok 96 (escaped)
L14\tassistant\tCONTENT_TERM_ALPHA is defined in src/parser.c. The rules live in lib.jq; running the tests next. (escaped)
L15\ttool\tBash make test → persisted 3402B (escaped)
L17\ttool\tmcp__demo__fetch {"url":"https://example.invalid/parser-spec"} → ok 49 (escaped)
L19\tassistant\tTests pass. Skipping --force-push-now; it needs your approval. (escaped)
L20?injected?[injected 217 chars: <local-command-caveat>The command below was run directly in…] (glob)
L21\tslash\t/effort high (escaped)
L22\toutput\tSet effort level to high (this session only) (escaped)
L23\tslash\t/demo:review parser changes (escaped)
L24\tinjected\t[skill body: demo:review] (escaped)
L25\tassistant\tReviewing the parser changes. (escaped)
L26\ttool\tAskUserQuestion Which parser mode should the review target? [Strict (Recommended) | Lenient] → ok 153 (escaped)
L27\tanswer\tWhich parser mode should the review target? → Strict (Recommended) (escaped)
L28\ttool\tEdit /tmp/sessions-fixture/alpha/src/parser.c [12→11 chars] → denied 231 (escaped)
L29\tdenied\tKeep lenient mode until the release. (escaped)
L30\ttool\tBash cat missing.txt → error 55 (escaped)
L32\ttool\tSkill nope → error 52 (escaped)
L34\tassistant\tThat skill does not exist; continuing without it. (escaped)
L37\tsummary\t[compaction summary 212 chars] (escaped)
L38?injected?[injected 217 chars: <local-command-caveat>The command below was run directly in…] (glob)
L39\tslash\t/compact (escaped)
L40\toutput\tCompacted (ctrl+o to see full summary) (escaped)
L44\tprompt\tThe output looks wrong here: [Image #1]\\n[image] (escaped)
L45\ttool\tSkill alpha-helper → ok 29 (escaped)
L47\tinjected\t[skill body: alpha-helper] (escaped)
L48\ttool\tSkill alpha-helper → ok 29 (escaped)
L50\tinjected\t[skill re-invoked: alpha-helper] (escaped)
L51\ttool\tExitPlanMode {"plan":"# Plan\\\\n\\\\n1. Switch the parser to strict mode behind a flag."} → ok 319 (escaped)
L52\tplan\tapproved: # Plan\\n\\n1. Switch the parser to strict mode behind a flag. (escaped)
L54\tassistant\tStarting the strict-mode change. (escaped)
L55\tinterrupt\t[Request interrupted by user] (escaped)
L57\tbash\tgit status (escaped)
L58\toutput\tOn branch main\\nnothing to commit, working tree clean (escaped)
L59\tprompt\tSpin up helpers for the tokenizer tests and the rollout. (escaped)
L60\ttool\tAgent Explore "Survey tokenizer tests" [bg] → ok 397 (escaped)
L62\ttool\tAgent general-purpose "Plan the strict-mode rollout" [name=planner] → ok 180 (escaped)
L64\ttool\tWorkflow fixture-scan {"target":"src"} → ok 522 (escaped)
L66\tpeer\tAnother Claude session sent a message:\\n<teammate-message teammate_id="planner" color="blue">\\nRollout plan drafted: flag first, default later.\\n</teammate-message> (escaped)
L67\tnotification\t[task notification: Agent "Survey tokenizer tests" completed] (escaped)
L68\tnotification\t[task notification: Workflow "fixture-scan" completed] (escaped)
L69\tqueued\tAlso check the lexer. (escaped)
L70\tassistant\tBoth helpers finished; the lexer check is next. (escaped)
L71\tslash\t/btw does the lexer share the parser's token table? (escaped)
L73\tslash\t/doctor (escaped)
L74\tinjected\t[skill body: doctor (bundled)] (escaped)
L75\tassistant\tThe installation looks healthy. (escaped)
L80\tprompt\tThanks, wrap up. (escaped)
L81\tassistant\tDone. (escaped)
```

The plain `/compact` at L35 is one input with the `/compact` at L39; the `<synthetic>` message at L56 is not the assistant speaking.

```scrut
$ cc-sessions conversation a7c3e9f | cut -f1 | grep -c -x -e L35 -e L56
0
[1]
```

A completion delivered as a `queued_command` attachment (2.1.31x) is a notification marker like the user entry it
stands for. Here ALPHA's L67 is rewritten into one.

```scrut
$ jq -c 'if input_line_number == 67 then {parentUuid, type: "attachment", uuid, timestamp, sessionId, attachment: {type: "queued_command", commandMode: "task-notification", origin, prompt: .message.content}} else . end' "$ALPHA.jsonl" > "$CC_TEST_TMP/queued.jsonl"
> cc-sessions conversation "$CC_TEST_TMP/queued.jsonl" | awk -F '\t' '$1 == "L67"' | cut -f1,4,5
L67\tnotification\t[task notification: Agent "Survey tokenizer tests" completed] (escaped)
```

A harness command and its bundled body are markers too; an empty thinking block adds nothing.

```scrut
$ cc-sessions conversation c7d9 | cut -f1,4,5
L1\tprompt\tRebuild the gamma index with full effort, then check the table. (escaped)
L4\tinjected\t[harness command: fixture-focus] (escaped)
L5\tinjected\t[skill body: fixture-focus (bundled)] (escaped)
L6\tassistant\tReading the gamma table first. (escaped)
L7\ttool\tRead /tmp/sessions-fixture/gamma/data/table.txt → ok 30000 (escaped)
L10\ttool\tBash make index [bg] → ok 229 (escaped)
L12\tassistant\tThe index is rebuilding in the background. (escaped)
L17\tnotification\t[task notification: Background command "Rebuild the gamma index" completed (exit code 0)] (escaped)
L18\tassistant\tThe index rebuild finished with exit code 0. (escaped)
L19\tprompt\tI changed notes.md by hand; compare it with the table. (escaped)
L20\ttool\tBash git diff --stat → ok 63 (escaped)
L24\tassistant\tOnly the notes header changed; the table still matches it. (escaped)
```

An orphan skill body is a marker named from its directory.

```scrut
$ cc-sessions conversation f6b8 | cut -f1,4,5
L1\tinjected\t[skill body: orphan-skill] (escaped)
L2\tprompt\tList the files with spaces in their names. (escaped)
L3\tassistant\tTwo files have spaces in their names. (escaped)
```

An SDK prompt has the role `sdk`.

```scrut
$ cc-sessions conversation d1f3 | cut -f1,4,5
L3\tsdk\tRename the report generator skill to report-builder. (escaped)
L5\tassistant\tRenamed the skill to report-builder. (escaped)
```

FOXTROT: slash-command output stored as a `system` entry is output like any other, an ExitPlanMode error is a tool call
and no plan decision, and a tool result's size counts its text, not its images.

```scrut
$ cc-sessions conversation f0d2 --since L4 --until L13 | cut -f1,4,5
> cc-sessions conversation f0d2 --since L32 --until L37 | cut -f1,4,5
L4\tassistant\tReloading the skills first. (escaped)
L5?injected?[injected 217 chars: <local-command-caveat>The command below was run directly in…] (glob)
L6\tslash\t/reload-skills (escaped)
L7\toutput\tReloaded skills: 12 skills available (escaped)
L8\tslash\t/model opus (escaped)
L9\toutput\tSet model to opus (escaped)
L10\ttool\tExitPlanMode {"plan":"# Plan\\\\n\\\\n1. Sort the fixtures by era."} → error 106 (escaped)
L12\ttool\tExitPlanMode {"plan":"# Plan\\\\n\\\\n1. Sort the fixtures by era."} → ok 57 (escaped)
L13\tplan\tapproved: # Plan\\n\\n1. Sort the fixtures by era. (escaped)
L32\ttool\tBash ./progress.sh → ok 22 (escaped)
L34\ttool\tRead /tmp/sessions-fixture/foxtrot/screen.png → ok 0 (escaped)
L36\ttool\tmcp__demo__click {"x":10,"y":20} → ok 19 (escaped)
```

Split messages merge into one record, re-appended duplicates are read once, and the corrupt line is skipped with a notice.

```scrut
$ cc-sessions conversation b2d4 2>/dev/null | cut -f1,3-5
L2\t2026-07-15T09:00:00Z\tprompt\tSummarise the beta build failures. (escaped)
L4\t2026-07-15T09:00:04Z\tassistant\tReading the build log. (escaped)
L5\t2026-07-15T09:00:05Z\ttool\tBash cat build.log → ok 62 (escaped)
L7\t2026-07-15T09:00:02Z\tassistant\tTwo failures: a missing header and an undefined symbol. (escaped)
L8\t2026-07-15T09:00:10Z\tqueued\tAlso list the warnings. (escaped)
L9\t2026-07-15T09:01:03Z\tprompt\tFind where the header should live. (escaped)
L10\t2026-07-15T09:01:05Z\tassistant\tDelegating the header search. (escaped)
L11\t2026-07-15T09:01:07Z\ttool\tAgent Explore "Check header paths" → ok 134 (escaped)
L13\t2026-07-15T09:01:30Z\tassistant\tThe header belongs in include/beta.h. (escaped)
L21\t2026-07-15T09:05:03Z\tprompt\tList the warnings too. (escaped)
L22\t2026-07-15T09:05:05Z\tassistant\tNo warnings were reported. (escaped)
```

```scrut {output_stream: stderr}
$ cc-sessions conversation b2d4 > /dev/null 2> err.txt; cc_test_rel < err.txt >&2
cc-sessions: skipped 1 unparseable line in <root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e.jsonl: L20
```

An agent transcript starts with its delegation prompt as `from-parent`, and its records carry its id as src.

```scrut
$ cc-sessions conversation a4c6e8f0 | cut -f1,2,4,5
L1\ta4c6e8f0a2b4c6d8e\tfrom-parent\tFind where the missing beta.h header should live. (escaped)
L3\ta4c6e8f0a2b4c6d8e\ttool\tGlob **/beta.h → ok 14 (escaped)
L5\ta4c6e8f0a2b4c6d8e\tassistant\tThe header belongs in include/beta.h. (escaped)
```

An internal agent stays reachable as an explicit operand.

```scrut
$ cc-sessions conversation acompact | cut -f1,4
L1\tfrom-parent (escaped)
L2\tassistant (escaped)
```

## Thinking, events and tokens

`--thinking` adds non-empty thinking blocks, before the text of their message.

```scrut
$ cc-sessions conversation a7c3e9f --thinking | cut -f1,4,5 | sed -n 1,3p
L4\tprompt\tCheck the CONTENT_TERM_ALPHA parser, then please run "make test" now. (escaped)
L10\tthinking\tThe CONTENT_TERM_ALPHA parser lives under src; search for it first. (escaped)
L11\tassistant\tSearching the source first. (escaped)
```

```scrut
$ cc-sessions conversation c7d9 --thinking | grep -c thinking
0
[1]
```

`--events` adds hooks, state changes, the model, compactions, synthetic messages, harness notes and recaps.

```scrut
$ cc-sessions conversation a7c3e9f --events | grep "$(printf '\tevent\t')" | cut -f1,3,5
L1\t-\tpermission mode: default (escaped)
L2\t-\tmode: normal (escaped)
L3\t2026-10-30T10:00:01Z\thook SessionStart:startup success: fixture hook ready (escaped)
L10\t2026-10-30T10:00:09Z\tmodel: claude-opus-5-5 (escaped)
L36\t2026-10-30T10:01:12Z\tcompaction manual: 21760 → 9120 tokens (escaped)
L56\t2026-10-30T10:01:57Z\tsynthetic: No response requested. (escaped)
L72\t2026-10-30T10:26:42Z\tinfo: Started in the background: does the lexer share the parser's token table? (escaped)
L76\t2026-10-30T10:28:39Z\trecap: While you were away: the parser review finished and strict mode is planned behind a flag. (escaped)
```

The effort switch and a cwd change are events.

```scrut
$ cc-sessions conversation c7d9 --events | grep "$(printf '\tevent\t')" | cut -f1,5 && cc-sessions conversation e5a7 --events | grep "$(printf '\tevent\t')" | cut -f1,5
L3\tultra effort on (escaped)
L6\tmodel: claude-opus-5-5 (escaped)
L3\tcwd: /tmp/sessions-fixture/elsewhere (escaped)
L4\tmodel: claude-opus-5-5 (escaped)
```

`events.jsonl` holds the event kinds the fixtures lack: turn durations, a stop-hook summary, a model switch, API errors, a microcompaction, a hook error, a scheduled task, a model fallback, and repeated state markers.

```scrut
$ printf '%s\n' '{"type":"permission-mode","permissionMode":"default"}' \
>   '{"type":"user","uuid":"u1","timestamp":"2026-01-01T00:00:00.000Z","message":{"role":"user","content":"Go."}}' \
>   '{"type":"assistant","uuid":"a1","timestamp":"2026-01-01T00:00:01.000Z","message":{"id":"m1","model":"claude-opus-5-5","content":[{"type":"text","text":"One."}],"usage":{"input_tokens":1,"output_tokens":2}}}' \
>   '{"type":"permission-mode","permissionMode":"default"}' '{"type":"permission-mode","permissionMode":"plan"}' \
>   '{"type":"system","subtype":"turn_duration","uuid":"s1","timestamp":"2026-01-01T00:00:02.000Z","durationMs":148270,"messageCount":36}' \
>   '{"type":"system","subtype":"stop_hook_summary","uuid":"s2","timestamp":"2026-01-01T00:00:03.000Z","hookCount":2,"hookErrors":["boom"],"preventedContinuation":true,"stopReason":"tests failing"}' \
>   '{"type":"assistant","uuid":"a2","timestamp":"2026-01-01T00:00:04.000Z","message":{"id":"m2","model":"claude-haiku-5-5","content":[{"type":"text","text":"Two."}],"usage":{"input_tokens":1,"output_tokens":2}}}' \
>   '{"type":"assistant","uuid":"a3","timestamp":"2026-01-01T00:00:05.000Z","isApiErrorMessage":true,"apiErrorStatus":429,"message":{"id":"m3","model":"<synthetic>","content":[{"type":"text","text":"API Error: rate limited"}]}}' \
>   '{"type":"system","subtype":"api_error","uuid":"s3","timestamp":"2026-01-01T00:00:06.000Z","error":{"status":529,"error":"overloaded"},"retryAttempt":1}' \
>   '{"type":"system","subtype":"microcompact_boundary","uuid":"s4","timestamp":"2026-01-01T00:00:07.000Z","microcompactMetadata":{"trigger":"auto","preTokens":90000,"tokensSaved":12000}}' \
>   '{"type":"attachment","uuid":"t1","timestamp":"2026-01-01T00:00:08.000Z","attachment":{"type":"hook_non_blocking_error","hookName":"PostToolUse:Edit","hookEvent":"PostToolUse","stdout":"","stderr":"lint failed\nmore","exitCode":1}}' \
>   '{"type":"system","subtype":"scheduled_task_fire","uuid":"s5","timestamp":"2026-01-01T00:00:09.000Z","content":"Running scheduled task (every 10m)"}' \
>   '{"type":"system","subtype":"model_consent_fallback","uuid":"s6","timestamp":"2026-01-01T00:00:10.000Z","originalModel":"claude-opus-5-5","fallbackModel":"claude-sonnet-5"}' \
>   '{"type":"mode","mode":"normal"}' '{"type":"attachment","uuid":"t2","timestamp":"2026-01-01T00:00:11.000Z","attachment":{"type":"ultra_effort_exit"}}' \
>   '{"type":"system","subtype":"agents_killed","uuid":"s7","timestamp":"2026-01-01T00:00:12.000Z"}' \
>   '{"type":"assistant","uuid":"a4","timestamp":"2026-01-01T00:00:13.000Z","message":{"id":"m4","model":"claude-haiku-5-5","content":[{"type":"text","text":"Three."}],"usage":{"input_tokens":1,"output_tokens":2}}}' > "$CC_TEST_TMP/events.jsonl"
> cc-sessions conversation "$CC_TEST_TMP/events.jsonl" --events | cut -f1,4,5
L1\tevent\tpermission mode: default (escaped)
L2\tprompt\tGo. (escaped)
L3\tevent\tmodel: claude-opus-5-5 (escaped)
L3\tassistant\tOne. (escaped)
L5\tevent\tpermission mode: plan (escaped)
L6\tevent\tturn took 148.3s, 36 messages (escaped)
L7\tevent\tstop hooks: 2 ran, 1 error, stopped: tests failing (escaped)
L8\tevent\tmodel: claude-haiku-5-5 (escaped)
L8\tassistant\tTwo. (escaped)
L9\tevent\tapi error 429: API Error: rate limited (escaped)
L10\tevent\tapi error 529: {"status":529,"error":"overloaded"} (escaped)
L11\tevent\tmicrocompaction auto: 90000 tokens, 12000 saved (escaped)
L12\tevent\thook PostToolUse:Edit non_blocking_error: lint failed (escaped)
L13\tevent\tscheduled task: Running scheduled task (every 10m) (escaped)
L14\tevent\tmodel fallback: claude-opus-5-5 → claude-sonnet-5 (escaped)
L15\tevent\tmode: normal (escaped)
L16\tevent\tultra effort off (escaped)
L17\tevent\tagents killed (escaped)
L18\tassistant\tThree. (escaped)
```

Without `--events` none of them show, and an API error is never an assistant record.

```scrut
$ cc-sessions conversation "$CC_TEST_TMP/events.jsonl" | cut -f1,4,5
L2\tprompt\tGo. (escaped)
L3\tassistant\tOne. (escaped)
L8\tassistant\tTwo. (escaped)
L18\tassistant\tThree. (escaped)
```

`--tokens` adds input, cache_read, cache_creation, output and context to assistant records; a message with no text then gets an assistant record too.

```scrut
$ cc-sessions conversation a7c3e9f --tokens | grep "$(printf '\tassistant\t')" | cut -f1,5-10
L11\tSearching the source first.\t3\t12000\t5200\t180\t17203 (escaped)
L14\tCONTENT_TERM_ALPHA is defined in src/parser.c. The rules live in lib.jq; running the tests next.\t1\t17200\t900\t240\t18101 (escaped)
L19\tTests pass. Skipping --force-push-now; it needs your approval.\t1\t18100\t1200\t60\t19301 (escaped)
L25\tReviewing the parser changes.\t2\t19300\t1500\t150\t20802 (escaped)
L28\t-\t1\t20800\t300\t90\t21101 (escaped)
L30\t-\t1\t21100\t250\t40\t21351 (escaped)
L32\t-\t1\t21350\t200\t30\t21551 (escaped)
L34\tThat skill does not exist; continuing without it.\t1\t21550\t180\t25\t21731 (escaped)
L45\t-\t3\t4000\t7000\t35\t11003 (escaped)
L48\t-\t1\t11000\t2600\t30\t13601 (escaped)
L51\t-\t1\t13600\t400\t120\t14001 (escaped)
L54\tStarting the strict-mode change.\t1\t14000\t500\t12\t14501 (escaped)
L60\t-\t2\t14500\t800\t400\t15302 (escaped)
L70\tBoth helpers finished; the lexer check is next.\t1\t15300\t1100\t50\t16401 (escaped)
L75\tThe installation looks healthy.\t1\t16400\t600\t20\t17001 (escaped)
L81\tDone.\t1\t17000\t200\t5\t17201 (escaped)
```

The token fields of the assistant records add up to the session's totals; other records carry `-`.

```scrut
$ cc-sessions conversation a7c3e9f --tokens | awk -F'\t' '$4 == "assistant" { i += $6; r += $7; c += $8; o += $9 } $4 != "assistant" && $6 != "-" { bad++ } END { print i, c, r, o, bad + 0 }'
22 22930 257200 1487 0
```

Before 2.1.300 the last entry of a split message carries its usage.

```scrut
$ cc-sessions conversation b2d4 --tokens 2>/dev/null | grep "$(printf '\tassistant\t')" | cut -f1,6-10
L4\t4\t9000\t3000\t1100\t12004 (escaped)
L7\t1\t12000\t200\t45\t12201 (escaped)
L10\t2\t12300\t400\t80\t12702 (escaped)
L13\t1\t12900\t300\t30\t13201 (escaped)
L22\t1\t13200\t150\t12\t13351 (escaped)
```

Claude Code 2.0.50 through 2.1.56 often wrote a message's last entry before its output was counted, so with `--tokens` a
notice says when the output counts shown come from those versions (FLAT is 2.0.76). Without `--tokens`, without an
assistant record shown, or for other versions, there is no notice.

```scrut {output_stream: stderr}
$ cc-sessions conversation c4e6 --tokens > /dev/null
> cc-sessions conversation c4e6 > /dev/null; cc-sessions conversation c4e6 --tokens --until L2 > /dev/null
> cc-sessions conversation a7c3e9f --tokens > /dev/null
cc-sessions: output tokens are lower bounds for messages written by Claude Code 2.0.76: versions 2.0.50 through 2.1.56 often did not record a message's final output count
```

## Around, since and until

`--around L<n>:N` shows N records each side of the record at L<n>.

```scrut
$ cc-sessions conversation a7c3e9f --around L27:2 | cut -f1,4
L25\tassistant (escaped)
L26\ttool (escaped)
L27\tanswer (escaped)
L28\ttool (escaped)
L29\tdenied (escaped)
```

A handle with no record of its own, such as a tool result, centres on the record before it.

```scrut
$ cc-sessions conversation a7c3e9f --around L13:1 | cut -f1 | paste -s -d ' ' -
L11 L12 L14
```

The default is 10 records each side.

```scrut
$ cc-sessions conversation a7c3e9f --around L4 | wc -l | tr -d ' ' && cc-sessions conversation a7c3e9f --around L40 | wc -l | tr -d ' '
11
21
```

A handle past the end of the file, and a value that is not a handle, are usage errors.

```scrut {output_stream: stderr}
$ cc-sessions conversation a7c3e9f --around L999 2>&1 | cc_test_rel >&2; cc-sessions conversation a7c3e9f --around 27; echo "exit $?" >&2
cc-sessions: --around L999 is past the end of <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl (83 lines); pass a handle of that file; see cc-sessions conversation --help
cc-sessions: --around needs L<line> or L<line>:<count>, got "27"; pass a handle from another command, such as --around L120:5; see cc-sessions conversation --help
exit 2
```

```scrut
$ cc-sessions conversation a7c3e9f --around L999 > /dev/null 2>&1; echo "exit $?"
exit 2
```

`--since` and `--until` take handles, inclusive.

```scrut
$ cc-sessions conversation a7c3e9f --since L50 --until L55 | cut -f1,4 | paste -s -d ' ' -
L50\tinjected L51\ttool L52\tplan L54\tassistant L55\tinterrupt (escaped)
```

A time bound compares each record's own time, so a record whose timestamp runs backwards falls outside it.

```scrut
$ cc-sessions conversation b2d4 --since 2026-07-15T09:00:04Z --until 2026-07-15T09:00:10Z 2>/dev/null | cut -f1 | paste -s -d ' ' -
L4 L5 L8
```

An age works too.

```scrut
$ cc-sessions conversation a7c3e9f --until 1s | wc -l | tr -d ' '
50
```

## Agents

`--agents` merges the sub-agents' and workflow agents' records in by time; internal agents are left out.

```scrut
$ cc-sessions conversation a7c3e9f --agents | sed -n '/^L64\t/,/^L67\t/p' | cut -f1,2,4
L64\tmain\ttool (escaped)
L1\ta7c3e9b2d4f6a8c01\tfrom-parent (escaped)
L2\ta7c3e9b2d4f6a8c01\ttool (escaped)
L4\ta7c3e9b2d4f6a8c01\tassistant (escaped)
L1\taplanner-5e1f0a2b3c4d5e6f\tfrom-parent (escaped)
L2\taplanner-5e1f0a2b3c4d5e6f\tassistant (escaped)
L1\ta0f1e2d3c4b5a6978\tfrom-parent (escaped)
L2\ta0f1e2d3c4b5a6978\ttool (escaped)
L4\ta0f1e2d3c4b5a6978\tassistant (escaped)
L1\ta9e8d7c6b5a4f3e21\tfrom-parent (escaped)
L3\ta9e8d7c6b5a4f3e21\ttool (escaped)
L66\tmain\tpeer (escaped)
L67\tmain\tnotification (escaped)
```

```scrut
$ cc-sessions conversation a7c3e9f --agents | cut -f2 | sort | uniq -c | sed 's/^ *//'
3 a0f1e2d3c4b5a6978
3 a7c3e9b2d4f6a8c01
2 a9e8d7c6b5a4f3e21
2 adoes-the-lexer-0a1b2c3d4e5f6a7b
2 aplanner-5e1f0a2b3c4d5e6f
50 main
```

With `--agents`, `--around` takes the handle in the session's own transcript and counts the merged records.

```scrut
$ cc-sessions conversation a7c3e9f --agents --around L66:1 | cut -f1,2,4
L3\ta9e8d7c6b5a4f3e21\ttool (escaped)
L66\tmain\tpeer (escaped)
L67\tmain\tnotification (escaped)
```

A resumed session's agent that stayed with the original session is found through its call.

```scrut
$ cc-sessions conversation b9e1 --agents | cut -f1,2,4
L1\tmain\tprompt (escaped)
L2\tmain\tassistant (escaped)
L3\tmain\ttool (escaped)
L1\ta4c6e8f0a2b4c6d8e\tfrom-parent (escaped)
L3\ta4c6e8f0a2b4c6d8e\ttool (escaped)
L5\ta4c6e8f0a2b4c6d8e\tassistant (escaped)
L5\tmain\tassistant (escaped)
L6\tmain\tprompt (escaped)
L7\tmain\tassistant (escaped)
```

Flat-layout agents beside the session join it; the Warmup agent is internal.

```scrut
$ cc-sessions conversation c4e6 --agents | cut -f1,2,4,5
L2\tmain\tprompt\tFind the flat config loader. (escaped)
L3\tmain\tassistant\tDelegating the search. (escaped)
L4\tmain\ttool\tTask Explore "Locate config loader" → ok 102 (escaped)
L1\t5f6a7b8c\tfrom-parent\tLocate the config loader in the flat project. (escaped)
L2\t5f6a7b8c\tassistant\tThe loader is config/load.rb. (escaped)
L8\tmain\tassistant\tThe config loader is config/load.rb. (escaped)
```

A split-pane teammate runs as a session of its own; its records join under that session's id. The lead's messages to
it are `peer` records there.

```scrut
$ cc-sessions conversation d5e7 --agents | awk -F '\t' '$2 ~ /^f3a5/' | cut -f1,2,4
L2\tf3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\tpeer (escaped)
L3\tf3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\ttool (escaped)
L5\tf3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\tassistant (escaped)
```

## Widths

`wide.jsonl` holds a 500-character prompt, a 1000-character answer and a Bash call with a 300-character command.

```scrut
$ jq -n -c --arg p "$(printf 'p%.0s' $(seq 500))" --arg a "$(printf 'a%.0s' $(seq 1000))" --arg c "echo $(printf 'c%.0s' $(seq 295))" \
>   '{type: "user", uuid: "w1", timestamp: "2026-01-01T00:00:00.000Z", message: {role: "user", content: $p}},
>    {type: "assistant", uuid: "w2", timestamp: "2026-01-01T00:00:01.000Z", message: {id: "m1", model: "m", content: [{type: "text", text: $a}, {type: "tool_use", id: "t1", name: "Bash", input: {command: $c}}]}},
>    {type: "user", uuid: "w3", timestamp: "2026-01-01T00:00:02.000Z", message: {role: "user", content: [{type: "tool_result", tool_use_id: "t1", content: "done"}]}}' > "$CC_TEST_TMP/wide.jsonl"
> cc-sessions conversation "$CC_TEST_TMP/wide.jsonl" | cut -f4,5 | jq -R -r 'split("\t") | "\(.[0]) \(.[1] | length) \(.[1][-12:])"'
prompt 200 ppppppppppp…
assistant 600 aaaaaaaaaaa…
tool 200 cccc… → ok 4
```

`--full` keeps every text whole.

```scrut
$ cc-sessions conversation "$CC_TEST_TMP/wide.jsonl" --full | cut -f4,5 | jq -R -r 'split("\t") | "\(.[0]) \(.[1] | length)"'
prompt 500
assistant 1000
tool 312
```

## Empty answers

A session without records answers with nothing on stdout and a notice naming what was searched.

```scrut
$ cc-sessions conversation b5a7 2> err.txt; echo "exit $?"; cc_test_rel < err.txt
exit 0
cc-sessions: no conversation records in <root>/projects/-tmp-sessions-fixture-alpha/b5a7c9e1-0d2f-4a4b-9c6e-8f0a2b4c6d8e.jsonl
```

The notice names the bounds that matched nothing.

```scrut {output_stream: stderr}
$ cc-sessions conversation a7c3e9f --since 2030-01-01 2>&1 | cc_test_rel >&2
cc-sessions: no conversation records in <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl with --since 2030-01-01
```

## Usage errors

The session is required, and only one.

```scrut {output_stream: stderr}
$ cc-sessions conversation; cc-sessions conversation a7c3e9f b2d4; echo "exit $?" >&2
cc-sessions: conversation needs a <session>; pass a session id or a prefix of 4 or more characters, a path, wf_<run-id> or current; see cc-sessions conversation --help
cc-sessions: conversation takes one <session>, got 2; run it once per session; see cc-sessions conversation --help
exit 2
```

An unknown option names the valid ones; an option without its value and a bad bound are usage errors.

```scrut {output_stream: stderr}
$ cc-sessions conversation a7c3e9f --frob; cc-sessions conversation a7c3e9f --around; cc-sessions conversation a7c3e9f --until soon; echo "exit $?" >&2
cc-sessions: unknown option "--frob" for conversation; valid options: --thinking, --events, --tokens, --around, --agents, --since, --until, --full; to pass text that starts with -, put it after --; see cc-sessions conversation --help
cc-sessions: --around needs a value; pass one after it; see cc-sessions conversation --help
cc-sessions: --until takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got "soon"; pass one of those forms; see cc-sessions conversation --help
exit 2
```

`--` ends options, so an operand may start with `-`.

```scrut
$ (cd "$P" && cc-sessions conversation --until L2 -- -tmp-sessions-fixture-under-score/f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4.jsonl | cut -f1,4)
L1\tinjected (escaped)
L2\tprompt (escaped)
```

## Budget and portability

`--limit` stops after that many records and says where to continue.

```scrut {output_stream: combined}
$ cc-sessions conversation a7c3e9f --limit 3 2>&1 | cut -f1
L4
L11
L12
cc-sessions: output stopped at --limit 3 after 3 records; 47 more left out; continue with --since L14
```

With `--agents` the records come from several files, so the notice continues by time: record 47 and the
next one are both at 10:20:10, so following the notice repeats one record and loses none.

```scrut
$ cc-sessions conversation a7c3e9f --agents --events --limit 47 2> notice.txt | tail -n 1 | cut -f1-4; cat notice.txt
> cc-sessions conversation a7c3e9f --agents --events --since 2026-10-30T10:20:10Z > rest.txt; wc -l < rest.txt | tr -d ' '; head -n 1 rest.txt | cut -f1-4
> cc-sessions conversation a7c3e9f --agents --events --max-chars 0 | tail -n 29 | cmp - rest.txt && echo same
L2\ta7c3e9b2d4f6a8c01\t2026-10-30T10:20:10Z\tevent (escaped)
cc-sessions: output stopped at --limit 47 after 47 records; 28 more left out; continue with --since 2026-10-30T10:20:10Z, which repeats the 1 record already shown at that second
29
L2\ta7c3e9b2d4f6a8c01\t2026-10-30T10:20:10Z\tevent (escaped)
same
```

So does a page whose records, shown and left out, all come from one agent: a handle bound would apply to the
session's transcript as well.

```scrut {output_stream: combined}
$ cc-sessions conversation a7c3e9f --agents --since 2026-10-30T10:22:00Z --until 2026-10-30T10:22:30Z --limit 1 2>&1 | cut -f1-3
> cc-sessions conversation a7c3e9f --agents --since 2026-10-30T10:22:05Z --until 2026-10-30T10:22:30Z | cut -f1-3
L1\ta0f1e2d3c4b5a6978\t2026-10-30T10:22:03Z (escaped)
cc-sessions: output stopped at --limit 1 after 1 record; 2 more left out; continue with --since 2026-10-30T10:22:05Z
L2\ta0f1e2d3c4b5a6978\t2026-10-30T10:22:05Z (escaped)
L4\ta0f1e2d3c4b5a6978\t2026-10-30T10:22:10Z (escaped)
```

With jq 1.7 first on PATH the records are the same.

```scrut
$ JQ17=$CC_TEST_TMP/jq17 && mkdir -p "$JQ17" && ln -sf /usr/bin/jq "$JQ17/jq"
> cc-sessions conversation a7c3e9f --agents --events --thinking --tokens > new.txt && PATH="$JQ17:$PATH" cc-sessions conversation a7c3e9f --agents --events --thinking --tokens > old.txt && cmp new.txt old.txt && wc -l < old.txt | tr -d ' '
86
```

shellcheck finds nothing in the command.

```scrut
$ cd "$CC_TEST_ROOT" && shellcheck -x -P SCRIPTDIR libexec/conversation && echo clean
clean
```
