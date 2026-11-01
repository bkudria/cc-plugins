---
prepend: [setup.md]
---

# lib/sessions.jq through cc-sessions jq

Values come from `fixtures/FACTS.md`.

## The function list

`cc-sessions jq --help` lists every public `s::` function, each with its arguments and a description.

```scrut
$ cc-sessions jq --help | awk '/^  s::/ { sig = $1; n = 0; if (sig ~ /\(/) { n = gsub(/;/, ";", sig) + 1 }; sub(/\(.*/, "", sig); print substr(sig, 4) "/" n }' | sort > documented.txt
> jq -n -r -L "$CC_TEST_ROOT/lib" '"sessions" | modulemeta | .defs[] | select(startswith("_") | not)' | sort > defined.txt
> diff defined.txt documented.txt && echo same; [ -s defined.txt ] && echo nonempty
same
nonempty
```

```scrut
$ cc-sessions jq --help | awk '/^  s::/ && NF < 3 { print "undocumented: " $0 }'; echo checked
checked
```

## Transcript objects

```scrut
$ cc-sessions jq '[.kind, .session, .agent, .run, .lines, (.rows | length), (.skipped | length), (.mtime | todate)] | map(. // "-") | @tsv' a7c3e9f a9e8 -- -r
main\ta7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t-\t-\t83\t83\t0\t2026-10-30T11:30:00Z (escaped)
workflow-agent\ta7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\ta9e8d7c6b5a4f3e21\twf_5d1c9a7e-3b2\t5\t5\t0\t2026-10-30T10:24:00Z (escaped)
```

Paths are absolute, `bytes` is the file size, and an agent's `meta` is its `.meta.json`.

```scrut
$ cc-sessions jq '.session_dir, .project_dir, .file' 7c3e9b -- -r | cc_test_rel
> cc-sessions jq '[.bytes, .meta.description, .meta.toolUseId] | @tsv' 7c3e9b -- -r; wc -c < "$ALPHA/subagents/agent-a7c3e9b2d4f6a8c01.jsonl" | tr -d ' '
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e
<root>/projects/-tmp-sessions-fixture-alpha
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-a7c3e9b2d4f6a8c01.jsonl
\d+\tSurvey tokenizer tests\ttoolu_01FxAlpha000000000000011 (regex)
\d+ (regex)
```

```scrut
$ [ "$(cc-sessions jq '.bytes' 7c3e9b)" = "$(wc -c < "$ALPHA/subagents/agent-a7c3e9b2d4f6a8c01.jsonl" | tr -d ' ')" ] && echo same-size
same-size
```

`sizes` maps every file under the owning session's `tool-results/` to its size on disk.

```scrut
$ cc-sessions jq '.sizes | to_entries[] | "\(.value) \(.key)"' a7c3e9f a0f1 -- -r | cc_test_rel
3402 <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/tool-results/b4k7m2q9x.txt
3402 <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/tool-results/b4k7m2q9x.txt
```

## Entries and de-duplication

`s::entries` keeps the first row of each `uuid`, in file order; BETA has 22 lines, 1 corrupt and 6 re-appended.

```scrut
$ cc-sessions jq '[s::entries | length, (map(.l) | .[-3:])]' b2d4 2>/dev/null
[15,[13,21,22]]
```

`s::duplicates` lists the dropped rows with the line of the row they repeat.

```scrut
$ cc-sessions jq '[s::duplicates | "L\(.l)=L\(.first)"] | join(" ")' b2d4 -- -r 2>/dev/null
L14=L2 L15=L3 L16=L4 L17=L5 L18=L6 L19=L7
```

`s::memo` returns the transcript carrying its de-duplicated entries and user classes, so a program that calls several
`s::` functions computes them once. The answers are the same with and without it.

```scrut
$ cc-sessions jq 's::memo as $m | [($m | s::entries | length), ([$m | s::human_inputs] == [s::human_inputs]), ([$m | s::tool_calls] == [s::tool_calls]), (($m | s::memo) == $m)]' b2d4 -- -c 2>/dev/null
[15,true,true,true]
```

Each entry row carries `t`, its own timestamp or the nearest earlier one; entries before any timestamp have none.

```scrut
$ cc-sessions jq '[s::entries[] | select(.l == 1 or .l == 3 or .l == 9) | .t]' a7c3e9f
[null,"2026-10-30T10:00:01.950Z","2026-10-30T10:00:07.350Z"]
```

## Fields, records and times

`s::field` writes one TSV field: `-` for null or empty, and TAB, newline and backslash escaped.

```scrut
$ cc-sessions jq '[null, "", "a\tb\nc\\d", 12, true, {"k": "v"}] | map(s::field) | join(" ")' -- -n -r
- - a\tb\nc\\d 12 true {"k":"v"}
```

A carriage return prints as `\r`, and every other control character, and DEL, as `\u00XX`; other text is unchanged.

```scrut
$ cc-sessions jq '["a\rb\r\n", "nul\u0000bel\u0007esc\u001b[2m\u001fdel\u007f", "é → ☃"] | map(s::field) | join(" ")' -- -n -r
a\rb\r\n nul\u0000bel\u0007esc\u001b[2m\u001fdel\u007f é → ☃
```

A long text with many of them still escapes in time proportional to its length.

```scrut {timeout: 5s}
$ cc-sessions jq '[range(7000)] | map("step\r\u0000") | join("") | s::field | [length, .[:16]]' -- -n -c
[84000,"step\\r\\u0000step"]
```

Escaping takes time in proportion to the text, so a long tool result with thousands of lines prints quickly.

```scrut {timeout: 5s}
$ cc-sessions jq '[range(7000)] | map("cell\t0001 | weight 037 | state settled") | join("\n") | s::field | [length, .[:24]]' -- -n -c
[286998,"cell\\t0001 | weight 037 "]
```

`s::tsv` joins fields into one record.

```scrut
$ cc-sessions jq '["L4", null, "two\nlines"] | s::tsv' -- -n -r
L4\t-\ttwo\\nlines (escaped)
```

`s::trunc(n)` cuts text to at most n characters, ending with `…`; 0 keeps it whole.

```scrut
$ cc-sessions jq '[("abcdefghij" | s::trunc(5), s::trunc(10), s::trunc(0)), (null | s::trunc(3))]' -- -n -c
["abcd…","abcdefghij","abcdefghij",null]
```

`s::ts` prints a timestamp as `YYYY-MM-DDTHH:MM:SSZ`, dropping milliseconds; it also takes epoch milliseconds or seconds.

```scrut
$ cc-sessions jq '["2026-10-30T10:00:04.781Z", "2026-10-30T10:00:04Z", 1793354400000, 1793354400, null] | map(s::ts)' -- -n -c
["2026-10-30T10:00:04Z","2026-10-30T10:00:04Z","2026-10-30T10:00:00Z","2026-10-30T10:00:00Z",null]
```

`s::human_size` writes a byte count as listings show sizes.

```scrut
$ cc-sessions jq '[512, 2458, 12288, 3565158, 1073741824, null] | map(s::human_size)' -- -n -c
["512B","2.4K","12K","3.4M","1.0G",null]
```

`s::handle` is `L<line>`, and `s::line_of` reads one back.

```scrut
$ cc-sessions jq '({l: 12} | s::handle), ("L57" | s::line_of), ("57" | s::line_of)' -- -n -c
"L12"
57
null
```

## --since and --until

`s::bound` reads a handle, a timestamp at any precision, or an age before `$now`; a time bound spans its precision.

```scrut
$ cc-sessions jq '"L12", "2026-10-30", "2026-10-30T10:00Z", "2026-10-30T10:00:04.781Z", "2h" | s::bound(.; 1793354400) | if .line then "line \(.line)" else "\(.from | todate) \(.to | todate)" end' -- -n -r
line 12
2026-10-30T00:00:00Z 2026-10-30T23:59:59Z
2026-10-30T10:00:00Z 2026-10-30T10:00:59Z
2026-10-30T10:00:04Z 2026-10-30T10:00:04Z
2026-10-30T08:00:00Z 2026-10-30T08:00:00Z
```

Ages take s, m, h, d and w.

```scrut
$ cc-sessions jq '"90s", "30m", "7d", "1w" | s::bound(.; 1793354400) | 1793354400 - .from' -- -n -c
90
1800
604800
604800
```

Anything else is an error that names the accepted forms.

```scrut
$ cc-sessions jq '"yesterday" | s::bound(.)' -- -n 2>&1
jq: error (at <unknown>): --since/--until takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got "yesterday"
[5]
```

So is a timestamp that names no real date or time: 2026 has no 29 February, April has no 31st, and no minute has a
60th second.

```scrut
$ for v in 2026-02-30 2026-02-29 2026-02-29T10:00Z 2026-04-31T10:00:00Z 2026-10-30T10:00:60Z 2026-10-30T24:00:00Z 2028-02-29 2026-12-31T23:59:59.999Z; do
>   cc-sessions jq '"\($v) \(try (s::bound($v) | .from | todate) catch "refused")"' -- -n -r --arg v "$v"; done
2026-02-30 refused
2026-02-29 refused
2026-02-29T10:00Z refused
2026-04-31T10:00:00Z refused
2026-10-30T10:00:60Z refused
2026-10-30T24:00:00Z refused
2028-02-29 2028-02-29T00:00:00Z
2026-12-31T23:59:59.999Z 2026-12-31T23:59:59Z
```

```scrut {output_stream: stderr}
$ cc-sessions list --since 2026-02-30
cc-sessions: --since takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got "2026-02-30"; pass one of those forms; see cc-sessions list --help
[2]
```

`s::within(since; until)` keeps rows or records inside both bounds (null for none), inclusive; time is compared to the second, and rows with no timestamp at or before them never match a time bound.

```scrut
$ cc-sessions jq '[s::entries[] | select(s::within(s::bound("L80"); null)) | .l], [s::entries[] | select(s::within(null; s::bound("2026-10-30T10:00:04Z"))) | .l], [s::entries[] | select(s::within(s::bound("2026-10-30T10:32:03Z"); s::bound("L81"))) | .l]' a7c3e9f -- -c
[80,81,82,83]
[3,4]
[80,81]
```

`cc_bound` in `lib/common.sh` checks a flag value the same way and prints the bound as JSON for `--argjson`; a bad value exits 2.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_bound --since L5; cc_bound --until 2026-10-30)
{"line":5}
{"from":1793318400,"to":1793404799}
```

```scrut {output_stream: stderr}
$ (. "$CC_TEST_ROOT/lib/common.sh"; CC_SESSIONS_COMMAND=prompts; cc_bound --since yesterday; echo unreachable)
cc-sessions: --since takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got "yesterday"; pass one of those forms; see cc-sessions prompts --help
[2]
```

## API messages and tokens

`s::messages` groups assistant entries by `message.id` across the whole file: blocks in file order, the usage of the last entry, and the context size (input + cache creation + cache read).

```scrut
$ cc-sessions jq 's::messages | [.l, .id[-3:], (.lines | map(tostring) | join(",")), (.blocks | map(.block.type) | join(",")), .usage.input, .usage.cache_creation, .usage.cache_read, .usage.output, .context, .synthetic] | @tsv' a7c3e9f -- -r | head -n 3
10\t001\t10,11,12\tthinking,text,tool_use\t3\t5200\t12000\t180\t17203\tfalse (escaped)
14\t002\t14,15,17\ttext,tool_use,tool_use\t1\t900\t17200\t240\t18101\tfalse (escaped)
19\t003\t19\ttext\t1\t1200\t18100\t60\t19301\tfalse (escaped)
```

ALPHA has 17 API messages from 24 assistant entries; the one at L56 is `<synthetic>` with zero usage.

```scrut
$ cc-sessions jq '[s::messages] | [length, (map(select(.synthetic)) | map([.l, .model, .context]))]' a7c3e9f -- -c
[17,[[56,"<synthetic>",0]]]
```

Before 2.1.300 the earlier split entries carry partial output tokens; the last entry's usage counts.

```scrut
$ cc-sessions jq 's::messages | [.l, (.lines | map(tostring) | join(",")), .usage.output] | @tsv' b2d4 -- -r 2>/dev/null
3\t3,4,5\t1100 (escaped)
7\t7\t45 (escaped)
10\t10,11\t80 (escaped)
13\t13\t30 (escaped)
22\t22\t12 (escaped)
```

`s::totals` sums the messages of one transcript and names its peak context.

```scrut
$ for s in a7c3e9f b2d4 b9e1 c4e6 d1f3 e5a7; do cc-sessions jq 's::totals | [.messages, .synthetic, .input, .cache_creation, .cache_read, .output, .peak_context, .peak_l] | @tsv' "$s" -- -r 2>/dev/null; done
17\t1\t22\t22930\t257200\t1487\t21731\t34 (escaped)
5\t0\t9\t4050\t59400\t1267\t13351\t22 (escaped)
3\t0\t6\t4700\t34200\t135\t13201\t5 (escaped)
2\t0\t4\t4300\t20000\t66\t12301\t8 (escaped)
1\t0\t3\t6000\t0\t20\t6003\t5 (escaped)
3\t0\t5\t6200\t10900\t82\t6201\t8 (escaped)
```

`s::usage` normalises a raw `message.usage` object, absent counts as 0.

```scrut
$ cc-sessions jq '{input_tokens: 2, output_tokens: 5, cache_read_input_tokens: 7} | s::usage' -- -n -c
{"input":2,"cache_creation":0,"cache_read":7,"output":5}
```

`s::models` lists models in first-use order, without `<synthetic>`.

```scrut
$ cc-sessions jq 's::models' a7c3e9f c4e6 5f6a7b8c a7c3e9b2 -- -c
["claude-opus-5-5"]
["claude-sonnet-4-5-20250929"]
["claude-haiku-4-5-20251001"]
["claude-haiku-5-5"]
```

Each sub-agent's totals.

```scrut
$ for a in a7c3e9b2 aplanner adoes a0f1 a9e8 a3d1 acompact aprompt_suggestion a4c6e8f0; do cc-sessions jq 's::totals | [.messages, .input, .cache_creation, .cache_read, .output] | @tsv' "$a" -- -r; done
2\t7\t3060\t2950\t52 (escaped)
1\t4\t2000\t0\t40 (escaped)
1\t3\t900\t15000\t18 (escaped)
2\t6\t2540\t2500\t40 (escaped)
1\t5\t2400\t0\t70 (escaped)
1\t3\t700\t0\t9 (escaped)
1\t3\t0\t21500\t300 (escaped)
1\t2\t0\t16000\t6 (escaped)
2\t4\t3090\t3400\t86 (escaped)
```

## Internal agents

`s::internal_reason` names why a transcript is internal (compaction, prompt suggestion, a flat Warmup agent, a transcripts-skill fork), else null; `s::is_internal` is true when it has one.

```scrut
$ cc-sessions jq '[.agent // .session, (s::internal_reason // "-"), s::is_internal] | @tsv' a7c3e9f acompact aprompt_suggestion a3d1 9a0b1c2d 5f6a7b8c a7c3e9b2 aplanner adoes a0f1 -- -r
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t-\tfalse (escaped)
acompact-3f9a1c\tcompaction\ttrue (escaped)
aprompt_suggestion-8d2e4b\tprompt-suggestion\ttrue (escaped)
a3d1e5f7a9b0c2d4e\ttranscripts-fork\ttrue (escaped)
9a0b1c2d\twarmup\ttrue (escaped)
5f6a7b8c\t-\tfalse (escaped)
a7c3e9b2d4f6a8c01\t-\tfalse (escaped)
aplanner-5e1f0a2b3c4d5e6f\t-\tfalse (escaped)
adoes-the-lexer-0a1b2c3d4e5f6a7b\t-\tfalse (escaped)
a0f1e2d3c4b5a6978\t-\tfalse (escaped)
```

`s::rollup` totals an array of transcripts, skipping internal ones and counting each `message.id` once.

```scrut
$ cc-sessions jq 's::rollup' a7c3e9b2 aplanner adoes a0f1 a9e8 a3d1 acompact aprompt_suggestion a7c3e9b2 -- -s -c
{"agents":5,"messages":7,"input":25,"cache_creation":10900,"cache_read":20450,"output":220}
```

A message repeated in another transcript (a resumed copy) counts once.

```scrut
$ cc-sessions jq 's::rollup | [.messages, .output]' b2d4 b9e1 -- -s -c 2>/dev/null
[6,1292]
```

## Human input

`s::content_text` reads message content: a string as is, text blocks joined by newlines, each image as `[image]`.

```scrut
$ cc-sessions jq '"plain", [{"type": "text", "text": "a"}, {"type": "image"}, {"type": "tool_reference"}, {"type": "text", "text": "b"}] | s::content_text' -- -n -c
"plain"
"a\n[image]\nb"
```

`s::user_entries` classifies every user entry; ALPHA's 37 fall into these classes.

```scrut
$ cc-sessions jq '[s::user_entries | .class] | group_by(.) | map("\(.[0]) \(length)") | .[]' a7c3e9f -- -r
human 10
injected 6
interrupt 1
notification 2
output 3
peer 1
summary 1
tool-result 13
```

```scrut
$ cc-sessions jq '[s::user_entries | select(.class != "tool-result") | "\(.l):\(.class)\(if .kind then "/" + .kind else "" end)"] | join(" ")' a7c3e9f -- -r
4:human/prompt 20:injected 21:human/slash 22:output 23:human/slash 24:injected 35:human/prompt 37:summary 38:injected 39:human/slash 40:output 44:human/prompt 47:injected 50:injected 55:interrupt 57:human/bash 58:output 59:human/prompt 66:peer 67:notification 68:notification 73:human/slash 74:injected 80:human/prompt
```

In an agent transcript the delegation prompt and later deliveries are `from-parent`, never human input; a teammate's `<teammate-message>` delivery too.

```scrut
$ cc-sessions jq '[.agent, ([s::user_entries | "\(.l):\(.class)"] | join(" ")), ([s::human_inputs] | length)] | @tsv' a7c3e9b2 aplanner adoes a0f1 5f6a7b8c 9a0b1c2d a4c6e8f0 -- -r
a7c3e9b2d4f6a8c01\t1:from-parent 3:tool-result\t0 (escaped)
aplanner-5e1f0a2b3c4d5e6f\t1:from-parent\t0 (escaped)
adoes-the-lexer-0a1b2c3d4e5f6a7b\t2:from-parent\t0 (escaped)
a0f1e2d3c4b5a6978\t1:from-parent 3:tool-result\t0 (escaped)
5f6a7b8c\t1:from-parent\t0 (escaped)
9a0b1c2d\t1:from-parent\t0 (escaped)
a4c6e8f0a2b4c6d8e\t1:from-parent 4:tool-result\t0 (escaped)
```

`s::human_inputs` lists ALPHA's 14 inputs: typed prompts, slash commands (from user and system entries), `!` bash, a queued prompt, an AskUserQuestion answer, a rejection with feedback and a plan decision.

```scrut
$ cc-sessions jq 's::human_inputs | [s::handle, .kind, .text, (.ts | s::ts)] | s::tsv' a7c3e9f -- -r
L4\tprompt\tCheck the CONTENT_TERM_ALPHA parser, then please run "make test" now.\t2026-10-30T10:00:04Z (escaped)
L21\tslash\t/effort high\t2026-10-30T10:00:35Z (escaped)
L23\tslash\t/demo:review parser changes\t2026-10-30T10:00:41Z (escaped)
L27\tanswer\tWhich parser mode should the review target? → Strict (Recommended)\t2026-10-30T10:00:51Z (escaped)
L29\tdenied\tKeep lenient mode until the release.\t2026-10-30T10:00:56Z (escaped)
L39\tslash\t/compact\t2026-10-30T10:01:21Z (escaped)
L44\tprompt\tThe output looks wrong here: [Image #1]\\n[image]\t2026-10-30T10:01:30Z (escaped)
L52\tplan\tapproved: # Plan\\n\\n1. Switch the parser to strict mode behind a flag.\t2026-10-30T10:01:51Z (escaped)
L57\tbash\tgit status\t2026-10-30T10:02:00Z (escaped)
L59\tprompt\tSpin up helpers for the tokenizer tests and the rollout.\t2026-10-30T10:19:53Z (escaped)
L69\tqueued\tAlso check the lexer.\t2026-10-30T10:25:10Z (escaped)
L71\tslash\t/btw does the lexer share the parser's token table?\t2026-10-30T10:26:41Z (escaped)
L73\tslash\t/doctor\t2026-10-30T10:28:33Z (escaped)
L80\tprompt\tThanks, wrap up.\t2026-10-30T10:32:03Z (escaped)
```

A plain `/compact` entry and its `<command-name>` record are one input (`also`); command output is attached (ANSI escapes removed); answers, denials and plan decisions name their tool call.

```scrut
$ cc-sessions jq 's::human_inputs | select(.also != [] or .outputs != [] or .tool) | [s::handle, .kind, (.also | map(tostring) | join(",")), .outputs[0].l, .outputs[0].text, .tool, .tool_use_id, .decision, .uuid] | s::tsv' a7c3e9f -- -r
L21\tslash\t-\t22\tSet effort level to high (this session only)\t-\t-\t-\te0a00011-0000-4000-8000-000000000011 (escaped)
L27\tanswer\t-\t-\t-\tAskUserQuestion\ttoolu_01FxAlpha000000000000004\t-\te0a00017-0000-4000-8000-000000000017 (escaped)
L29\tdenied\t-\t-\t-\tEdit\ttoolu_01FxAlpha000000000000005\t-\te0a00019-0000-4000-8000-000000000019 (escaped)
L39\tslash\t35\t40\tCompacted (ctrl+o to see full summary)\t-\t-\t-\te0a00023-0000-4000-8000-000000000023 (escaped)
L52\tplan\t-\t-\t-\tExitPlanMode\ttoolu_01FxAlpha000000000000010\tapproved\te0a00030-0000-4000-8000-000000000030 (escaped)
L57\tbash\t-\t58\tOn branch main\\nnothing to commit, working tree clean\t-\t-\t-\te0a00034-0000-4000-8000-000000000034 (escaped)
```

Decisions are read from the result line: FOXTROT's denial of a call in an earlier session (L2) names no tool, and the
approval at L13 is known by its wording; outputs stored as `system` entries attach to their commands.

```scrut
$ cc-sessions jq 's::human_inputs | select(.outputs != [] or .tool_use_id) | [s::handle, .kind, (.outputs | map("L\(.l)") | join(",")), .tool, .tool_use_id, .decision] | s::tsv' f0d2 -- -r
L2\tdenied\t-\t-\ttoolu_01FxFoxtrotPrior00000001\t- (escaped)
L6\tslash\tL7\t-\t-\t- (escaped)
L8\tslash\tL9\t-\t-\t- (escaped)
L13\tplan\t-\tExitPlanMode\ttoolu_01FxFoxtrot0000000000002\tapproved (escaped)
L20\tslash\tL21\t-\t-\t- (escaped)
```

Other sessions: BETA's prompt that exists only in a `queue-operation` is `queued`, and its re-appended copies are not repeated; SDK prompts are `sdk`.

```scrut
$ for s in b2d4 b9e1 c4e6 d1f3 e5a7 f6b8 b5a7; do cc-sessions jq '[.session[:4], ([s::human_inputs | "\(s::handle):\(.kind):\(.text)"] | join(" | "))] | s::tsv' "$s" -- -r 2>/dev/null; done
b2d4\tL2:prompt:Summarise the beta build failures. | L8:queued:Also list the warnings. | L9:prompt:Find where the header should live. | L21:prompt:List the warnings too. (escaped)
b9e1\tL1:prompt:Find where the header should live. | L6:prompt:Now fix the include path. (escaped)
c4e6\tL2:prompt:Find the flat config loader. (escaped)
d1f3\tL3:sdk:Rename the report generator skill to report-builder. (escaped)
e5a7\tL1:prompt:Show the release notes. (escaped)
f6b8\tL2:prompt:List the files with spaces in their names. (escaped)
b5a7\t- (escaped)
```

The other prefixes of rule 1 are never human input, and rule 3 joins an array prompt but skips a queued command whose
text a user entry already holds, an `<agent-message`, and one from another origin.

```scrut
$ printf '%s\n' '{"type":"user","uuid":"h1","message":{"content":"[Usage limit reached. Resets at 5pm.]"}}' \
>   '{"type":"user","uuid":"h2","message":{"content":"Caveat: The messages below were generated by the user while running local commands."}}' \
>   '{"type":"user","uuid":"h3","message":{"content":"<bash-notification>\n<status>completed</status>\n</bash-notification>"}}' \
>   '{"type":"user","uuid":"h4","message":{"content":"<agent-notification>\n<status>completed</status>\n</agent-notification>"}}' \
>   '{"type":"user","uuid":"h5","message":{"content":"<agent-message from=\"helper\">Done here.</agent-message>"}}' \
>   '{"type":"user","uuid":"h6","message":{"content":"Typed while working."}}' \
>   '{"type":"attachment","uuid":"h7","attachment":{"type":"queued_command","commandMode":"prompt","prompt":"Typed while working."}}' \
>   '{"type":"attachment","uuid":"h8","attachment":{"type":"queued_command","commandMode":"prompt","prompt":[{"type":"text","text":"Array"},{"type":"text","text":"prompt"}]}}' \
>   '{"type":"attachment","uuid":"h9","attachment":{"type":"queued_command","commandMode":"prompt","prompt":"<agent-message from=\"x\">relay</agent-message>"}}' \
>   '{"type":"attachment","uuid":"h10","attachment":{"type":"queued_command","commandMode":"prompt","origin":{"kind":"peer"},"prompt":"From a peer."}}' > "$CC_TEST_TMP/prefixes.jsonl"
> cc-sessions jq '([s::user_entries | "\(.l):\(.class)"] | join(" ")), (s::human_inputs | [s::handle, .kind, .text] | s::tsv)' "$CC_TEST_TMP/prefixes.jsonl" -- -r
1:injected 2:injected 3:notification 4:notification 5:peer 6:human
L6\tprompt\tTyped while working. (escaped)
L8\tqueued\tArray\\nprompt (escaped)
```

A command can print several outputs; `outputs` keeps each of them.

```scrut
$ printf '%s\n' '{"type":"user","uuid":"o1","message":{"content":"<command-name>/x</command-name>"}}' '{"type":"user","uuid":"o2","message":{"content":"<local-command-stdout>one</local-command-stdout>"}}' '{"type":"user","uuid":"o3","message":{"content":"<local-command-stderr>two</local-command-stderr>"}}' > "$CC_TEST_TMP/two-outputs.jsonl"
> cc-sessions jq '[s::human_inputs | .outputs]' "$CC_TEST_TMP/two-outputs.jsonl" -- -c
[[{"l":2,"text":"one"},{"l":3,"text":"two"}]]
```

`s::interrupts` and `s::outputs` are the related events; `s::human_events` interleaves inputs and interrupts in file order.

```scrut
$ cc-sessions jq '(s::interrupts | [s::handle, .kind, .text, .interrupted] | s::tsv), (s::outputs | [s::handle, .kind, .of, .text] | s::tsv), ([s::human_events | s::handle] | join(" "))' a7c3e9f -- -r
L55\tinterrupt\t[Request interrupted by user]\tmsg_01FxAlpha000000000000012 (escaped)
L22\toutput\t21\tSet effort level to high (this session only) (escaped)
L40\toutput\t39\tCompacted (ctrl+o to see full summary) (escaped)
L58\toutput\t57\tOn branch main\\nnothing to commit, working tree clean (escaped)
L4 L21 L23 L27 L29 L39 L44 L52 L55 L57 L59 L69 L71 L73 L80
```

## Skill loads

`s::skill_events` lists loads (by the Skill tool, by a slash command followed by a skill body or a bundled body, or an orphan body), failed Skill calls, re-invocations and post-compaction restores.

```scrut
$ cc-sessions jq 's::skill_events | [s::handle, .event, .name, .how, .tool_use_id, .result_l, .body_l, (.ts | s::ts)] | s::tsv' a7c3e9f f6b8 -- -r
L23\tload\tdemo:review\tskill\t-\t-\t24\t2026-10-30T10:00:41Z (escaped)
L32\tfailed\tnope\ttool\ttoolu_01FxAlpha000000000000007\t33\t-\t2026-10-30T10:01:03Z (escaped)
L43\trestore\tdemo:review\t-\t-\t-\t-\t2026-10-30T10:01:27Z (escaped)
L45\tload\talpha-helper\ttool\ttoolu_01FxAlpha000000000000008\t46\t47\t2026-10-30T10:01:32Z (escaped)
L48\tre-invoked\talpha-helper\ttool\ttoolu_01FxAlpha000000000000009\t49\t50\t2026-10-30T10:01:40Z (escaped)
L73\tload\tdoctor\tbundled\t-\t-\t74\t2026-10-30T10:28:33Z (escaped)
L1\tload\torphan-skill\torphan\t-\t-\t1\t2026-10-27T11:55:03Z (escaped)
```

`s::skill_loads` keeps the loads only.

```scrut
$ cc-sessions jq '[s::skill_loads | "\(.name)/\(.how)"] | join(" ")' a7c3e9f -- -r
demo:review/skill alpha-helper/tool doctor/bundled
```

`attributionSkill` names the active skill of an assistant entry; it is never a load.

```scrut
$ cc-sessions jq '[s::attributions | "\(s::handle):\(.skill)"] | join(" ")' a7c3e9f -- -r
L25:demo:review L26:demo:review L28:demo:review L48:alpha-helper L51:alpha-helper
```

`s::skill_match(q)` compares skill names by their last segment.

```scrut
$ cc-sessions jq '[["claudecraft:skillcraft", "skillcraft"], ["skillcraft", "claudecraft:skillcraft"], ["demo:review", "review"], ["alpha-helper", "helper"]] | map(.[0] as $name | .[1] as $q | $name | s::skill_match($q))' -- -n -c
[true,true,true,false]
```

## Tool calls

`s::tool_calls` pairs each tool_use with its result: status is ok, error, denied or none; chars is the length of the result text (text blocks joined by newlines).

```scrut
$ cc-sessions jq 's::tool_calls | [s::handle, .id[-2:], .name, .result_l, .status, .chars, .is_error] | s::tsv' a7c3e9f -- -r
L12\t01\tBash\t13\tok\t96\tfalse (escaped)
L15\t02\tBash\t16\tok\t2277\tfalse (escaped)
L17\t03\tmcp__demo__fetch\t18\tok\t49\t- (escaped)
L26\t04\tAskUserQuestion\t27\tok\t153\t- (escaped)
L28\t05\tEdit\t29\tdenied\t231\ttrue (escaped)
L30\t06\tBash\t31\terror\t55\ttrue (escaped)
L32\t07\tSkill\t33\terror\t52\ttrue (escaped)
L45\t08\tSkill\t46\tok\t29\t- (escaped)
L48\t09\tSkill\t49\tok\t29\t- (escaped)
L51\t10\tExitPlanMode\t52\tok\t319\t- (escaped)
L60\t11\tAgent\t61\tok\t397\t- (escaped)
L62\t12\tAgent\t63\tok\t180\t- (escaped)
L64\t13\tWorkflow\t65\tok\t522\tfalse (escaped)
```

Images add nothing to chars, though the text shows each as `[image]`: FOXTROT's Read result is one image, its click
result a 19-character text and an image.

```scrut
$ cc-sessions jq 's::tool_calls | select(.id | endswith("04", "05")) | [s::handle, .name, .chars, .text] | s::tsv' f0d2 -- -r
L34\tRead\t0\t[image] (escaped)
L36\tmcp__demo__click\t19\tClicked at (10, 20)\\n[image] (escaped)
```

A rejection carries the user's feedback; `input` is the stored input, `wire_input` the form sent to the API, and `result` the `toolUseResult` when the file has one.

```scrut
$ cc-sessions jq 's::tool_calls | select(.id | endswith("05", "01", "13")) | [s::handle, .feedback, (.input | tojson), (.wire_input | tojson), (.result | type), .message_id, (.ts | s::ts)] | s::tsv' a7c3e9f -- -r
L12\t-\t{"command":"rg -n CONTENT_TERM_ALPHA src","description":"Find the parser symbol"}\t{"command":"cd /tmp/sessions-fixture/alpha && rg -n CONTENT_TERM_ALPHA src","description":"Find the parser symbol"}\tobject\tmsg_01FxAlpha000000000000001\t2026-10-30T10:00:13Z (escaped)
L28\tKeep lenient mode until the release.\t{"file_path":"/tmp/sessions-fixture/alpha/src/parser.c","old_string":"MODE_LENIENT","new_string":"MODE_STRICT"}\t{"file_path":"/tmp/sessions-fixture/alpha/src/parser.c","old_string":"MODE_LENIENT","new_string":"MODE_STRICT"}\tstring\tmsg_01FxAlpha000000000000005\t2026-10-30T10:00:53Z (escaped)
L64\t-\t{"name":"fixture-scan","args":{"target":"src"}}\t{"name":"fixture-scan","args":"{\\\\"target\\\\":\\\\"src\\\\"}"}\tobject\tmsg_01FxAlpha000000000000013\t2026-10-30T10:20:02Z (escaped)
```

Results made of several text blocks; sub-agent results without `toolUseResult`.

```scrut
$ cc-sessions jq '. as $t | s::tool_calls | [$t.agent // $t.session[:4], s::handle, .name, .result_l, .status, .chars, (.result | type)] | s::tsv' b2d4 c4e6 a4c6e8f0 -- -r 2>/dev/null
b2d4\tL5\tBash\t6\tok\t62\tobject (escaped)
b2d4\tL11\tAgent\t12\tok\t134\tobject (escaped)
c4e6\tL4\tTask\t7\tok\t102\tobject (escaped)
a4c6e8f0a2b4c6d8e\tL3\tGlob\t4\tok\t14\tnull (escaped)
```

A call with no result has status `none`.

```scrut
$ printf '%s\n' '{"type":"assistant","uuid":"x1","message":{"id":"m1","model":"m","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"sleep 9"}}]}}' > "$CC_TEST_TMP/pending.jsonl"
> cc-sessions jq 's::tool_calls | [.status, .result_l, .chars] | s::tsv' "$CC_TEST_TMP/pending.jsonl" -- -r
none\t-\t- (escaped)
```

## Persisted outputs

`s::persisted_marker` parses a result text only when it starts with the marker. Input: a string.

```scrut
$ cc-sessions jq '"<persisted-output>\nOutput too large (29.5KB). Full output saved to: /x/tool-results/a b.txt\n\nPreview (first 2KB):\nline", "quoted: <persisted-output>\nOutput too large (1KB). Full output saved to: /y\n\nPreview (first 1KB):\n" | s::persisted_marker' -- -n -c
{"stated_size":"29.5KB","stated_path":"/x/tool-results/a b.txt","preview_size":"2KB"}
null
```

A persisted result's real size is the saved file's size; a stored path that does not exist falls back to the file of the same name under the owning session's `tool-results/`.

```scrut
$ cc-sessions jq 's::tool_calls | select(.persisted) | [s::handle, .persisted.stated_size, .persisted.preview_size, .persisted.bytes, .persisted.path, .persisted.stated_path] | s::tsv' a7c3e9f e5a7 -- -r | cc_test_rel
L15\t3.3KB\t2KB\t3402\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/tool-results/b4k7m2q9x.txt\t/tmp/sessions-fixture/config/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/tool-results/b4k7m2q9x.txt (escaped)
L4\t2.4KB\t2KB\t2502\t<root>/projects/-tmp-sessions-fixture-reloc/e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d/tool-results/c8n2v5x1q.txt\t/tmp/sessions-fixture/config/projects/-tmp-sessions-fixture-elsewhere/e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d/tool-results/c8n2v5x1q.txt (escaped)
```

Text that quotes the marker mid-result is not persisted.

```scrut
$ cc-sessions jq '[s::tool_calls | [s::handle, .chars, (.persisted != null)]]' e5a7 -- -c
[["L4",2245,true],["L6",154,false]]
```

A stored path that exists is used as is, wherever it is.

```scrut
$ mkdir -p "$CC_TEST_TMP/elsewhere" && printf 'ten bytes\n' > "$CC_TEST_TMP/elsewhere/out.txt"
> jq -n -c --arg p "$CC_TEST_TMP/elsewhere/out.txt" '{type: "assistant", uuid: "a1", message: {id: "m1", model: "m", content: [{type: "tool_use", id: "t1", name: "Bash", input: {}}]}}, {type: "user", uuid: "u1", message: {content: [{type: "tool_result", tool_use_id: "t1", content: "<persisted-output>\nOutput too large (1B). Full output saved to: \($p)\n\nPreview (first 1B):\nt"}]}}' > "$CC_TEST_TMP/adhoc.jsonl"
> cc-sessions jq 's::tool_calls | [.persisted.bytes, .persisted.path] | s::tsv' "$CC_TEST_TMP/adhoc.jsonl" -- -r | cc_test_rel "$CC_TEST_TMP"
10\t<root>/elsewhere/out.txt (escaped)
```

## Content kinds

`s::content_kinds` lists every searchable kind; `s::default_kinds` those searched by default.

```scrut
$ cc-sessions jq '(s::content_kinds | join(" ")), (s::default_kinds | join(" "))' -- -n -r
prompt assistant tool-input tool-result from-parent agent-result plan file hook recap thinking injected summary notification peer
prompt assistant tool-input tool-result from-parent agent-result plan file hook recap
```

`s::content` emits `{l, kind, text, ts}` for every piece of searchable content; `CONTENT_TERM_ALPHA` sits in exactly 10 of them.

```scrut
$ cc-sessions jq '. as $t | s::content | select(.text | contains("CONTENT_TERM_ALPHA")) | [($t.agent // "main"), s::handle, .kind] | s::tsv' a7c3e9f a0f1 a9e8 "$WF/journal.jsonl" -- -r
main\tL4\tprompt (escaped)
main\tL10\tthinking (escaped)
main\tL12\ttool-input (escaped)
main\tL13\ttool-result (escaped)
main\tL14\tassistant (escaped)
main\tL47\tinjected (escaped)
a0f1e2d3c4b5a6978\tL1\tfrom-parent (escaped)
a9e8d7c6b5a4f3e21\tL3\ttool-input (escaped)
a9e8d7c6b5a4f3e21\tL4\tagent-result (escaped)
main\tL5\tagent-result (escaped)
```

`s::content(kinds)` keeps the given kinds: by default 8 of those 10.

```scrut
$ cc-sessions jq 'map([s::content(s::default_kinds) | select(.text | contains("CONTENT_TERM_ALPHA"))] | length) | add' a7c3e9f a0f1 a9e8 "$WF/journal.jsonl" -- -s
8
```

System copies and state are never content: `NOISE_ONLY_TERM` (in `skill_listing`, `instructions` and `api-request-blob`) appears in no kind.

```scrut
$ cc-sessions jq '[s::content | select(.text | contains("NOISE_ONLY_TERM"))] | length' a7c3e9f
0
```

```scrut
$ for term in 'please run "make test" now' 'make test' '--force-push-now' 'lib.jq' 'libXjq' '[cc-sessions:transcripts-fork]'; do
>   cc-sessions jq 'map(. as $t | s::content | select(.text | contains($q)) | "\($t.agent // "main"):\(s::handle):\(.kind)") | join(" ")' a7c3e9f a3d1 -- -s -r --arg q "$term"
> done
main:L4:prompt
main:L4:prompt main:L15:tool-input
main:L19:assistant
main:L14:assistant
main:L13:tool-result
a3d1e5f7a9b0c2d4e:L1:from-parent
```

The other kinds present: hook, file, plan, recap, and the hidden summary, notification and peer kinds.

```scrut
$ cc-sessions jq 's::content | select(.kind | IN("hook", "file", "plan", "recap", "summary", "notification", "peer")) | [s::handle, .kind, (.text | s::trunc(40))] | s::tsv' a7c3e9f -- -r
L3\thook\tfixture hook ready (escaped)
L37\tsummary\tThis session is being continued from a … (escaped)
L41\tfile\t#define MODE_LENIENT 1\\n (escaped)
L42\tplan\t# Plan\\n\\n1. Switch the parser to strict … (escaped)
L66\tpeer\tAnother Claude session sent a message:\\n… (escaped)
L67\tnotification\t<task-notification>\\n<task-id>a7c3e9b2d4… (escaped)
L68\tnotification\t<task-notification>\\n<task-id>w3k9p2m7z<… (escaped)
L76\trecap\tWhile you were away: the parser review … (escaped)
```

## Entry types

`s::entry_type` labels an entry: its type, with the attachment type or system subtype. Input: an entry.

```scrut
$ cc-sessions jq '[s::entries[] | select(.l == 3 or .l == 36 or .l == 4) | .e | s::entry_type]' a7c3e9f -- -c
["attachment:hook_success","user","system:compact_boundary"]
```

`s::unknown_types` reports labels in neither the content nor the state list: only the fixture's `brand_new_kind`.

```scrut
$ cc-sessions jq '. as $t | s::unknown_types | [($t.agent // $t.session[:4]), .type, .l, .count] | s::tsv' a7c3e9f b5a7 b2d4 b9e1 c4e6 d1f3 e5a7 f6b8 a7c3e9b2 aplanner adoes a3d1 acompact aprompt_suggestion a0f1 a9e8 a4c6e8f0 5f6a7b8c 9a0b1c2d "$WF/journal.jsonl" -- -r 2>/dev/null
a7c3\tattachment:brand_new_kind\t77\t1 (escaped)
```

The lists themselves are data for `schema`.

```scrut
$ cc-sessions jq '[(s::known_entry_types | length > 20), (s::known_attachment_types | index(["skill_listing"]) != null), (s::known_system_subtypes | index(["away_summary"]) != null), ("attachment:hook_brand_new" | s::is_known_type), ("system:model_haiku_fallback" | s::is_known_type), ("attachment:brand_new_kind" | s::is_known_type)]' -- -n -c
[true,true,true,true,true,false]
```

## Sub-agents and workflows

`s::agent_calls` lists Agent and Task calls with the agent id their result names (`agentId`, a teammate's `agent_id`, or the id in the result text) and the completion notification linked by `<tool-use-id>`.

```scrut
$ cc-sessions jq '. as $t | s::agent_calls | [$t.session[:4], s::handle, .tool, .subagent_type, .description, .name, .background, .agent_id, .status, .result_l, .notification.l, .notification.status, .notification.result] | s::tsv' a7c3e9f b2d4 b9e1 c4e6 -- -r 2>/dev/null
a7c3\tL60\tAgent\tExplore\tSurvey tokenizer tests\t-\ttrue\ta7c3e9b2d4f6a8c01\tasync_launched\t61\t67\tcompleted\tTwo tokenizer tests cover strict mode: test_strict_eof and test_strict_unknown. (escaped)
a7c3\tL62\tAgent\tgeneral-purpose\tPlan the strict-mode rollout\tplanner\tfalse\taplanner-5e1f0a2b3c4d5e6f\tteammate_spawned\t63\t-\t-\t- (escaped)
b2d4\tL11\tAgent\tExplore\tCheck header paths\t-\tfalse\ta4c6e8f0a2b4c6d8e\tcompleted\t12\t-\t-\t- (escaped)
b9e1\tL3\tAgent\tExplore\tCheck header paths\t-\tfalse\ta4c6e8f0a2b4c6d8e\tcompleted\t4\t-\t-\t- (escaped)
c4e6\tL4\tTask\tExplore\tLocate config loader\t-\tfalse\t5f6a7b8c\tcompleted\t7\t-\t-\t- (escaped)
```

Without `toolUseResult` the agent id comes from the result text.

```scrut
$ cc-sessions jq '.rows |= map(del(.e.toolUseResult)) | [s::agent_calls | .agent_id]' a7c3e9f -- -c
["a7c3e9b2d4f6a8c01","aplanner-5e1f0a2b3c4d5e6f"]
```

A call runs in the background also when `run_in_background` is stored as the string `"true"` (FOXTROT L40).

```scrut
$ cc-sessions jq 's::agent_calls | [s::handle, .background] | s::tsv' f0d2 -- -r
L40\ttrue (escaped)
```

`s::workflow_calls` lists Workflow calls with their run id, task id, stored transcript directory and completion.

```scrut
$ cc-sessions jq 's::workflow_calls | [s::handle, .name, .run_id, .task_id, .status, .result_l, .notification.l, .notification.status, .notification.result, (.transcript_dir | split("/") | last)] | s::tsv' a7c3e9f -- -r
L64\tfixture-scan\twf_5d1c9a7e-3b2\tw3k9p2m7z\tasync_launched\t65\t68\tcompleted\t{"status":"ok","findings":1}\twf_5d1c9a7e-3b2 (escaped)
```

`s::notifications` parses background completions.

```scrut
$ cc-sessions jq 's::notifications | [s::handle, .tool_use_id, .task_id, .status, .summary, (.output_file | split("/") | last)] | s::tsv' a7c3e9f -- -r
L67\ttoolu_01FxAlpha000000000000011\ta7c3e9b2d4f6a8c01\tcompleted\tAgent "Survey tokenizer tests" completed\ta7c3e9b2d4f6a8c01.output (escaped)
L68\ttoolu_01FxAlpha000000000000013\tw3k9p2m7z\tcompleted\tWorkflow "fixture-scan" completed\tw3k9p2m7z.output (escaped)
```

From 2.1.31x a completion can arrive as a `queued_command` attachment with `commandMode` `task-notification` instead of
a user entry. It is read the same way, links to its call, and is `notification` content.

```scrut
$ queued='.rows |= map(if .l == 67 then .e = {type: "attachment", uuid: .e.uuid, timestamp: .e.timestamp, attachment: {type: "queued_command", commandMode: "task-notification", origin: {kind: "task-notification"}, prompt: .e.message.content}} else . end)'
> cc-sessions jq "$queued"' | (s::notifications | [s::handle, .tool_use_id, .status] | s::tsv), ([s::agent_calls | .notification.l] | tojson), ([s::content | select(.kind == "notification") | s::handle] | join(" "))' a7c3e9f -- -r
L67\ttoolu_01FxAlpha000000000000011\tcompleted (escaped)
L68\ttoolu_01FxAlpha000000000000013\tcompleted (escaped)
[67,null]
L67 L68
```

A notification without `<tool-use-id>` links by `<task-id>`.

```scrut
$ cc-sessions jq '.rows |= map(if .l == 67 then .e.message.content |= sub("<tool-use-id>[^<]*</tool-use-id>\n"; "") else . end) | [s::agent_calls | .notification.l]' a7c3e9f -- -c
[67,null]
```

`s::completions` reads every completion block, the ones a session was handed (notification entries and queued
commands) first, then those that exist only as a `queue-operation` enqueue. A 2.0.x `<agent-notification>` is keyed by
`<agent-id>`, read as its task id; ECHO L10 holds two.

```scrut
$ cc-sessions jq 's::completions | [s::handle, .tool_use_id, .task_id, .status] | s::tsv' e2c4 a7c3e9f -- -r
L10\t-\ta1d2e3f\tcompleted (escaped)
L10\t-\ta4b5c6d\tcompleted (escaped)
L8\t-\ta7e8f9a\tcompleted (escaped)
L67\ttoolu_01FxAlpha000000000000011\ta7c3e9b2d4f6a8c01\tcompleted (escaped)
L68\ttoolu_01FxAlpha000000000000013\tw3k9p2m7z\tcompleted (escaped)
```

A call links to the completion with its tool-use id, else to the first one after it with its agent or task id.

```scrut
$ cc-sessions jq '[s::agent_calls | .notification.l]' e2c4 -- -c
[10,10,8,null,null,null]
```

Agent calls also carry a teammate's team and name, whether the user interrupted the call, and the output tokens that
a finished call reports for the agent's final message.

```scrut
$ cc-sessions jq '. as $t | s::agent_calls | [$t.session[:4], s::handle, .agent_id, .team_name, .teammate_name, .interrupted, .reported_output] | s::tsv' d5e7 e2c4 -- -r
d5e7\tL4\ta1e3c5a7b9d1f3e5a\t-\t-\tfalse\t56 (escaped)
d5e7\tL6\treviewer@session-d5e7f9a1\tsession-d5e7f9a1\treviewer\tfalse\t- (escaped)
d5e7\tL8\tfixer@session-d5e7f9a1\tsession-d5e7f9a1\tfixer\tfalse\t- (escaped)
d5e7\tL10\t-\t-\t-\ttrue\t- (escaped)
e2c4\tL2\ta1d2e3f\t-\t-\tfalse\t- (escaped)
e2c4\tL4\ta4b5c6d\t-\t-\tfalse\t- (escaped)
e2c4\tL6\ta7e8f9a\t-\t-\tfalse\t- (escaped)
e2c4\tL11\ta0b1c2d\t-\t-\tfalse\t900 (escaped)
e2c4\tL13\ta0b1c2d\t-\t-\tfalse\t650 (escaped)
e2c4\tL15\t-\t-\t-\ttrue\t- (escaped)
```

`s::lifecycle_status($run_status; $end)` is the status of what a call started, the first that applies: the run record's
status, the notification's, the call's own outcome (a finished call, an error, a denial, an interrupt), the
transcript's end, else unknown.

```scrut
$ cc-sessions jq '({status: "completed"} | s::lifecycle_status(null; null)),
>   ({status: "async_launched", notification: {status: "killed"}} | s::lifecycle_status(null; "completed")),
>   ({status: "async_launched"} | s::lifecycle_status(null; "completed")),
>   ({status: "error", interrupted: true} | s::lifecycle_status(null; null)),
>   ({status: "error"} | s::lifecycle_status(null; null)),
>   ({status: "denied"} | s::lifecycle_status(null; null)),
>   ({status: "teammate_spawned"} | s::lifecycle_status(null; null)),
>   ({status: "async_launched", notification: {status: "completed"}} | s::lifecycle_status("failed"; null)),
>   (null | s::lifecycle_status(null; "failed"))' -- -n -r | paste -s -d ' ' -
completed killed completed killed failed denied unknown failed failed
```

`s::end_status` reads a transcript's end: completed when its last message stopped, failed on an API error, else null.

```scrut
$ cc-sessions jq '[.agent, s::end_status] | s::tsv' a7c3e9b2 a2b4d6f8 a4b5c6d -- -r
a7c3e9b2d4f6a8c01\tcompleted (escaped)
a2b4d6f8a0c2e4a6b\t- (escaped)
a4b5c6d\t- (escaped)
```

`s::teammate` is a teammate's team and name: from its meta, or, for a split-pane teammate's own session, from the
`teamName` and `agentName` its entries carry. A split-pane teammate's session is of kind `teammate`.

```scrut
$ cc-sessions jq '[.agent // .session, (s::teammate | if . then "\(.name)@\(.team)" else null end), s::agent_kind] | s::tsv' areviewer f3a5 aplanner a1e3 d5e7 -- -r
areviewer-1a2b3c4d5e6f7a8b\treviewer@session-d5e7f9a1\tteammate (escaped)
f3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\tfixer@session-d5e7f9a1\tteammate (escaped)
aplanner-5e1f0a2b3c4d5e6f\tplanner@session-a7c3e9f1\tteammate (escaped)
a1e3c5a7b9d1f3e5a\t-\tagent (escaped)
d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13\t-\t- (escaped)
```

`s::matching_call` links a teammate to its spawning call by team and name when the call names no file. The agent the
reviewer started has its call in the reviewer's transcript, so no call of the session links it.

```scrut
$ cc-sessions jq '(.[0] | [s::agent_calls]) as $calls | .[1:][] | [.agent // .session, (s::matching_call($calls) | if . then s::handle else "-" end)] | s::tsv' d5e7 areviewer f3a5 a5c7 -- -s -r
areviewer-1a2b3c4d5e6f7a8b\tL6 (escaped)
f3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\tL8 (escaped)
a5c7e9a1b3c5d7e9f\t- (escaped)
```

## Output tokens that are lower bounds

Claude Code 2.0.50 through 2.1.56 often wrote a message's last entry before its output was counted.
`s::partial_output_version` names those versions; `s::partial_output_versions` lists them among a transcript's
assistant entries; `s::lower_bound_notice` is the notice for an array of them, and nothing for none.

```scrut
$ cc-sessions jq '"2.0.49", "2.0.50", "2.1.37", "2.1.56", "2.1.59", "2.1.314", "2.0.65-beta", "unknown" | [., s::partial_output_version] | s::tsv' -- -n -r
2.0.49\tfalse (escaped)
2.0.50\ttrue (escaped)
2.1.37\ttrue (escaped)
2.1.56\ttrue (escaped)
2.1.59\tfalse (escaped)
2.1.314\tfalse (escaped)
2.0.65-beta\ttrue (escaped)
unknown\tfalse (escaped)
```

```scrut
$ cc-sessions jq '[.session[:4], (s::partial_output_versions | join(","))] | s::tsv' e2c4 c4e6 a7c3e9f b2d4 -- -r
> cc-sessions jq '["2.1.37", "2.0.65", "2.1.37", "2.0.51"] | s::lower_bound_notice' -- -n -r; cc-sessions jq '[] | s::lower_bound_notice' -- -n -r; echo end
e2c4\t2.0.65 (escaped)
c4e6\t2.0.76 (escaped)
a7c3\t- (escaped)
b2d4\t- (escaped)
cc-sessions: output tokens are lower bounds for messages written by Claude Code 2.0.51, 2.0.65, 2.1.37: versions 2.0.50 through 2.1.56 often did not record a message's final output count
end
```

Forks: the parent's `launchedAgentId`, and the agent's `fork-context-ref`.

```scrut
$ cc-sessions jq '[s::fork_launches]' a7c3e9f && cc-sessions jq 's::fork_ref' adoes a7c3e9b2
[{"l":72,"agent_id":"adoes-the-lexer-0a1b2c3d4e5f6a7b","ts":"2026-10-30T10:26:42.198Z"}]
{"l":1,"parent_session":"a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e","parent_last_uuid":"e0a00043-0000-4000-8000-000000000043"}
null
```

`s::agent_kind` names an agent transcript's kind, the first that applies of internal, teammate (meta `taskKind`), fork
(meta `isFork` or a `fork-context-ref`), flat, workflow-agent and agent; a main transcript has none.

```scrut
$ cc-sessions jq '[.agent // .session[:4], s::agent_kind] | s::tsv' a7c3e9f a7c3e9b2 aplanner adoes a3d1 acompact a0f1 5f6a7b8c 9a0b1c2d a4c6e8f0 -- -r
a7c3\t- (escaped)
a7c3e9b2d4f6a8c01\tagent (escaped)
aplanner-5e1f0a2b3c4d5e6f\tteammate (escaped)
adoes-the-lexer-0a1b2c3d4e5f6a7b\tfork (escaped)
a3d1e5f7a9b0c2d4e\tinternal (escaped)
acompact-3f9a1c\tinternal (escaped)
a0f1e2d3c4b5a6978\tworkflow-agent (escaped)
5f6a7b8c\tflat (escaped)
9a0b1c2d\tinternal (escaped)
a4c6e8f0a2b4c6d8e\tagent (escaped)
```

A fork without its meta file is still a fork, through its `fork-context-ref` line.

```scrut
$ cc-sessions jq '.meta = null | s::agent_kind' adoes -- -r
fork
```

`s::journal` reads a workflow run's `journal.jsonl`: each agent's label, phase and result.

```scrut
$ cc-sessions jq 's::journal | [.agent_id, .key[:6], .label, .phase, .started_l, .result_l, (.result | if type == "string" then . else tojson end)] | s::tsv' "$WF/journal.jsonl" -- -r
a0f1e2d3c4b5a6978\tv2:3c1\tscan\tScan\t2\t3\tScanned 3 files; one parser symbol found. (escaped)
a9e8d7c6b5a4f3e21\tv2:7d9\treport\tReport\t4\t5\t{"finding":"CONTENT_TERM_ALPHA is parsed leniently","severity":"low"} (escaped)
```

`s::delegation` is an agent transcript's delegation prompt; `s::agent_result` its result: the last structured output, else the last assistant text.

```scrut
$ cc-sessions jq '[.agent, (s::delegation | s::handle, (.text | s::trunc(30))), (s::agent_result | s::handle, (.text | s::trunc(40)))] | s::tsv' a7c3e9b2 aplanner adoes a0f1 a9e8 a3d1 5f6a7b8c -- -r
a7c3e9b2d4f6a8c01\tL1\tList the tokenizer tests unde…\tL4\tTwo tokenizer tests cover strict mode: … (escaped)
aplanner-5e1f0a2b3c4d5e6f\tL1\t<teammate-message teammate_id…\tL2\tRollout plan: enable strict mode behind… (escaped)
adoes-the-lexer-0a1b2c3d4e5f6a7b\tL2\tdoes the lexer share the pars…\tL3\tYes: both include tokens.h, so they sha… (escaped)
a0f1e2d3c4b5a6978\tL1\t[Workflow harness — computed …\tL4\tScanned 3 files; one parser symbol foun… (escaped)
a9e8d7c6b5a4f3e21\tL1\t[Workflow harness — computed …\tL4\t{"finding":"CONTENT_TERM_ALPHA is parse… (escaped)
a3d1e5f7a9b0c2d4e\tL1\t[cc-sessions:transcripts-fork…\tL2\tOne session loaded alpha-helper. (escaped)
5f6a7b8c\tL1\tLocate the config loader in t…\tL2\tThe loader is config/load.rb. (escaped)
```

`s::matching_call(calls)` finds an agent transcript's call among `s::agent_calls` records: by agent id, by the meta's `toolUseId`, else by delegation prompt text.

```scrut
$ cc-sessions jq '(.[0] | [s::agent_calls]) as $calls | .[1:][] | [.agent, (s::matching_call($calls) | if . then s::handle else "-" end), (s::matching_call($calls | map(.agent_id = null)) | if . then s::handle else "-" end)] | s::tsv' c4e6 5f6a7b8c 9a0b1c2d -- -s -r
5f6a7b8c\tL4\tL4 (escaped)
9a0b1c2d\t-\t- (escaped)
```

```scrut
$ cc-sessions jq '(.[0] | [s::agent_calls] | map(.agent_id = null)) as $calls | .[1] | s::matching_call($calls) | s::handle' a7c3e9f a7c3e9b2 -- -s -r
L60
```

## Finding related files

`cc_run_dir` finds a workflow run's directory in the session directory, else anywhere under the data root (a resumed
session keeps using the original's directory).

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_run_dir "$ALPHA" wf_5d1c9a7e-3b2; cc_run_dir "$BETA" wf_5d1c9a7e-3b2; cc_run_dir "$BETA" wf_nothing || echo "not found $?") | cc_test_rel
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/workflows/wf_5d1c9a7e-3b2
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/workflows/wf_5d1c9a7e-3b2
not found 1
```

`cc_agent_files` lists a session's agent transcripts: nested ones under its directory, and flat-layout ones whose `sessionId` is the session.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_agent_files "$ALPHA.jsonl"; cc_agent_files "$FLAT.jsonl"; cc_agent_files "$RESUMED.jsonl"; echo end) | cc_test_rel | sed 's#<root>/projects/-tmp-sessions-fixture-##'
alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-a3d1e5f7a9b0c2d4e.jsonl
alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-a7c3e9b2d4f6a8c01.jsonl
alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-acompact-3f9a1c.jsonl
alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-adoes-the-lexer-0a1b2c3d4e5f6a7b.jsonl
alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-aplanner-5e1f0a2b3c4d5e6f.jsonl
alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-aprompt_suggestion-8d2e4b.jsonl
alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/workflows/wf_5d1c9a7e-3b2/agent-a0f1e2d3c4b5a6978.jsonl
alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/workflows/wf_5d1c9a7e-3b2/agent-a9e8d7c6b5a4f3e21.jsonl
flat/agent-5f6a7b8c.jsonl
flat/agent-9a0b1c2d.jsonl
end
```

`cc_agent_transcripts` does the same for several ids, with one search of the data root for those not in the session
directory; an id found nowhere prints nothing.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_agent_transcripts "$RESUMED" a4c6e8f0a2b4c6d8e nosuchagent; cc_agent_transcripts "$ALPHA" a7c3e9b2d4f6a8c01 a0f1e2d3c4b5a6978) | cc_test_rel | sed 's#<root>/projects/-tmp-sessions-fixture-##'
beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e/subagents/agent-a4c6e8f0a2b4c6d8e.jsonl
alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-a7c3e9b2d4f6a8c01.jsonl
alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/workflows/wf_5d1c9a7e-3b2/agent-a0f1e2d3c4b5a6978.jsonl
```

`cc_session_agent_files` is a session's agents as every command reads them: `cc_agent_files`, then the transcripts its
Agent and Workflow calls name that sit elsewhere under the data root (RESUMED's agent lives in BETA's directory);
`--journals` adds each workflow run's `journal.jsonl`.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_session_agent_files "$RESUMED.jsonl"; cc_session_agent_files "$ALPHA.jsonl" --journals | grep -c -e '/agent-' -e '/journal.jsonl$'; cc_session_agent_files "$ALPHA.jsonl" --journals | grep 'journal'; cc_session_agent_files "$GAMMA.jsonl"; echo end) | cc_test_rel | sed 's#<root>/projects/-tmp-sessions-fixture-##'
beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e/subagents/agent-a4c6e8f0a2b4c6d8e.jsonl
9
alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/workflows/wf_5d1c9a7e-3b2/journal.jsonl
end
```

`cc_teammate_sessions` finds the sessions of the split-pane teammates a session spawned: the main transcripts in its
project directory whose entries carry the `teamName` and `agentName` of a spawn result's `<name>@<team>`. The in-process
teammate's id names no session there. `cc_session_agent_files` includes them.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_teammate_sessions "$P/-tmp-sessions-fixture-delta/d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13.jsonl"; cc_teammate_sessions "$ALPHA.jsonl"; echo end) | cc_test_rel
> (. "$CC_TEST_ROOT/lib/common.sh"; cc_session_agent_files "$P/-tmp-sessions-fixture-delta/d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13.jsonl") | cc_test_rel | sed 's#<root>/projects/-tmp-sessions-fixture-delta/##'
<root>/projects/-tmp-sessions-fixture-delta/f3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f.jsonl
end
d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13/subagents/agent-a1e3c5a7b9d1f3e5a.jsonl
d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13/subagents/agent-a2b4d6f8a0c2e4a6b.jsonl
d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13/subagents/agent-a5c7e9a1b3c5d7e9f.jsonl
d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13/subagents/agent-areviewer-1a2b3c4d5e6f7a8b.jsonl
d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13/subagents/workflows/wf_8c2e4a6b-1d3/agent-a6d8f0b2c4e6a8b0d.jsonl
f3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f.jsonl
```

A project directory can hold thousands of flat agent files; reading their `sessionId`s takes one process, not one per
file.

```scrut
$ M=$CC_TEST_TMP/many/projects/-tmp-many && mkdir -p "$M" && printf '{"type":"user","sessionId":"s1"}\n' > "$M/s1.jsonl"
> for i in $(seq 1 3000); do printf '{"type":"user","sessionId":"other"}\n' > "$M/agent-$(printf '%08x' "$i").jsonl"; done
> printf '{"type":"user","sessionId":"s1"}\n' > "$M/agent-a1b2c3d4.jsonl"
```

```scrut {timeout: 4s}
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_agent_files "$M/s1.jsonl") | cc_test_rel "$M"
<root>/agent-a1b2c3d4.jsonl
```

## Labels and origin

`s::label_of`: the last custom-title, else the last ai-title with a space, else agent-name, else a legacy summary, else the first human input (truncate it with `s::trunc`).

```scrut
$ cc-sessions jq '. as $t | s::label_of | [$t.session[:4], .source, .l, .text] | s::tsv' a7c3e9f d1f3 e5a7 f6b8 b9e1 b2d4 c4e6 b5a7 -- -r 2>/dev/null
a7c3\tcustom-title\t79\talpha fixture session (escaped)
d1f3\tai-title\t4\tRename the report generator skill (escaped)
e5a7\tai-title\t2\tShow the release notes (escaped)
f6b8\tprompt\t2\tList the files with spaces in their names. (escaped)
b9e1\tprompt\t1\tFind where the header should live. (escaped)
b2d4\tprompt\t2\tSummarise the beta build failures. (escaped)
c4e6\tsummary\t1\tFlat era config loader search (escaped)
b5a7\tai-title\t1\tStub session title (escaped)
```

Single-token ai-titles are plan slugs; without a sentence title, agent-name comes next.

```scrut
$ cc-sessions jq '.rows |= map(select(.e.type != "ai-title" or .l == 9)) | s::label_of | [.source, .l, .text] | s::tsv' e5a7 -- -r
agent-name\t10\trelease-notes-plan (escaped)
```

An agent's label is its meta description or name, else its journal label, else its delegation prompt.

```scrut
$ cc-sessions jq '. as $t | s::label_of | [$t.agent, .source, .text] | s::tsv' a7c3e9b2 aplanner adoes a3d1 a0f1 acompact aprompt_suggestion 5f6a7b8c -- -r
a7c3e9b2d4f6a8c01\tmeta\tSurvey tokenizer tests (escaped)
aplanner-5e1f0a2b3c4d5e6f\tmeta\tPlan the strict-mode rollout (escaped)
adoes-the-lexer-0a1b2c3d4e5f6a7b\tmeta\tdoes the lexer share the parser's token table? (escaped)
a3d1e5f7a9b0c2d4e\tmeta\tAnswer a transcripts question (escaped)
a0f1e2d3c4b5a6978\tmeta\tscan (escaped)
acompact-3f9a1c\tprompt\tYour task is to create a detailed summary of the conversation so far. (escaped)
aprompt_suggestion-8d2e4b\tprompt\t[SUGGESTION MODE: Suggest what the user might naturally type next into Claude Code.] (escaped)
5f6a7b8c\tprompt\tLocate the config loader in the flat project. (escaped)
```

```scrut
$ cc-sessions jq '.meta = null | s::agent_label("scan-from-journal"), s::agent_label(null) | [.source, .text] | s::tsv' a0f1 -- -r
journal\tscan-from-journal (escaped)
prompt\t[Workflow harness — computed task] Scan src for CONTENT_TERM_ALPHA and summarise where it is defined. (escaped)
```

`s::origin`: `sdk` when an entrypoint starts with `sdk` or a prompt's `promptSource` is `sdk`, else the entrypoint, else `cli`.

```scrut
$ cc-sessions jq '[.session[:4], s::origin] | s::tsv' a7c3e9f d1f3 c4e6 b5a7 -- -r && cc-sessions jq '(.rows |= map(del(.e.entrypoint)) | s::origin), (.rows |= map(if .e.entrypoint then .e.entrypoint = "claude-desktop" else . end) | s::origin)' d1f3 e5a7 -- -r
a7c3\tcli (escaped)
d1f3\tsdk (escaped)
c4e6\tcli (escaped)
b5a7\tcli (escaped)
sdk
sdk
cli
claude-desktop
```

`s::is_stub` is true without any user or assistant entry.

```scrut
$ cc-sessions jq '[.session[:4], .agent, s::is_stub] | s::tsv' b5a7 a7c3e9f a7c3e9b2 -- -r
b5a7\t-\ttrue (escaped)
a7c3\t-\tfalse (escaped)
a7c3\ta7c3e9b2d4f6a8c01\tfalse (escaped)
```

`s::cwds` lists the working directories in first-use order (the first is `s::first_cwd`); `s::session_ids` and `s::versions` likewise; `s::span` is the earliest and latest timestamp, whatever the file order.

```scrut
$ cc-sessions jq '[s::first_cwd, (s::cwds | join(" | ")), (s::session_ids | map(.[:4]) | join(",")), (s::versions | join(",")), s::span.first, s::span.last] | s::tsv' e5a7 f6b8 b9e1 b2d4 c4e6 b5a7 -- -r 2>/dev/null
/tmp/sessions-fixture/reloc\t/tmp/sessions-fixture/reloc | /tmp/sessions-fixture/elsewhere\te5a7\t2.1.312\t2026-10-28T11:30:03.950Z\t2026-10-28T11:30:15.581Z (escaped)
/tmp/sessions fixture/under_score\t/tmp/sessions fixture/under_score\tf6b8\t2.1.314\t2026-10-27T11:55:03.950Z\t2026-10-27T11:55:08.598Z (escaped)
/tmp/sessions-fixture/beta\t/tmp/sessions-fixture/beta\tb2d4,b9e1\t2.1.206\t2026-07-15T09:01:03.950Z\t2026-07-20T14:00:05.781Z (escaped)
/tmp/sessions-fixture/beta\t/tmp/sessions-fixture/beta\tb2d4\t2.1.206\t2026-07-15T09:00:00.120Z\t2026-07-15T09:05:05.198Z (escaped)
/tmp/sessions-fixture/flat\t/tmp/sessions-fixture/flat\tc4e6\t2.0.76\t2026-01-03T11:40:03.950Z\t2026-01-03T11:40:24.198Z (escaped)
-\t-\tb5a7\t-\t-\t- (escaped)
```

## Compactions, entries and errors

`s::compactions` lists compact boundaries with their metadata and the summary entry that follows.

```scrut
$ cc-sessions jq 's::compactions' a7c3e9f
{"l":36,"trigger":"manual","pre_tokens":21760,"post_tokens":9120,"dropped":12640,"duration_ms":21000,"summary_l":37,"logical_parent":"e0a0001e-0000-4000-8000-00000000001e","ts":"2026-10-30T10:01:12.717Z"}
```

`s::lookup(ref)` finds rows by handle, uuid, `toolu_…` id (the call and its result) or message id.

```scrut
$ cc-sessions jq '[s::lookup("L34", "e0a0001e-0000-4000-8000-00000000001e", "toolu_01FxAlpha000000000000002", "msg_01FxAlpha000000000000002", "e0a0eeee-5555-4000-8000-000000000001", "nothing") | .l]' a7c3e9f -- -c
[34,34,15,16,14,15,17,56]
```

`s::ancestors(row)` walks `parentUuid`, and `logicalParentUuid` across a compaction; `s::children(uuid)` goes one step down.

```scrut
$ cc-sessions jq '[s::lookup("L37") as $r | s::ancestors($r) | .l][:4], ("children: \([s::children("e0a0001e-0000-4000-8000-00000000001e") | .l])")' a7c3e9f -- -c
[36,34,33,32]
"children: [35]"
```

`s::api_errors` lists API error messages.

```scrut
$ cc-sessions jq '.rows |= map(if .l == 56 then .e.isApiErrorMessage = true | .e.apiErrorStatus = 529 else . end) | [s::api_errors | [.l, .status, .text]]' a7c3e9f -- -c
[[56,529,"No response requested."]]
```

## Reading selected lines

Cross-session commands read only the lines rg selects, as `<path>TAB<line>TAB<json>`. `s::path_info` classifies a
path as `cc_path_info` does (a flat agent's session is its `sessionId`, so it is null here).

```scrut
$ cc-sessions jq '"/r/p/s1.jsonl", "/r/p/s1/subagents/agent-a1.jsonl", "/r/p/s1/subagents/workflows/wf_1/agent-a2.jsonl", "/r/p/s1/subagents/workflows/wf_1/journal.jsonl", "/r/p/agent-5f6a7b8c.jsonl" | s::path_info | [.kind, .session, .agent, .run, .session_dir, .project_dir] | s::tsv' -- -n -r
main\ts1\t-\t-\t/r/p/s1\t/r/p (escaped)
subagent\ts1\ta1\t-\t/r/p/s1\t/r/p (escaped)
workflow-agent\ts1\ta2\twf_1\t/r/p/s1\t/r/p (escaped)
journal\ts1\t-\twf_1\t/r/p/s1\t/r/p (escaped)
flat\t-\t5f6a7b8c\t-\t-\t/r/p (escaped)
```

`s::group_lines` groups such lines by file, and `s::from_lines` makes a transcript object of one file's lines, so every
`s::` rule runs on them; `s::skipped_notice` reports its unparseable lines as `s::transcripts` does.

```scrut
$ printf '%s\t%s\t%s\n' /r/p/s1.jsonl 4 '{"type":"user","uuid":"u4","message":{"content":"Hello there."}}' /r/p/s1.jsonl 2 '{"type":"ai-title","aiTitle":"A short title"}' /r/p/s1.jsonl 9 '{"trunc' /r/p/agent-5f6a7b8c.jsonl 1 '{"type":"user","sessionId":"s1","message":{"content":"Go."}}' > selected.tsv
> cc-sessions jq 's::group_lines(inputs) | to_entries[] | .key as $p | .value | s::from_lines($p; {mtime: 1793354400, bytes: 512}) | s::skipped_notice, ([.kind, .session, ([.rows[].l] | tojson), (.skipped | tojson), .bytes, s::label_of.text] | s::tsv)' - -- -n -r < selected.tsv 2>&1
cc-sessions: skipped 1 unparseable line in /r/p/s1.jsonl: L9
main\ts1\t[2,4]\t[9]\t512\tA short title (escaped)
flat\ts1\t[1]\t[]\t512\tGo. (escaped)
```

`s::line_json` is the JSON of one such line from its tab-split pieces, joined again when the JSON holds a raw tab.

```scrut
$ cc-sessions jq '["/r/p/s1.jsonl","4","{\"a\":1}"], ["/r/p/s1.jsonl","5","{\"a\":","1}"] | s::line_json' -- -n -c
"{\"a\":1}"
"{\"a\":\t1}"
```

`s::candidates` reads the candidate list a cross-session command passes: `<pos>TAB<mtime>TAB<bytes>TAB<path>` lines.

```scrut
$ cc-sessions jq 's::candidates("0\t1793354400\t2458\t/r/p/s1.jsonl\n1\t1793350000\t12\t/r/p/s 2.jsonl\n")[] | [.pos, .mtime, .bytes, .path, .id] | s::tsv' -- -n -r
0\t1793354400\t2458\t/r/p/s1.jsonl\ts1 (escaped)
1\t1793350000\t12\t/r/p/s 2.jsonl\ts 2 (escaped)
```

`s::agent_map` reads the `<main>TAB<file>` lines that map agent transcripts to their sessions into each session's agent
files, sorted and without repeats; `s::unreadable_notice(id)` reports a session a rule failed on and emits nothing.

```scrut
$ cc-sessions jq 's::agent_map("/r/p/s1.jsonl\t/r/p/s1/subagents/agent-b.jsonl\n/r/p/s2.jsonl\t/r/p/agent-5f.jsonl\n/r/p/s1.jsonl\t/r/p/s1/subagents/agent-a.jsonl\n/r/p/s1.jsonl\t/r/p/s1/subagents/agent-b.jsonl\n")' -- -n -c
> cc-sessions jq '"boom" | s::unreadable_notice("s1")' -- -n -c 2>&1
{"/r/p/s1.jsonl":["/r/p/s1/subagents/agent-a.jsonl","/r/p/s1/subagents/agent-b.jsonl"],"/r/p/s2.jsonl":["/r/p/agent-5f.jsonl"]}
cc-sessions: left out session s1, which could not be read (boom)
```

`s::display(width)` shows text on one line: whitespace runs as one space, cut to the width with `…`; 0 keeps it exact.

```scrut
$ cc-sessions jq '"  Two\n  lines,\tspaced  " | s::display(100), s::display(9), s::display(0)' -- -n -c
"Two lines, spaced"
"Two line…"
"  Two\n  lines,\tspaced  "
```

`s::one_space` makes every whitespace run of a string one space.

```scrut
$ cc-sessions jq '"a \t\n b  c\u00a0d e\r\nf" | s::one_space' -- -n -c
"a b c d e f"
```

Smart case: text with no capital letter matches any case (`s::smart_insensitive(regex)`; a regex's backslash escapes
do not count, while in literal text a backslash is a character). `s::literal_regex` makes literal text an Oniguruma
regex, and `s::first_match(re; ci)` finds its first match.

```scrut
$ cc-sessions jq '["make test", "Make", "\\d+ files", "c:\\Users"] | map(s::smart_insensitive(true)), map(s::smart_insensitive(false))' -- -n -c
> cc-sessions jq '"a.b (c)" | s::literal_regex as $re | ["xa.b (c)", "axb (c)"] | map(s::first_match($re; false) | if . then .offset else null end)' -- -n -c
[true,false,true,true]
[true,false,true,false]
[1,null]
```

`s::rg_literal` makes literal text a Rust regex for rg that matches it inside a JSON line, where quotes, backslashes and
control characters are escaped; `s::rg_cwd` matches a cwd equal to a path or under it, and `s::under` tests one.

```scrut
$ cc-sessions jq '"please run \"make test\" now" | s::rg_literal' -- -n -r > re.txt && rg -c -f re.txt "$ALPHA.jsonl"
> cc-sessions jq '"/tmp/sessions-fixture/alpha" | s::rg_cwd' -- -n -r > cwd.txt && rg -l -f cwd.txt "$P" | wc -l | tr -d ' '
> cc-sessions jq '["/tmp/a", "/tmp/a/b", "/tmp/ab", "/x"] | map(s::under("/tmp/a"))' -- -n -c
1
9
[true,true,false,false]
```

`s::content_attachment_types` and `s::content_system_subtypes` name the attachment types and system subtypes that can
hold content (any `hook_*` attachment too); every content record of an attachment or system entry has one of them.

```scrut
$ cc-sessions jq '(s::content_attachment_types + s::content_system_subtypes) as $content | ([s::entries[] | {key: "\(.l)", value: .e}] | from_entries) as $by | s::content | $by["\(.l)"] | select(.type == "attachment" or .type == "system") | (.attachment.type // .subtype) | select((startswith("hook_") or (. as $x | $content | index([$x]))) | not)' a7c3e9f c7d9 a9e8 -- -r && echo checked
checked
```

## Shell helpers for commands

Cross-session commands share these. `cc_mtime_bound` reads a `--since`/`--until` value as `<from> <to>` epoch seconds
for comparing modified times; a handle is a usage error there.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_mtime_bound --since 2026-10-30; CC_SESSIONS_COMMAND=list; out=$(cc_mtime_bound --until L5 2>&1); printf '%s\nexit %s\n' "$out" "$?")
1793318400 1793404799
cc-sessions: --until L5 is a handle, which only per-session records have; pass a timestamp (2026-10-30T10:00:04Z, 2026-10-30) or an age (7d) to compare modified times; see cc-sessions list --help
exit 2
```

`cc_sessions_by_mtime <from> <to>` lists the main transcripts modified inside the bounds (empty for none), newest
first, as `<pos>TAB<mtime>TAB<bytes>TAB<path>`.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_sessions_by_mtime '' '' | awk -F '\t' '{ n = split($4, p, "/"); print $1, substr(p[n], 1, 4) }' | paste -s -d ' ' -; cc_sessions_by_mtime 1793318400 1793404799 | cut -f 1,2)
0 b5a7 1 a7c3 2 d1f3 3 e5a7 4 f6b8 5 c7d9 6 b9e1 7 b2d4 8 c4e6 9 e2c4 10 d5e7 11 f3a5 12 f0d2
0\t1793361600 (escaped)
1\t1793359800 (escaped)
```

`cc_corpus_agent_map [--journals]` maps every agent transcript under the data root (and each run journal) to its main
transcript, as `<main>TAB<file>`: nested ones by their directory, flat ones by their `sessionId`.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_corpus_agent_map | wc -l | tr -d ' '; cc_corpus_agent_map --journals | wc -l | tr -d ' '; cc_corpus_agent_map | grep -- '-flat/' | sort | cc_test_rel)
21
23
<root>/projects/-tmp-sessions-fixture-flat/c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a.jsonl\t<root>/projects/-tmp-sessions-fixture-flat/agent-5f6a7b8c.jsonl (escaped)
<root>/projects/-tmp-sessions-fixture-flat/c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a.jsonl\t<root>/projects/-tmp-sessions-fixture-flat/agent-9a0b1c2d.jsonl (escaped)
```

`cc_rg <rg-option>... -- <file>...` runs rg over any number of files without hitting the argument limit, and finding
nothing is not an error; `cc_lines <text>` puts the non-empty lines of a text in the array `CC_LINES`, unglobbed.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_rg -l -e CONTENT_TERM_ALPHA -- "$ALPHA.jsonl" "$BETA.jsonl" | cc_test_rel; cc_rg -l -e NOTHING_MATCHES -- "$BETA.jsonl"; echo "exit $?"; cc_lines $'a b\n\n*'; printf '[%s]\n' "${CC_LINES[@]}")
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl
exit 0
[a b]
[*]
```

`cc_abs_path <path>` makes a path argument absolute (`~/` expanded, trailing slashes dropped) without resolving links.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cd /tmp && cc_abs_path ./x/y//; cc_abs_path '~/a/' | cc_test_rel "$HOME"; cc_abs_path /)
/tmp/x/y
<root>/a
/
```

`cc_module_program <name> <call>` is the program a command runs: the text of `lib/<name>.jq`, then the call. A command
module is never imported, because jq 1.8.2 aborts when an imported module calls an `s::` function that calls another.

```scrut
$ L=$CC_TEST_TMP/modlib && mkdir -p "$L" "$CC_TEST_TMP/jq17" && cp "$CC_TEST_ROOT"/lib/* "$L"/ && ln -sf /usr/bin/jq "$CC_TEST_TMP/jq17/jq"
> printf '%s\n' 'import "sessions" as s;' 'def count: s::entries | length;' > "$L/probe.jq"
> (. "$L/common.sh"; cc_jq_program "$(cc_module_program probe 's::transcripts | count')" -- "$BETA.jsonl" 2>/dev/null; PATH="$CC_TEST_TMP/jq17:$PATH" cc_jq_program "$(cc_module_program probe 's::transcripts | count')" -- "$BETA.jsonl" 2>/dev/null)
15
15
```

The wrapper's own cost grows in proportion to the files, with no process per file: 3000 agent transcripts with their
meta files read in a few seconds, where work that grew with the square of their number would take minutes.

```scrut
$ A=$CC_TEST_TMP/metas/projects/-tmp-m/s1/subagents && mkdir -p "$A"
> for i in $(seq 1 3000); do printf -v id 'a%016x' "$i"; printf '{"type":"user","sessionId":"s1","message":{"content":"x"}}\n' > "$A/agent-$id.jsonl"; printf '{"agentType":"Explore","description":"d\\t%s"}\n' "$i" > "$A/agent-$id.meta.json"; done
```

```scrut {timeout: 30s}
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_jq_program 'import "sessions" as s; [s::transcripts | .meta.description, .bytes] | [length, .[-2:]]' -c -- "$A"/*.jsonl)
[6000,["d\t3000",59]]
```

`cc_one_session <count>` is the usage error of a command that reads one `<session>` and got none or several.

```scrut {output_stream: stderr}
$ (. "$CC_TEST_ROOT/lib/common.sh"; CC_SESSIONS_COMMAND=tools; cc_one_session 1 && echo one >&2; (cc_one_session 0); cc_one_session 3)
one
cc-sessions: tools needs a <session>; pass a session id or a prefix of 4 or more characters, a path, wf_<run-id> or current; see cc-sessions tools --help
cc-sessions: tools takes one <session>, got 3; run it once per session; see cc-sessions tools --help
[2]
```

`cc_resolve_all` resolves every reference into `CC_FILES`, each file once.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_resolve_all a7c3e9f "$ALPHA.jsonl" a0f1; printf '%s\n' "${CC_FILES[@]}" | cc_test_rel)
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/workflows/wf_5d1c9a7e-3b2/agent-a0f1e2d3c4b5a6978.jsonl
```

`cc_need_value "$@"` requires a value after an option; `cc_count` reads a whole number; `cc_unknown_option` names the valid options and the `--` escape.

```scrut {output_stream: stderr}
$ (. "$CC_TEST_ROOT/lib/common.sh"; CC_SESSIONS_COMMAND=tools; cc_need_value --name x && echo ok >&2; cc_need_value --name)
> (. "$CC_TEST_ROOT/lib/common.sh"; CC_SESSIONS_COMMAND=tools; cc_count --width 007 >&2; cc_count --width -1)
> (. "$CC_TEST_ROOT/lib/common.sh"; CC_SESSIONS_COMMAND=tools; cc_unknown_option --nmae --name --input --full)
ok
cc-sessions: --name needs a value; pass one after it; see cc-sessions tools --help
7
cc-sessions: --width needs a whole number of 0 or more, got "-1"; pass, for example, --width 20; see cc-sessions tools --help
cc-sessions: unknown option "--nmae" for tools; valid options: --name, --input, --full; to pass text that starts with -, put it after --; see cc-sessions tools --help
[2]
```

## jq 1.7

The library answers the same under jq 1.7 (`/usr/bin/jq`) as under jq 1.8.

```scrut
$ mkdir -p "$CC_TEST_TMP/jq17" && ln -sf /usr/bin/jq "$CC_TEST_TMP/jq17/jq"
> f='[s::totals, s::models, [s::duplicates], [s::user_entries | del(.e)], [s::human_events], [s::outputs], [s::messages | del(.blocks)], [s::tool_calls], [s::skill_events], [s::attributions], [s::content], [s::agent_calls], [s::workflow_calls], [s::notifications], [s::completions], [s::fork_launches], s::fork_ref, s::delegation, s::agent_result, s::label_of, s::origin, s::is_stub, s::cwds, s::span, [s::compactions], [s::unknown_types], s::internal_reason, [s::journal], s::teammate, s::agent_kind, s::end_status, s::partial_output_versions]'
> set -- a7c3e9f b2d4 b9e1 c4e6 d1f3 e5a7 f6b8 b5a7 a7c3e9b2 aplanner adoes a3d1 acompact a0f1 a9e8 5f6a7b8c 9a0b1c2d "$WF/journal.jsonl" d5e7 e2c4 f3a5 areviewer
> cc-sessions jq "$f" "$@" --max-chars 0 > v18.txt 2>/dev/null && PATH="$CC_TEST_TMP/jq17:$PATH" cc-sessions jq "$f" "$@" --max-chars 0 > v17.txt 2>/dev/null
> cmp v18.txt v17.txt && wc -l < v18.txt | tr -d ' '
22
```

```scrut
$ PATH="$CC_TEST_TMP/jq17:$PATH" cc-sessions jq '[s::bound("2026-10-30T10:00:04.781Z"), ("2026-10-30T10:00:04.781Z" | s::ts), ([1,2] | s::tsv), ("ab" | s::trunc(1))]' -- -n -c
[{"from":1793354404,"to":1793354404},"2026-10-30T10:00:04Z","1\t2","…"]
```

Ages work under jq 1.7 too, in `s::bound` and through `cc_bound`.

```scrut
$ PATH="$CC_TEST_TMP/jq17:$PATH" cc-sessions jq '"90s", "7d" | s::bound(.; 1793354400) | 1793354400 - .from' -- -n -c
> (PATH="$CC_TEST_TMP/jq17:$PATH"; . "$CC_TEST_ROOT/lib/common.sh"; cc_bound --since 2h | jq -c 'keys')
90
604800
["from","to"]
```

## Run records and process costs

`cc_run_record` finds a workflow run's record; `s::document` is the single JSON object of a one-line file such as a run record or a `.meta.json`.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cc_run_record "$ALPHA" wf_5d1c9a7e-3b2 | cc_test_rel; cc_run_record "$BETA" wf_5d1c9a7e-3b2 | cc_test_rel; cc_run_record "$BETA" wf_nothing || echo "not found $?")
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/workflows/wf_5d1c9a7e-3b2.json
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/workflows/wf_5d1c9a7e-3b2.json
not found 1
```

```scrut
$ cc-sessions jq 's::document | [.status, .agentCount, (.result | if . then tojson else null end), (.phases // [] | map(.title) | join(",")), .totalTokens, .durationMs] | s::tsv' "$ALPHA/workflows/wf_5d1c9a7e-3b2.json" "$ALPHA/subagents/agent-a7c3e9b2d4f6a8c01.meta.json" -- -r
completed\t2\t{"status":"ok","findings":1}\tScan,Report\t9000\t42000 (escaped)
-\t-\t-\t-\t-\t- (escaped)
```

`s::cost_states` lists `cost-state` entries; each covers one process run.

```scrut
$ cc-sessions jq 's::cost_states | [s::handle, .total_cost_usd, (.models | keys | join(",")), .models["claude-opus-5-5"].inputTokens, .models["claude-opus-5-5"].cacheReadInputTokens, .models["claude-haiku-5-5"].outputTokens] | s::tsv' a7c3e9f -- -r
L83\t0.4321\tclaude-haiku-5-5,claude-opus-5-5\t21\t245300\t230 (escaped)
```

The jq wrapper always hands jq absolute paths.

```scrut
$ (. "$CC_TEST_ROOT/lib/common.sh"; cd "$P/-tmp-sessions-fixture-beta" && cc_jq_program 'import "sessions" as s; s::transcripts | .file' -r -- b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c.jsonl) | cc_test_rel
<root>/projects/-tmp-sessions-fixture-beta/b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c.jsonl
```

`cc-sessions jq -h` needs no data root.

```scrut
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions jq -h | head -n 1
Usage: cc-sessions jq <filter> [<session>|<file>|-]... [-- <jq-option>...]
```
