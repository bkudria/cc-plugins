---
prepend: [setup.md]
---

# cc-sessions entry

Values come from `fixtures/FACTS.md`.

## Help

The synopsis is one index line.

```scrut
$ cc-sessions entry --synopsis | awk '{ print (length($0) <= 120 ? "short" : "long"), $1, $2, $3 }'; cc-sessions --help | grep -c '^  entry <session> <ref>'
short entry <session> <ref>
1
```

Help exits 0 without reading transcripts, stays short, and names the operands, options, fields, width, empty answers and exit codes.

```scrut
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions entry --help > help.txt; echo "exit $?"; [ "$(wc -l < help.txt)" -lt 40 ] && echo short; head -n 1 help.txt
> for w in '<session>' '<ref>' 'toolu_' 'msg_' --full --since --until 'entry  <handle>  <uuid>  <type>  <time>' 'parent  <handle>  <uuid>  <type>  <time>' 2000 '…\[+<n> chars\]' 'up to 20' 'no match' 'Exit status' 'usage error'; do grep -q -e "$w" help.txt || echo "missing $w"; done; echo checked
exit 0
short
Usage: cc-sessions entry <session> <ref> [--full] [--since T] [--until T]
checked
```

## By handle

A small entry: its summary line, the entry as indented JSON, and no parent (titles carry no `parentUuid`, uuid or timestamp).

```scrut
$ cc-sessions entry a7c3e9f L9
entry\tL9\t-\tai-title\t- (escaped)
{
  "type": "ai-title",
  "aiTitle": "Review the parser and run the tests",
  "sessionId": "a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e"
}
```

The first human input: the JSON is the line as written, then the parent chain.

```scrut
$ cc-sessions entry a7c3e9f L4 > l4.txt; head -n 1 l4.txt; tail -n 1 l4.txt; sed '1d;$d' l4.txt | cmp - <(sed -n 4p "$ALPHA.jsonl" | jq .) && echo as-written
entry\tL4\te0a00003-0000-4000-8000-000000000003\tuser\t2026-10-30T10:00:04Z (escaped)
parent\tL3\te0a00002-0000-4000-8000-000000000002\tattachment:hook_success\t2026-10-30T10:00:01Z (escaped)
as-written
```

## By uuid, tool use id and message id

A uuid gives the same answer as the handle of its line.

```scrut
$ cc-sessions entry a7c3e9f e0a00003-0000-4000-8000-000000000003 | cmp - l4.txt && echo same
same
```

A `toolu_…` id gives the tool_use entry and its result entry, then the parents of the first; a string over 2000 characters ends with the count of characters left out.

```scrut
$ cc-sessions entry a7c3e9f toolu_01FxAlpha000000000000002 > t2.txt; grep -E '^(entry|parent)' t2.txt; grep -o -e '…\[+[0-9]* chars\]' t2.txt
entry\tL15\te0a0000b-0000-4000-8000-00000000000b\tassistant\t2026-10-30T10:00:20Z (escaped)
entry\tL16\te0a0000c-0000-4000-8000-00000000000c\tuser\t2026-10-30T10:00:23Z (escaped)
parent\tL14\te0a0000a-0000-4000-8000-00000000000a\tassistant\t2026-10-30T10:00:18Z (escaped)
parent\tL13\te0a00009-0000-4000-8000-000000000009\tuser\t2026-10-30T10:00:16Z (escaped)
parent\tL12\te0a00008-0000-4000-8000-000000000008\tassistant\t2026-10-30T10:00:13Z (escaped)
parent\tL11\te0a00007-0000-4000-8000-000000000007\tassistant\t2026-10-30T10:00:11Z (escaped)
parent\tL10\te0a00006-0000-4000-8000-000000000006\tassistant\t2026-10-30T10:00:09Z (escaped)
parent\tL6\te0a00005-0000-4000-8000-000000000005\tattachment:instructions\t2026-10-30T10:00:06Z (escaped)
parent\tL5\te0a00004-0000-4000-8000-000000000004\tattachment:skill_listing\t2026-10-30T10:00:05Z (escaped)
parent\tL4\te0a00003-0000-4000-8000-000000000003\tuser\t2026-10-30T10:00:04Z (escaped)
parent\tL3\te0a00002-0000-4000-8000-000000000002\tattachment:hook_success\t2026-10-30T10:00:01Z (escaped)
…[+277 chars]
…[+1401 chars]
```

The copies of a call and its result inside `api-request-blob` entries (FOXTROT L30, L31) are not the call or its result,
so the parent chain still follows the tool_use entry.

```scrut
$ cc-sessions entry f0d2 toolu_01FxFoxtrot0000000000003 | grep -E '^(entry|parent)' | cut -f 1,2,4 | paste -s -d ' ' - | sed 's/\t/:/g'
entry:L32:assistant entry:L33:user parent:L29:user parent:L28:user parent:L24:user parent:L21:user parent:L20:user parent:L19:user parent:L18:assistant parent:L13:user parent:L12:assistant parent:L11:user parent:L10:assistant parent:L9:system:local_command parent:L8:system:local_command parent:L7:system:local_command parent:L6:user parent:L5:user parent:L4:assistant parent:L3:user parent:L2:user
```

A `msg_…` id gives every entry of that API message, including entries split around a tool result.

```scrut
$ cc-sessions entry a7c3e9f msg_01FxAlpha000000000000002 | grep '^entry' | cut -f 1-2
entry\tL14 (escaped)
entry\tL15 (escaped)
entry\tL17 (escaped)
```

The `<synthetic>` message is found by its message id.

```scrut
$ cc-sessions entry a7c3e9f e0a0eeee-5555-4000-8000-000000000001 | sed -n '1p;/"model"/p'
entry\tL56\te0a00033-0000-4000-8000-000000000033\tassistant\t2026-10-30T10:01:57Z (escaped)
    "model": "<synthetic>",
```

## --since and --until

The bounds keep only the matching entries inside them; the parent chain still starts at the first one kept.

```scrut
$ cc-sessions entry a7c3e9f msg_01FxAlpha000000000000002 --since L15 | grep -E '^(entry|parent)' | cut -f 1-2 | head -n 3
> cc-sessions entry a7c3e9f msg_01FxAlpha000000000000002 --until L14 | grep '^entry' | cut -f 1-2
> cc-sessions entry a7c3e9f msg_01FxAlpha000000000000002 --since 2026-10-30T10:00:20Z | grep '^entry' | cut -f 1-2
entry\tL15 (escaped)
entry\tL17 (escaped)
parent\tL14 (escaped)
entry\tL14 (escaped)
entry\tL15 (escaped)
entry\tL17 (escaped)
```

Bounds that leave nothing are an empty answer.

```scrut
$ out=$(cc-sessions entry a7c3e9f L4 --since L5 2> err.txt); echo "exit $? stdout ${#out}"; cc_test_rel < err.txt
exit 0 stdout 0
cc-sessions: no entry matches L4 in <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl with --since L5
```

## Long strings, --full and the budget

GAMMA L8 holds a 30000-character result and a 27304-character copy of the file; no output line comes near their length.

```scrut
$ cc-sessions entry c7d9 L8 | grep -o -e '…\[+[0-9]* chars\]'; cc-sessions entry c7d9 L8 | awk '{ if (length($0) > max) max = length($0) } END { print (max < 2500 ? "lines short" : "long line") }'
…[+28000 chars]
…[+25304 chars]
lines short
```

`--full` keeps every string whole; the budget still stops before the 30000-character line and says how to continue.

```scrut {output_stream: stderr}
$ cc-sessions entry c7d9 L8 --full > /dev/null
cc-sessions: output stopped at --max-chars 20000 after * records; * more left out; continue with a larger --max-chars (0 removes the limit) (glob)
```

```scrut
$ cc-sessions entry c7d9 L8 --full --max-chars 0 | sed '1d;/^parent/,$d' | jq -r '[.message.content[0].content, .toolUseResult.file.content] | map(length) | join(" ")'
30000 27304
```

## Duplicates, the corrupt line and backward timestamps

A handle on a line that repeats an earlier uuid shows that line as written (with its `slug`), and says which line the other commands read.

```scrut
$ cc-sessions entry b2d4 L14 2>err.txt | sed -n '1p;/"slug"/p'; grep -v 'skipped 1 unparseable' err.txt
entry\tL14\te2a00001-0000-4000-8000-000000000001\tuser\t2026-07-15T09:00:00Z (escaped)
  "slug": * (glob)
cc-sessions: L14 repeats the uuid of L2; other commands read L2
```

The uuid itself finds the first copy.

```scrut
$ cc-sessions entry b2d4 e2a00001-0000-4000-8000-000000000001 2>/dev/null | head -n 1; cc-sessions entry b2d4 e2a00001-0000-4000-8000-000000000001 2>/dev/null | grep -c slug
entry\tL2\te2a00001-0000-4000-8000-000000000001\tuser\t2026-07-15T09:00:00Z (escaped)
0
[1]
```

The corrupt line has no entry: an empty answer that says so.

```scrut
$ out=$(cc-sessions entry b2d4 L20 2> err.txt); echo "exit $? stdout ${#out}"; cc_test_rel < err.txt
exit 0 stdout 0
cc-sessions: skipped 1 unparseable line in <root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e.jsonl: L20
cc-sessions: L20 of <root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e.jsonl is an unparseable line, so it has no entry
```

L7 is written before L6 but stamped earlier; the parent chain follows `parentUuid`, not time.

```scrut
$ cc-sessions entry b2d4 L7 2>/dev/null | grep -E '^(entry|parent)' | cut -f 1,2,5
entry\tL7\t2026-07-15T09:00:02Z (escaped)
parent\tL6\t2026-07-15T09:00:06Z (escaped)
parent\tL5\t2026-07-15T09:00:05Z (escaped)
parent\tL4\t2026-07-15T09:00:04Z (escaped)
parent\tL3\t2026-07-15T09:00:03Z (escaped)
parent\tL2\t2026-07-15T09:00:00Z (escaped)
```

## Long parent chains

The chain stops after 20 parents and says where to continue.

```scrut
$ cc-sessions entry a7c3e9f L81 2> err.txt | grep -c '^parent'; cc_test_rel < err.txt
20
cc-sessions: the parent chain shows 20 of 71 ancestors; continue with cc-sessions entry <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl L59
```

## Agent transcripts

A workflow agent's structured output, and a flat agent's reply.

```scrut
$ cc-sessions entry a9e8 L4 | grep -E '^(entry|parent)' | cut -f 1,2,4; cc-sessions entry 5f6a7b8c L2 | grep -E '^(entry|parent)' | cut -f 1,2,4
entry\tL4\tattachment:structured_output (escaped)
parent\tL3\tassistant (escaped)
parent\tL2\tassistant (escaped)
parent\tL1\tuser (escaped)
entry\tL2\tassistant (escaped)
parent\tL1\tuser (escaped)
```

## Nothing found

An id or handle that matches nothing is an empty answer; a handle past the end says how long the file is.

```scrut
$ cc-sessions entry a7c3e9f L999 2>&1 | cc_test_rel; cc-sessions entry a7c3e9f toolu_nope 2>&1 | cc_test_rel; echo "exit $?"
cc-sessions: no entry matches L999 in <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl, which has 83 lines
cc-sessions: no entry matches toolu_nope in <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl
exit 0
```

## Usage errors

The session and the entry reference are both needed, and nothing more.

```scrut {output_stream: stderr}
$ cc-sessions entry a7c3e9f; cc-sessions entry a7c3e9f L4 L5; echo "exit $?" >&2
cc-sessions: entry needs a <session> and an entry reference; pass both, as in cc-sessions entry current L12; see cc-sessions entry --help
cc-sessions: entry takes a <session> and one entry reference, got 3 operands; pass one handle, uuid, toolu_… or msg_… id; see cc-sessions entry --help
exit 2
```

A bare line number is a usage error that names the handle.

```scrut {output_stream: stderr}
$ cc-sessions entry a7c3e9f 14
cc-sessions: "14" is not an entry reference; pass L14 for line 14; see cc-sessions entry --help
[2]
```

An unknown option names the valid ones; a bad bound is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions entry a7c3e9f L4 --frob; cc-sessions entry a7c3e9f L4 --since soon; echo "exit $?" >&2
cc-sessions: unknown option "--frob" for entry; valid options: --full, --since, --until; to pass text that starts with -, put it after --; see cc-sessions entry --help
cc-sessions: --since takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got "soon"; pass one of those forms; see cc-sessions entry --help
exit 2
```

`--` ends options.

```scrut
$ cc-sessions entry -- a7c3e9f L9 | head -n 1
entry\tL9\t-\tai-title\t- (escaped)
```

## Portability

jq 1.7 gives the same answer as the jq on PATH.

```scrut
$ JQ17=$CC_TEST_TMP/jq17 && mkdir -p "$JQ17" && ln -sf /usr/bin/jq "$JQ17/jq"
> for r in "a7c3e9f L4" "a7c3e9f toolu_01FxAlpha000000000000002" "c7d9 L8" "b2d4 L14" "a7c3e9f L81"; do set -- $r; cc-sessions entry "$@" > new.txt 2>&1; PATH="$JQ17:$PATH" cc-sessions entry "$@" > old.txt 2>&1; cmp new.txt old.txt || echo "differs: $r"; done; echo compared
compared
```

The shell code is clean under shellcheck.

```scrut
$ cd "$CC_TEST_ROOT" && shellcheck -x -P SCRIPTDIR libexec/entry && echo clean
clean
```
