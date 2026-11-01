---
prepend: [setup.md]
---

# cc-sessions prompts

Values come from `fixtures/FACTS.md`.

## Synopsis and help

The synopsis is one index line naming the operand.

```scrut
$ cc-sessions prompts --synopsis
prompts <session>  what the human did: inputs, answers, denials, plan decisions, interrupts, command output
```

The index lists it.

```scrut
$ cc-sessions --help | grep '^  prompts '
  prompts <session>  what the human did: inputs, answers, denials, plan decisions, interrupts, command output
```

Help names the operand, every option, the fields in order, the text width, the empty-answer notice and the exit codes.

```scrut
$ cc-sessions prompts --help > help.txt; echo "exit $?"
> grep -E '^Usage: cc-sessions prompts <session>' help.txt
> awk '/^Fields/ { f = 1; next } f && /^  [a-z]/ { printf "%s ", $1 } /^$/ { f = 0 } END { print "" }' help.txt
> grep -o -E -e '--(since|until|full)' help.txt | sort -u | paste -s -d ' ' -
> grep -c -E 'prompt|slash|bash|sdk|queued|answer|denied|plan|interrupt|output' help.txt | awk '$1 >= 10 { print "kinds listed" }'
> grep -o -E '300 characters|no human input in <transcript>|Exit status' help.txt
exit 0
Usage: cc-sessions prompts <session> [--since T] [--until T] [--full]
handle time kind text 
--full --since --until
kinds listed
300 characters
no human input in <transcript>
Exit status
```

Help stays short and never reads transcripts.

```scrut
$ [ "$(wc -l < help.txt)" -lt 40 ] && echo short
> CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions prompts --help | cmp - help.txt && echo same
> cc-sessions prompts -h | cmp - help.txt && echo same
short
same
same
```

## Every kind in one session

ALPHA's human input, with each command's output right after its command and the interrupt in file order.
The plain `/compact` (L35) and its `<command-name>` entry (L39) are one record, at L39.

```scrut
$ cc-sessions prompts a7c3e9f
L4\t2026-10-30T10:00:04Z\tprompt\tCheck the CONTENT_TERM_ALPHA parser, then please run "make test" now. (escaped)
L21\t2026-10-30T10:00:35Z\tslash\t/effort high (escaped)
L22\t2026-10-30T10:00:38Z\toutput\tSet effort level to high (this session only) (escaped)
L23\t2026-10-30T10:00:41Z\tslash\t/demo:review parser changes (escaped)
L27\t2026-10-30T10:00:51Z\tanswer\tWhich parser mode should the review target? → Strict (Recommended) (escaped)
L29\t2026-10-30T10:00:56Z\tdenied\tEdit: Keep lenient mode until the release. (escaped)
L39\t2026-10-30T10:01:21Z\tslash\t/compact (escaped)
L40\t2026-10-30T10:01:24Z\toutput\tCompacted (ctrl+o to see full summary) (escaped)
L44\t2026-10-30T10:01:30Z\tprompt\tThe output looks wrong here: [Image #1]\\n[image] (escaped)
L52\t2026-10-30T10:01:51Z\tplan\tapproved: # Plan\\n\\n1. Switch the parser to strict mode behind a flag. (escaped)
L55\t2026-10-30T10:01:56Z\tinterrupt\t[Request interrupted by user] (escaped)
L57\t2026-10-30T10:02:00Z\tbash\tgit status (escaped)
L58\t2026-10-30T10:02:03Z\toutput\tOn branch main\\nnothing to commit, working tree clean (escaped)
L59\t2026-10-30T10:19:53Z\tprompt\tSpin up helpers for the tokenizer tests and the rollout. (escaped)
L69\t2026-10-30T10:25:10Z\tqueued\tAlso check the lexer. (escaped)
L71\t2026-10-30T10:26:41Z\tslash\t/btw does the lexer share the parser's token table? (escaped)
L73\t2026-10-30T10:28:33Z\tslash\t/doctor (escaped)
L80\t2026-10-30T10:32:03Z\tprompt\tThanks, wrap up. (escaped)
```

Injected text, summaries, notifications, the peer message and tool results are not input.

```scrut
$ cc-sessions prompts a7c3e9f | cut -f 1 | grep -x -E 'L(20|24|35|37|38|47|50|66|67|68|74|13)' || echo none
none
```

A printed time passed back to `--since` selects the same record.

```scrut
$ cc-sessions prompts a7c3e9f --since 2026-10-30T10:01:30Z --until 2026-10-30T10:01:30Z
L44\t2026-10-30T10:01:30Z\tprompt\tThe output looks wrong here: [Image #1]\\n[image] (escaped)
```

## Other sessions and eras

BETA (2.1.206): the queued prompt that exists only in a `queue-operation` (L8). The re-appended copies (L14–L19) are not
repeated, and the corrupt line (L20) is skipped with a notice.

```scrut
$ cc-sessions prompts b2d4
L2\t2026-07-15T09:00:00Z\tprompt\tSummarise the beta build failures. (escaped)
L8\t2026-07-15T09:00:10Z\tqueued\tAlso list the warnings. (escaped)
L9\t2026-07-15T09:01:03Z\tprompt\tFind where the header should live. (escaped)
L21\t2026-07-15T09:05:03Z\tprompt\tList the warnings too. (escaped)
```

```scrut
$ cc-sessions prompts b2d4 2>&1 >/dev/null | cc_test_rel
cc-sessions: skipped 1 unparseable line in <root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e.jsonl: L20
```

Timestamps run backwards at L7 and in the copies; a time bound still compares each record's own time.

```scrut
$ cc-sessions prompts b2d4 --since 2026-07-15T09:00:05Z 2>/dev/null | cut -f 1 | paste -s -d ' ' -
L8 L9 L21
```

The resumed copy holds BETA's history (L1) and its own prompt (L6).

```scrut
$ cc-sessions prompts b9e1
L1\t2026-07-15T09:01:03Z\tprompt\tFind where the header should live. (escaped)
L6\t2026-07-20T14:00:03Z\tprompt\tNow fix the include path. (escaped)
```

The flat-era session (2.0.76), the SDK session, and GAMMA (2.1.316), whose harness command (L4) and `queue-operation` of a
notification's text (L15) are not input.

```scrut
$ cc-sessions prompts c4e6 && cc-sessions prompts d1f3 && cc-sessions prompts c7d9
L2\t2026-01-03T11:40:03Z\tprompt\tFind the flat config loader. (escaped)
L3\t2026-10-29T11:50:09Z\tsdk\tRename the report generator skill to report-builder. (escaped)
L1\t2026-10-26T14:00:03Z\tprompt\tRebuild the gamma index with full effort, then check the table. (escaped)
L19\t2026-10-26T14:20:03Z\tprompt\tI changed notes.md by hand; compare it with the table. (escaped)
```

An orphan skill body (UNDER L1) is not input.

```scrut
$ cc-sessions prompts f6b8
L2\t2026-10-27T11:55:06Z\tprompt\tList the files with spaces in their names. (escaped)
```

`current` names the session in `CLAUDE_CODE_SESSION_ID`.

```scrut
$ CLAUDE_CODE_SESSION_ID=a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e cc-sessions prompts current | wc -l | tr -d ' '
18
```

## Denials and plan decisions

Variants of ALPHA: the Edit denial (L29) without feedback, and the plan (L52) rejected with and without feedback.

```scrut
$ V=$CC_TEST_TMP/variants && mkdir -p "$V"
> deny='The user doesn'"'"'t want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file).'
> jq -c --arg deny "$deny" 'if input_line_number == 29 then .message.content[0].content = $deny + " STOP what you are doing and wait for the user to tell you how to proceed."
>   elif input_line_number == 52 then .message.content[0].content = $deny + " To tell you how to proceed, the user said:\nKeep the lenient default." | .message.content[0].is_error = true
>   else . end' "$ALPHA.jsonl" > "$V/denials.jsonl"
> jq -c --arg deny "$deny" 'if input_line_number == 52 then .message.content[0].content = $deny | .message.content[0].is_error = true else . end' "$ALPHA.jsonl" > "$V/plain-rejection.jsonl"
> cc-sessions prompts "$V/denials.jsonl" | awk -F '\t' '$1 == "L29" || $1 == "L52"'
> cc-sessions prompts "$V/plain-rejection.jsonl" | awk -F '\t' '$1 == "L52"'
L29\t2026-10-30T10:00:56Z\tdenied\tEdit (escaped)
L52\t2026-10-30T10:01:51Z\tplan\trejected: Keep the lenient default. (escaped)
L52\t2026-10-30T10:01:51Z\tplan\trejected (escaped)
```

## Inputs that are easy to misread

FOXTROT: a rejection whose call is in an earlier session (L2) is still a denial, named without a tool. Slash-command
output stored as a `system` entry (L7, L9) is output. An ExitPlanMode error (L11) is no decision, and the older approval
wording (L13) is an approval. The `/effort` typed twice while Claude was busy (enqueued at L14 and L16, each taken back)
is the command at L20, and the text queued at L22 is the prompt with an image at L24. Text queued, taken back and queued
again (L25–L27) counts once, at its last enqueue. A typed prompt that mentions `<command-name>` stays a prompt (L28, L29).

```scrut
$ cc-sessions prompts f0d2
L2\t2025-11-20T10:00:02Z\tdenied\tStart from the fixture notes instead. (escaped)
L3\t2025-11-20T10:00:05Z\tprompt\tSort the fixtures by era, then reload the skills. (escaped)
L6\t2025-11-20T10:00:12Z\tslash\t/reload-skills (escaped)
L7\t2025-11-20T10:00:12Z\toutput\tReloaded skills: 12 skills available (escaped)
L8\t2025-11-20T10:00:20Z\tslash\t/model opus (escaped)
L9\t2025-11-20T10:00:20Z\toutput\tSet model to opus (escaped)
L13\t2025-11-20T10:00:41Z\tplan\tapproved: # Plan\\n\\n1. Sort the fixtures by era. (escaped)
L20\t2025-11-20T10:01:00Z\tslash\t/effort (escaped)
L21\t2025-11-20T10:01:00Z\toutput\tSet effort level to high (escaped)
L24\t2025-11-20T10:01:09Z\tprompt\tAlso check the screenshot.\\n[image] (escaped)
L27\t2025-11-20T10:01:16Z\tqueued\tThen tidy the notes. (escaped)
L28\t2025-11-20T10:01:30Z\tprompt\tWhy does <command-name> show up in the transcript? (escaped)
L29\t2025-11-20T10:01:40Z\tprompt\tExplain the tag <command-name>/clear</command-name> please. (escaped)
```

A denial is read from its result line alone, so a file holding only that line still has it. The plain rejection of
ALPHA's plan (L52 of the variant above) is a plan decision only beside its ExitPlanMode call; alone it is a denial.

```scrut
$ sed -n 2p "$P/-tmp-sessions-fixture-foxtrot/f0d2b4c6-8e0a-4b2c-9d4e-6f8a0b2c4d6e.jsonl" > "$V/orphan.jsonl"
> sed -n 52p "$V/plain-rejection.jsonl" > "$V/rejection-only.jsonl"
> cc-sessions prompts "$V/orphan.jsonl"; cc-sessions prompts "$V/rejection-only.jsonl"
L1\t2025-11-20T10:00:02Z\tdenied\tStart from the fixture notes instead. (escaped)
L1\t2026-10-30T10:01:51Z\tdenied\t- (escaped)
```

A message that a popAll puts back into the prompt is not input by itself, even when it is never queued again: what
the user sends after editing it is recorded where it appears (FOXTROT L25 and L26 alone).

```scrut
$ sed -n 25,26p "$P/-tmp-sessions-fixture-foxtrot/f0d2b4c6-8e0a-4b2c-9d4e-6f8a0b2c4d6e.jsonl" > "$V/popped.jsonl"
> cc-sessions prompts "$V/popped.jsonl" 2>/dev/null | wc -l | tr -d ' '
0
```

## Width and --full

Text is cut to 300 characters, ending with `…`; `--full` keeps it whole.

```scrut
$ jq -c 'if input_line_number == 80 then .message.content = ("long " * 80) else . end' "$ALPHA.jsonl" > "$CC_TEST_TMP/variants/long.jsonl"
> cc-sessions prompts "$CC_TEST_TMP/variants/long.jsonl" | awk -F '\t' '$1 == "L80" { print $4 }' | jq -R -r '"\(length) \(.[-5:])"'
> cc-sessions prompts "$CC_TEST_TMP/variants/long.jsonl" --full | awk -F '\t' '$1 == "L80" { print $4 }' | jq -R 'length'
300 long…
400
```

## --since and --until

Handle bounds are inclusive; an output is selected by its own handle.

```scrut
$ cc-sessions prompts a7c3e9f --since L22 --until L29 | cut -f 1,3 | paste -s -d ' ' -
L22\toutput L23\tslash L27\tanswer L29\tdenied (escaped)
```

Later options override earlier ones, and ages count back from now.

```scrut
$ cc-sessions prompts a7c3e9f --since L80 --since L73 | cut -f 1 | paste -s -d ' ' -
> cc-sessions prompts a7c3e9f --until 1s | wc -l | tr -d ' '
L73 L80
18
```

A bad bound is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions prompts a7c3e9f --since yesterday
cc-sessions: --since takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got "yesterday"; pass one of those forms; see cc-sessions prompts --help
[2]
```

## Empty answers

A session without human input answers with nothing on stdout and a notice naming the transcript.

```scrut
$ cc-sessions prompts b5a7 2>&1 >/dev/null | cc_test_rel; echo "exit ${PIPESTATUS[0]}"
cc-sessions: no human input in <root>/projects/-tmp-sessions-fixture-alpha/b5a7c9e1-0d2f-4a4b-9c6e-8f0a2b4c6d8e.jsonl
exit 0
```

A sub-agent transcript has no human input either; with bounds, the notice names them.

```scrut
$ out=$(cc-sessions prompts a7c3e9b 2> err.txt); echo "exit $? stdout ${#out}"; cc_test_rel < err.txt
> cc-sessions prompts a7c3e9f --since L81 --until L83 2>&1 >/dev/null | cc_test_rel
exit 0 stdout 0
cc-sessions: no human input in <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-a7c3e9b2d4f6a8c01.jsonl
cc-sessions: no human input in <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl with --since L81 --until L83
```

## Output budget

`--limit` stops at a record and says where to continue.

```scrut {output_stream: combined}
$ cc-sessions prompts a7c3e9f --limit 2 2>&1
L4\t2026-10-30T10:00:04Z\tprompt\tCheck the CONTENT_TERM_ALPHA parser, then please run "make test" now. (escaped)
L21\t2026-10-30T10:00:35Z\tslash\t/effort high (escaped)
cc-sessions: output stopped at --limit 2 after 2 records; 16 more left out; continue with --since L22
```

Continuing from the notice gives the rest; `--max-chars` cuts at a record boundary the same way.

```scrut
$ cc-sessions prompts a7c3e9f --since L22 | wc -l | tr -d ' '
> cc-sessions prompts a7c3e9f --max-chars 200 2>&1 >/dev/null
16
cc-sessions: output stopped at --max-chars 200 after 2 records; 16 more left out; continue with --since L22
```

## Usage errors

```scrut {output_stream: stderr}
$ cc-sessions prompts
cc-sessions: prompts needs a <session>; pass a session id or a prefix of 4 or more characters, a path, wf_<run-id> or current; see cc-sessions prompts --help
[2]
```

```scrut {output_stream: stderr}
$ cc-sessions prompts a7c3e9f b2d4
cc-sessions: prompts takes one <session>, got 2; run it once per session; see cc-sessions prompts --help
[2]
```

```scrut {output_stream: stderr}
$ cc-sessions prompts a7c3e9f --agents
cc-sessions: unknown option "--agents" for prompts; valid options: --since, --until, --full; to pass text that starts with -, put it after --; see cc-sessions prompts --help
[2]
```

```scrut {output_stream: stderr}
$ cc-sessions prompts a7c3e9f --since
cc-sessions: --since needs a value; pass one after it; see cc-sessions prompts --help
[2]
```

An unknown or ambiguous session exits 2.

```scrut
$ cc-sessions prompts e0a0 2>/dev/null; echo "exit $?"; cc-sessions prompts a7c3 2>/dev/null; echo "exit $?"
exit 2
exit 2
```

`--` ends options: what follows is the session, even when it starts with `-`.

```scrut
$ cc-sessions prompts -- a7c3e9f | wc -l | tr -d ' '; cc-sessions prompts -- --full 2>/dev/null; echo "exit $?"
18
exit 2
```

## jq 1.7

The command gives the same answer with jq 1.7 first on PATH.

```scrut
$ mkdir -p "$CC_TEST_TMP/jq17" && ln -sf /usr/bin/jq "$CC_TEST_TMP/jq17/jq"
> cc-sessions prompts a7c3e9f > now.txt && PATH="$CC_TEST_TMP/jq17:$PATH" cc-sessions prompts a7c3e9f | cmp - now.txt && echo same
same
```
