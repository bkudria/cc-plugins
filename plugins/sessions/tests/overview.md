---
prepend: [setup.md]
---

# cc-sessions overview

Values come from `fixtures/FACTS.md`.

## Help

The synopsis is one index line.

```scrut
$ cc-sessions overview --synopsis | awk '{ print (length($0) <= 120 ? "short" : "long"), $1, $2 }'; cc-sessions --help | grep -c '^  overview <session>'
short overview <session>
1
```

Help exits 0 without reading transcripts, and stays short.

```scrut
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions overview --help > help.txt; echo "exit $?"; [ "$(wc -l < help.txt)" -le 40 ] && echo short
> head -n 1 help.txt
exit 0
short
Usage: cc-sessions overview <session> [--agents] [--since T] [--until T] [--full]
```

Help names every option, the label width, the empty-answer notice and the exit codes.

```scrut
$ for w in --agents --since --until --full '100 characters' 'no entries' 'Exit status' 'usage error'; do grep -q -e "$w" help.txt || echo "missing $w"; done; echo checked
checked
```

Help lists the keys in the order the output uses them.

```scrut
$ awk '/^Fields/ { on = 1; next } /^Options/ { on = 0 } on && /^  [a-z]/ { line = substr($0, 3); sub(/  .*/, "", line); n = split(line, k, ", "); for (i = 1; i <= n; i++) print k[i] }' help.txt > keys.txt
> tr '\n' ' ' < keys.txt; echo
path id kind parent internal resumed_from project cwd label origin versions models start end duration prompts messages tokens tokens_with_agents peak_context cost tool largest compaction skill agents agent workflows errors api_errors persisted skipped_lines duplicate_entries 
```

Every key the output uses is documented, and each output follows the documented order.

```scrut
$ for f in a7c3e9f c4e6 a0f1 acompact b9e1 b5a7; do cc-sessions overview "$f" --agents 2>/dev/null | cut -f 1 | uniq; echo ---; done > used.txt
> awk 'NR == FNR { rank[$1] = NR; next } $1 == "---" { last = 0; next } !($1 in rank) { print "undocumented " $1 } rank[$1] < last { print "out of order " $1 } { last = rank[$1] }' keys.txt used.txt; echo checked
checked
```

## A current-era session

ALPHA: every fact from FACTS.md. `errors` counts calls with status error (L31, L33); the denied Edit (L29) is not one.

```scrut
$ cc-sessions overview a7c3e9f | cc_test_rel
path\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl (escaped)
id\ta7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e (escaped)
kind\tmain (escaped)
project\t-tmp-sessions-fixture-alpha (escaped)
cwd\t/tmp/sessions-fixture/alpha\tL3 (escaped)
label\talpha fixture session\tcustom-title\tL79 (escaped)
origin\tcli (escaped)
versions\t2.1.314 (escaped)
models\tclaude-opus-5-5 (escaped)
start\t2026-10-30T10:00:01Z\tL3 (escaped)
end\t2026-10-30T10:32:05Z\tL81 (escaped)
duration\t32m04s (escaped)
prompts\t14\tprompt=4\tslash=5\tbash=1\tqueued=1\tanswer=1\tdenied=1\tplan=1 (escaped)
messages\t17\tsynthetic=1 (escaped)
tokens\t22\t22930\t257200\t1487 (escaped)
peak_context\t21731\tL34 (escaped)
cost\tL83\t0.4321\tclaude-opus-5-5=21/22930/245300/1487\tclaude-haiku-5-5=12/6000/9000/230 (escaped)
tool\tBash\t3\t2428\t1 (escaped)
tool\tSkill\t3\t110\t1 (escaped)
tool\tAgent\t2\t577\t0 (escaped)
tool\tAskUserQuestion\t1\t153\t0 (escaped)
tool\tEdit\t1\t231\t0 (escaped)
tool\tExitPlanMode\t1\t319\t0 (escaped)
tool\tWorkflow\t1\t522\t0 (escaped)
tool\tmcp__demo__fetch\t1\t49\t0 (escaped)
largest\tL16\tBash\t3402B\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/tool-results/b4k7m2q9x.txt (escaped)
largest\tL65\tWorkflow\t522\t- (escaped)
largest\tL61\tAgent\t397\t- (escaped)
largest\tL52\tExitPlanMode\t319\t- (escaped)
largest\tL29\tEdit\t231\t- (escaped)
compaction\tL36\tmanual\t21760\t9120 (escaped)
skill\tL23\tdemo:review\tskill (escaped)
skill\tL45\talpha-helper\ttool (escaped)
skill\tL73\tdoctor\tbundled (escaped)
agents\t5\tagent=1\tteammate=1\tfork=1\tworkflow-agent=2\tinternal=3 (escaped)
workflows\t1 (escaped)
errors\t2 (escaped)
api_errors\t0 (escaped)
persisted\t1 (escaped)
skipped_lines\t0 (escaped)
duplicate_entries\t0 (escaped)
```

Nothing goes to stderr for a clean transcript.

```scrut {output_stream: stderr}
$ cc-sessions overview a7c3e9f > /dev/null
```

## --agents

Each non-internal agent gets its own token totals (input, cache creation, cache read, output); `tokens_with_agents` is the roll-up of the main transcript and those agents. The compaction, prompt-suggestion and transcripts-fork agents are left out.

```scrut
$ cc-sessions overview a7c3e9f --agents | grep -E '^(tokens|agent)'
tokens\t22\t22930\t257200\t1487 (escaped)
tokens_with_agents\t47\t33830\t277650\t1707 (escaped)
agents\t5\tagent=1\tteammate=1\tfork=1\tworkflow-agent=2\tinternal=3 (escaped)
agent\ta7c3e9b2d4f6a8c01\tagent\tExplore\t7\t3060\t2950\t52\tSurvey tokenizer tests (escaped)
agent\tadoes-the-lexer-0a1b2c3d4e5f6a7b\tfork\tfork\t3\t900\t15000\t18\tdoes the lexer share the parser's token table? (escaped)
agent\taplanner-5e1f0a2b3c4d5e6f\tteammate\tplanner\t4\t2000\t0\t40\tPlan the strict-mode rollout (escaped)
agent\ta0f1e2d3c4b5a6978\tworkflow-agent\tworkflow-subagent\t6\t2540\t2500\t40\tscan (escaped)
agent\ta9e8d7c6b5a4f3e21\tworkflow-agent\tworkflow-subagent\t5\t2400\t0\t70\treport (escaped)
```

The rest of the output is the same as without `--agents`.

```scrut
$ diff <(cc-sessions overview a7c3e9f) <(cc-sessions overview a7c3e9f --agents | grep -v -E '^(tokens_with_agents|agent)\t') && echo same
same
```

A split-pane teammate runs as a session of its own and counts as one of the lead's agents, named by its session id.
Its type and label come from its spawning call.

```scrut
$ cc-sessions overview d5e7 --agents | grep -E '^agents?\t'
agents\t6\tagent=3\tteammate=2\tworkflow-agent=1 (escaped)
agent\ta1e3c5a7b9d1f3e5a\tagent\tExplore\t7\t4000\t4000\t86\tCheck the audit log (escaped)
agent\ta2b4d6f8a0c2e4a6b\tagent\tExplore\t3\t1700\t0\t28\tTrace the slow query (escaped)
agent\ta5c7e9a1b3c5d7e9f\tagent\tExplore\t2\t1600\t0\t20\tLook up the timeout setting (escaped)
agent\tareviewer-1a2b3c4d5e6f7a8b\tteammate\treviewer\t5\t2300\t2100\t80\tReview the audit findings (escaped)
agent\ta6d8f0b2c4e6a8b0d\tworkflow-agent\tworkflow-subagent\t5\t2400\t0\t33\tcount (escaped)
agent\tf3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\tteammate\tgeneral-purpose\t4\t6400\t6100\t105\tFix the timeout (escaped)
```

A flat-layout session's agents sit beside it; the Warmup agent is internal. The flat agent's type comes from its Task call and its label from its delegation prompt.

```scrut
$ cc-sessions overview c4e6 --agents | cc_test_rel
path\t<root>/projects/-tmp-sessions-fixture-flat/c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a.jsonl (escaped)
id\tc4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a (escaped)
kind\tmain (escaped)
project\t-tmp-sessions-fixture-flat (escaped)
cwd\t/tmp/sessions-fixture/flat\tL2 (escaped)
label\tFlat era config loader search\tsummary\tL1 (escaped)
origin\tcli (escaped)
versions\t2.0.76 (escaped)
models\tclaude-sonnet-4-5-20250929 (escaped)
start\t2026-01-03T11:40:03Z\tL2 (escaped)
end\t2026-01-03T11:40:24Z\tL8 (escaped)
duration\t21s (escaped)
prompts\t1\tprompt=1 (escaped)
messages\t2\tsynthetic=0 (escaped)
tokens\t4\t4300\t20000\t66 (escaped)
tokens_with_agents\t8\t8900\t20000\t82 (escaped)
peak_context\t12301\tL8 (escaped)
tool\tTask\t1\t102\t0 (escaped)
largest\tL7\tTask\t102\t- (escaped)
agents\t1\tflat=1\tinternal=1 (escaped)
agent\t5f6a7b8c\tflat\tExplore\t4\t4600\t0\t16\tLocate the config loader in the flat project. (escaped)
workflows\t0 (escaped)
errors\t0 (escaped)
api_errors\t0 (escaped)
persisted\t0 (escaped)
skipped_lines\t0 (escaped)
duplicate_entries\t0 (escaped)
```

## Pre-2.1.300 tokens, duplicates and the corrupt line

BETA: the last entry of each message counts (output 1267), the six re-appended lines and the corrupt L20 are counted and left out, and start and end are the earliest and latest timestamps although L7 runs backwards.

```scrut
$ cc-sessions overview b2d4 2>/dev/null | cc_test_rel
path\t<root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e.jsonl (escaped)
id\tb2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e (escaped)
kind\tmain (escaped)
project\t-tmp-sessions-fixture-beta (escaped)
cwd\t/tmp/sessions-fixture/beta\tL2 (escaped)
label\tSummarise the beta build failures.\tprompt\tL2 (escaped)
origin\tcli (escaped)
versions\t2.1.206 (escaped)
models\tclaude-opus-5-5 (escaped)
start\t2026-07-15T09:00:00Z\tL2 (escaped)
end\t2026-07-15T09:05:05Z\tL22 (escaped)
duration\t5m05s (escaped)
prompts\t4\tprompt=3\tqueued=1 (escaped)
messages\t5\tsynthetic=0 (escaped)
tokens\t9\t4050\t59400\t1267 (escaped)
peak_context\t13351\tL22 (escaped)
tool\tAgent\t1\t134\t0 (escaped)
tool\tBash\t1\t62\t0 (escaped)
largest\tL12\tAgent\t134\t- (escaped)
largest\tL6\tBash\t62\t- (escaped)
agents\t1\tagent=1 (escaped)
workflows\t0 (escaped)
errors\t0 (escaped)
api_errors\t0 (escaped)
persisted\t0 (escaped)
skipped_lines\t1 (escaped)
duplicate_entries\t6 (escaped)
```

The corrupt line is also named on stderr.

```scrut {output_stream: stderr}
$ cc-sessions overview b2d4 2>&1 >/dev/null | cc_test_rel >&2
cc-sessions: skipped 1 unparseable line in <root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e.jsonl: L20
```

## The resumed copy

RESUMED copies five lines of BETA's history (BETA's session id, L1–L5). Its Agent call names an agent whose transcript
is stored only under BETA; it is still RESUMED's agent, as in every command that reads a session's agents.

```scrut
$ cc-sessions overview b9e1 | grep -E '^(id|resumed_from|label|start|end|duration|prompts|messages|tokens|peak_context|agents)\t'
id\tb9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c (escaped)
resumed_from\tb2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\tL1\tL5 (escaped)
label\tFind where the header should live.\tprompt\tL1 (escaped)
start\t2026-07-15T09:01:03Z\tL1 (escaped)
end\t2026-07-20T14:00:05Z\tL7 (escaped)
duration\t5d04h59m02s (escaped)
prompts\t2\tprompt=2 (escaped)
messages\t3\tsynthetic=0 (escaped)
tokens\t6\t4700\t34200\t135 (escaped)
peak_context\t13201\tL5 (escaped)
agents\t1\tagent=1 (escaped)
```

## The 2.1.316 era

GAMMA: the agent-name label, the harness-command skill load, and the 30000-character Read result as the largest.

```scrut
$ cc-sessions overview c7d9 | cc_test_rel
path\t<root>/projects/-tmp-sessions-fixture-gamma/c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f.jsonl (escaped)
id\tc7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f (escaped)
kind\tmain (escaped)
project\t-tmp-sessions-fixture-gamma (escaped)
cwd\t/tmp/sessions-fixture/gamma\tL1 (escaped)
label\tgamma-indexer\tagent-name\tL14 (escaped)
origin\tcli (escaped)
versions\t2.1.316 (escaped)
models\tclaude-opus-5-5 (escaped)
start\t2026-10-26T14:00:03Z\tL1 (escaped)
end\t2026-10-26T14:20:13Z\tL24 (escaped)
duration\t20m10s (escaped)
prompts\t2\tprompt=2 (escaped)
messages\t6\tsynthetic=0 (escaped)
tokens\t9\t15750\t119000\t285 (escaped)
peak_context\t24751\tL23 (escaped)
tool\tBash\t2\t292\t0 (escaped)
tool\tRead\t1\t30000\t0 (escaped)
largest\tL8\tRead\t30000\t- (escaped)
largest\tL11\tBash\t229\t- (escaped)
largest\tL21\tBash\t63\t- (escaped)
skill\tL4\tfixture-focus\tbundled (escaped)
agents\t0 (escaped)
workflows\t0 (escaped)
errors\t0 (escaped)
api_errors\t0 (escaped)
persisted\t0 (escaped)
skipped_lines\t0 (escaped)
duplicate_entries\t0 (escaped)
```

## Other sessions

RELOC: one cwd line per working directory, and a persisted result whose stored path names a project that exists nowhere.

```scrut
$ cc-sessions overview e5a7 | grep -E '^(cwd|label|tool|largest|persisted)\t' | cc_test_rel
cwd\t/tmp/sessions-fixture/reloc\tL1 (escaped)
cwd\t/tmp/sessions-fixture/elsewhere\tL4 (escaped)
label\tShow the release notes\tai-title\tL2 (escaped)
tool\tBash\t2\t2399\t0 (escaped)
largest\tL5\tBash\t2502B\t<root>/projects/-tmp-sessions-fixture-reloc/e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d/tool-results/c8n2v5x1q.txt (escaped)
largest\tL7\tBash\t154\t- (escaped)
persisted\t1 (escaped)
```

SDK: the origin and the prompt kind.

```scrut
$ cc-sessions overview d1f3 | grep -E '^(label|origin|prompts|tokens)\t'
label\tRename the report generator skill\tai-title\tL4 (escaped)
origin\tsdk (escaped)
prompts\t1\tsdk=1 (escaped)
tokens\t3\t6000\t0\t20 (escaped)
```

UNDER: a cwd with a space, and an orphan skill body.

```scrut
$ cc-sessions overview f6b8 | grep -E '^(project|cwd|label|skill)\t'
project\t-tmp-sessions-fixture-under-score (escaped)
cwd\t/tmp/sessions fixture/under_score\tL1 (escaped)
label\tList the files with spaces in their names.\tprompt\tL2 (escaped)
skill\tL1\torphan-skill\torphan (escaped)
```

STUB has one entry and no timestamps: facts that do not apply are left out, counts are 0.

```scrut
$ cc-sessions overview b5a7 | cut -f 1-2 | tr '\t' ' ' | tr '\n' ','; echo
path */b5a7c9e1-0d2f-4a4b-9c6e-8f0a2b4c6d8e.jsonl,id b5a7c9e1-0d2f-4a4b-9c6e-8f0a2b4c6d8e,kind main,project -tmp-sessions-fixture-alpha,label Stub session title,origin cli,prompts 0,messages 0,tokens 0,agents 0,workflows 0,errors 0,api_errors 0,persisted 0,skipped_lines 0,duplicate_entries 0, (glob)
```

No fixture has API errors or more than one process run; a synthetic transcript has an API error message, a system `api_error` and two `cost-state` entries.

```scrut
$ printf '%s\n' \
>   '{"type":"user","uuid":"r1","sessionId":"runs","timestamp":"2026-10-30T10:00:00.000Z","message":{"role":"user","content":"Go."}}' \
>   '{"type":"assistant","uuid":"r2","isApiErrorMessage":true,"apiErrorStatus":529,"timestamp":"2026-10-30T10:00:01.000Z","message":{"id":"m1","model":"<synthetic>","content":[{"type":"text","text":"Overloaded"}]}}' \
>   '{"type":"system","subtype":"api_error","uuid":"r3","timestamp":"2026-10-30T10:00:02.000Z","content":"retrying"}' \
>   '{"type":"cost-state","totalCostUSD":0.5,"modelUsage":{"m":{"inputTokens":1,"outputTokens":2,"cacheReadInputTokens":3,"cacheCreationInputTokens":4}}}' \
>   '{"type":"cost-state","totalCostUSD":0.25,"modelUsage":{}}' > "$CC_TEST_TMP/runs.jsonl"
> cc-sessions overview "$CC_TEST_TMP/runs.jsonl" | grep -E '^(messages|cost|api_errors)\t'
messages\t1\tsynthetic=1 (escaped)
cost\tL4\t0.5\tm=1/4/3/2 (escaped)
cost\tL5\t0.25 (escaped)
api_errors\t2 (escaped)
```

## Agent transcripts

A sub-agent names its parent session and gets its label from its meta file.

```scrut
$ cc-sessions overview a7c3e9b | grep -E '^(id|kind|parent|label|prompts|tokens|agents)\t'
id\ta7c3e9b2d4f6a8c01 (escaped)
kind\tsubagent (escaped)
parent\ta7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e (escaped)
label\tSurvey tokenizer tests\tmeta\t- (escaped)
prompts\t0 (escaped)
tokens\t7\t3060\t2950\t52 (escaped)
```

A workflow agent's parent line adds its run id.

```scrut
$ cc-sessions overview a0f1 | grep -E '^(kind|parent|label)\t'
kind\tworkflow-agent (escaped)
parent\ta7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\twf_5d1c9a7e-3b2 (escaped)
label\tscan\tmeta\t- (escaped)
```

Internal agents stay reachable by name and say why they are internal.

```scrut
$ for a in acompact aprompt_suggestion a3d1 9a0b1c2d; do cc-sessions overview "$a" | grep -E '^(id|internal)\t'; done
id\tacompact-3f9a1c (escaped)
internal\tcompaction (escaped)
id\taprompt_suggestion-8d2e4b (escaped)
internal\tprompt-suggestion (escaped)
id\ta3d1e5f7a9b0c2d4e (escaped)
internal\ttranscripts-fork (escaped)
id\t9a0b1c2d (escaped)
internal\twarmup (escaped)
```

A flat agent's parent is the session named by its `sessionId`.

```scrut
$ cc-sessions overview 5f6a7b8c | grep -E '^(kind|parent|project)\t'
kind\tflat (escaped)
parent\tc4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a (escaped)
project\t-tmp-sessions-fixture-flat (escaped)
```

## --since and --until

A handle window counts only ALPHA's lines L59–L65; identity facts still describe the whole file. A handle bound applies to each file's own lines, so no agent transcript (each under ten lines) has entries in it.

```scrut
$ cc-sessions overview a7c3e9f --since L59 --until L65 | sed -n '/^cwd/,$p'
cwd\t/tmp/sessions-fixture/alpha\tL59 (escaped)
label\talpha fixture session\tcustom-title\tL79 (escaped)
origin\tcli (escaped)
versions\t2.1.314 (escaped)
models\tclaude-opus-5-5 (escaped)
start\t2026-10-30T10:19:53Z\tL59 (escaped)
end\t2026-10-30T10:20:05Z\tL65 (escaped)
duration\t12s (escaped)
prompts\t1\tprompt=1 (escaped)
messages\t1\tsynthetic=0 (escaped)
tokens\t2\t800\t14500\t400 (escaped)
peak_context\t15302\tL60 (escaped)
tool\tAgent\t2\t577\t0 (escaped)
tool\tWorkflow\t1\t522\t0 (escaped)
largest\tL65\tWorkflow\t522\t- (escaped)
largest\tL61\tAgent\t397\t- (escaped)
largest\tL63\tAgent\t180\t- (escaped)
agents\t0 (escaped)
workflows\t1 (escaped)
errors\t0 (escaped)
api_errors\t0 (escaped)
persisted\t0 (escaped)
skipped_lines\t0 (escaped)
duplicate_entries\t0 (escaped)
```

A time window applies to every transcript: 10:21–10:25 holds ALPHA L66–L70 and three agents.

```scrut
$ cc-sessions overview a7c3e9f --agents --since 2026-10-30T10:21Z --until 2026-10-30T10:25Z | grep -E '^(start|end|prompts|tokens|agent)'
start\t2026-10-30T10:25:03Z\tL66 (escaped)
end\t2026-10-30T10:25:12Z\tL70 (escaped)
prompts\t1\tqueued=1 (escaped)
tokens\t1\t1100\t15300\t50 (escaped)
tokens_with_agents\t16\t8040\t17800\t200 (escaped)
agents\t3\tteammate=1\tworkflow-agent=2 (escaped)
agent\taplanner-5e1f0a2b3c4d5e6f\tteammate\tplanner\t4\t2000\t0\t40\tPlan the strict-mode rollout (escaped)
agent\ta0f1e2d3c4b5a6978\tworkflow-agent\tworkflow-subagent\t6\t2540\t2500\t40\tscan (escaped)
agent\ta9e8d7c6b5a4f3e21\tworkflow-agent\tworkflow-subagent\t5\t2400\t0\t70\treport (escaped)
```

Lines in the window that repeat a uuid or do not parse are the ones counted.

```scrut
$ cc-sessions overview b2d4 --since L15 2>/dev/null | grep -E '^(skipped_lines|duplicate_entries)\t'; cc-sessions overview b2d4 --until L13 2>/dev/null | grep -E '^(skipped_lines|duplicate_entries)\t'
skipped_lines\t1 (escaped)
duplicate_entries\t5 (escaped)
skipped_lines\t0 (escaped)
duplicate_entries\t0 (escaped)
```

A window with no entries is an empty answer.

```scrut
$ out=$(cc-sessions overview a7c3e9f --since L84 2> err.txt); echo "exit $? stdout ${#out}"; cc_test_rel < err.txt
exit 0 stdout 0
cc-sessions: no entries in <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl with --since L84
```

## Labels and --full

A label reads as in `cc-sessions list`: on one line, whitespace runs as one space, cut to 100 characters; `--full`
keeps it whole and exact.

```scrut
$ words=$(printf 'word %.0s' $(seq 40)); printf '{"type":"user","uuid":"u1","sessionId":"long-label","timestamp":"2026-10-30T10:00:00.000Z","message":{"role":"user","content":"Two\\n\\n  lines: %s"}}\n' "$words" > "$CC_TEST_TMP/long-label.jsonl"
> cc-sessions overview "$CC_TEST_TMP/long-label.jsonl" | grep '^label'; cc-sessions overview "$CC_TEST_TMP/long-label.jsonl" --full | grep '^label' | awk -F '\t' '{ print length($2) }'
label\tTwo lines: word word word word word word word word word word word word word word word word word wor…\tprompt\tL1 (escaped)
216
```

## Usage errors

No session, or more than one, is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions overview; cc-sessions overview a7c3e9f b2d4; echo "exit $?" >&2
cc-sessions: overview needs a <session>; pass a session id or a prefix of 4 or more characters, a path, wf_<run-id> or current; see cc-sessions overview --help
cc-sessions: overview takes one <session>, got 2; run it once per session; see cc-sessions overview --help
exit 2
```

An unknown option names the valid ones.

```scrut {output_stream: stderr}
$ cc-sessions overview a7c3e9f --frob
cc-sessions: unknown option "--frob" for overview; valid options: --agents, --since, --until, --full; to pass text that starts with -, put it after --; see cc-sessions overview --help
[2]
```

A bad or missing bound value is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions overview a7c3e9f --since yesterday; cc-sessions overview a7c3e9f --until; echo "exit $?" >&2
cc-sessions: --since takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got "yesterday"; pass one of those forms; see cc-sessions overview --help
cc-sessions: --until needs a value; pass one after it; see cc-sessions overview --help
exit 2
```

An ambiguous session reference exits 2.

```scrut
$ cc-sessions overview a7c3 2>/dev/null; echo "exit $?"
exit 2
```

`--` ends options.

```scrut
$ cc-sessions overview -- f6b8 | head -n 2 | cut -f 1
path
id
```

## Output budget

The records carry no leading handle, so a cut output continues with a larger budget.

```scrut {output_stream: combined}
$ cc-sessions overview a7c3e9f --limit 3 2>&1 | cc_test_rel
path\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl (escaped)
id\ta7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e (escaped)
kind\tmain (escaped)
cc-sessions: output stopped at --limit 3 after 3 records; 38 more left out; continue with a larger --limit (0 removes the limit)
```

## Portability

jq 1.7 gives the same answer as the jq on PATH.

```scrut
$ JQ17=$CC_TEST_TMP/jq17 && mkdir -p "$JQ17" && ln -sf /usr/bin/jq "$JQ17/jq"
> for s in a7c3e9f b2d4 c4e6 c7d9; do cc-sessions overview "$s" --agents > new.txt 2>&1; PATH="$JQ17:$PATH" cc-sessions overview "$s" --agents > old.txt 2>&1; cmp new.txt old.txt || echo "differs: $s"; done; echo compared
compared
```

The shell code is clean under shellcheck.

```scrut
$ cd "$CC_TEST_ROOT" && shellcheck -x -P SCRIPTDIR libexec/overview && echo clean
clean
```
