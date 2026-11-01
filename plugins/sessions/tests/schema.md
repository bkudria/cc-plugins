---
prepend: [setup.md]
---

# cc-sessions schema

Values come from `fixtures/FACTS.md`.

## Help

The synopsis is one index line.

```scrut
$ cc-sessions schema --synopsis | awk '{ print (length($0) <= 120 ? "short" : "long"), $1, $2 }'; cc-sessions --help | grep -c '^  schema \[<session>...\]'
short schema [<session>...]
1
```

Help exits 0 without reading transcripts, stays short, and names the operands, options, sections, fields, default bound, empty answers and exit codes.

```scrut
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions schema --help > help.txt; echo "exit $?"; [ "$(wc -l < help.txt)" -lt 40 ] && echo short; head -n 1 help.txt
> for w in '<session>' --since --until 'section TAB name TAB count TAB detail' '^  type ' '^  system ' '^  attachment ' '^  keys ' '^  tool-result ' '^  files ' UNKNOWN 'since 7d' 'no default limit' 'a notice on stderr' 'Exit status' 'usage error'; do grep -q -e "$w" help.txt || echo "missing $w"; done; echo checked
exit 0
short
Usage: cc-sessions schema [<session>...] [--since T] [--until T]
checked
```

## One session

SDK: every section for a five-line transcript. The queue operations carry no version and take the file's first one; each row counts entries, and keys are sorted.

```scrut
$ cc-sessions schema d1f3
type\tqueue-operation\t2\tknown 2.1.310..2.1.310 (escaped)
type\tai-title\t1\tknown 2.1.310..2.1.310 (escaped)
type\tassistant\t1\tknown 2.1.310..2.1.310 (escaped)
type\tuser\t1\tknown 2.1.310..2.1.310 (escaped)
keys\tqueue-operation\t2\toperation,sessionId,timestamp,type (escaped)
keys\tai-title\t1\taiTitle,sessionId,type (escaped)
keys\tassistant\t1\tapiBlockIndex,cwd,entrypoint,gitBranch,isSidechain,message,parentUuid,requestId,sessionId,timestamp,type,userType,uuid,version (escaped)
keys\tuser\t1\tcwd,entrypoint,gitBranch,isSidechain,message,parentUuid,permissionMode,promptId,promptSource,sessionId,timestamp,turnOrigin,turnPosition,type,userType,uuid,version (escaped)
files\tmain\t1\t2.3K (escaped)
```

ALPHA: the unknown `brand_new_kind` attachment sorts first; then the entry counts of FACTS.md.

```scrut
$ cc-sessions schema a7c3e9f | grep -E '^(attachment|type|system)\t'
attachment\tbrand_new_kind\t1\tUNKNOWN 2.1.314..2.1.314 (escaped)
type\tuser\t37\tknown 2.1.314..2.1.314 (escaped)
type\tassistant\t24\tknown 2.1.314..2.1.314 (escaped)
type\tattachment\t8\tknown 2.1.314..2.1.314 (escaped)
type\tsystem\t4\tknown 2.1.314..2.1.314 (escaped)
type\tai-title\t2\tknown 2.1.314..2.1.314 (escaped)
type\tcustom-title\t2\tknown 2.1.314..2.1.314 (escaped)
type\tapi-request\t1\tknown 2.1.314..2.1.314 (escaped)
type\tapi-request-blob\t1\tknown 2.1.314..2.1.314 (escaped)
type\tcost-state\t1\tknown 2.1.314..2.1.314 (escaped)
type\tlast-prompt\t1\tknown 2.1.314..2.1.314 (escaped)
type\tmode\t1\tknown 2.1.314..2.1.314 (escaped)
type\tpermission-mode\t1\tknown 2.1.314..2.1.314 (escaped)
system\taway_summary\t1\tknown 2.1.314..2.1.314 (escaped)
system\tcompact_boundary\t1\tknown 2.1.314..2.1.314 (escaped)
system\tinformational\t1\tknown 2.1.314..2.1.314 (escaped)
system\tlocal_command\t1\tknown 2.1.314..2.1.314 (escaped)
attachment\tfile\t1\tknown 2.1.314..2.1.314 (escaped)
attachment\thook_success\t1\tknown 2.1.314..2.1.314 (escaped)
attachment\tinstructions\t1\tknown 2.1.314..2.1.314 (escaped)
attachment\tinvoked_skills\t1\tknown 2.1.314..2.1.314 (escaped)
attachment\tplan_file_reference\t1\tknown 2.1.314..2.1.314 (escaped)
attachment\tqueued_command\t1\tknown 2.1.314..2.1.314 (escaped)
attachment\tskill_listing\t1\tknown 2.1.314..2.1.314 (escaped)
```

`tool-result` lists the `toolUseResult` keys per tool; `key?` marks a key some results lack, and a result that is not an object shows its type.

```scrut
$ cc-sessions schema a7c3e9f | grep -E '^tool-result\t' | grep -v -E '^tool-result\tAgent\t'
tool-result\tBash\t3\t(string)?,interrupted?,isImage?,noOutputExpected?,persistedOutputPath?,persistedOutputSize?,stderr?,stdout? (escaped)
tool-result\tSkill\t3\t(string)?,commandName?,success? (escaped)
tool-result\tAskUserQuestion\t1\tannotations,answers,questions (escaped)
tool-result\tEdit\t1\t(string) (escaped)
tool-result\tExitPlanMode\t1\tfilePath,isAgent,plan (escaped)
tool-result\tWorkflow\t1\trunId,scriptPath,status,summary,taskId,taskType,transcriptDir,workflowName (escaped)
tool-result\tmcp__demo__fetch\t1\t(array) (escaped)
```

The Agent results of a background launch (`agentId`) and a teammate spawn (`agent_id`) share only their prompt and status.

```scrut
$ cc-sessions schema a7c3e9f | grep -E '^tool-result\tAgent\t' | cut -f 1-3; cc-sessions schema a7c3e9f | grep -E '^tool-result\tAgent\t' | cut -f 4 | tr ',' '\n' | grep -v '?$'
tool-result\tAgent\t2 (escaped)
prompt
status
```

Keys present in every entry of a type carry no mark.

```scrut
$ cc-sessions schema a7c3e9f | grep -E '^keys\t(custom-title|cost-state)\t' | cut -c 1-80
keys\tcustom-title\t2\tcustomTitle,sessionId,type (escaped)
keys\tcost-state\t1\thasUnknownModelCost,modelUsage,sessionId,startTime,totalAPIDur (escaped)
```

## Duplicates and the corrupt line

BETA's re-appended lines are left out (5 user and 8 assistant entries remain), and the corrupt L20 is named on stderr.

```scrut
$ cc-sessions schema b2d4 2>/dev/null | grep '^type'
type\tassistant\t8\tknown 2.1.206..2.1.206 (escaped)
type\tuser\t5\tknown 2.1.206..2.1.206 (escaped)
type\tpermission-mode\t1\tknown 2.1.206..2.1.206 (escaped)
type\tqueue-operation\t1\tknown 2.1.206..2.1.206 (escaped)
```

```scrut {output_stream: stderr}
$ cc-sessions schema b2d4 2>&1 >/dev/null | cc_test_rel >&2
cc-sessions: skipped 1 unparseable line in <root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e.jsonl: L20
```

## Several sessions

Counts add up across sessions and versions span them: ALPHA (2.1.314) and GAMMA (2.1.316).

```scrut
$ cc-sessions schema a7c3e9f c7d9 | grep -E '^(type\t(user|assistant)|tool-result\tRead|attachment\t(ultra_effort_enter|nested_memory|edited_text_file)|files)\t'
type\tuser\t45\tknown 2.1.314..2.1.316 (escaped)
type\tassistant\t32\tknown 2.1.314..2.1.316 (escaped)
attachment\tedited_text_file\t1\tknown 2.1.316..2.1.316 (escaped)
attachment\tnested_memory\t1\tknown 2.1.316..2.1.316 (escaped)
attachment\tultra_effort_enter\t1\tknown 2.1.316..2.1.316 (escaped)
tool-result\tRead\t1\tfile,type (escaped)
files\tmain\t2\t155K (escaped)
```

Agent transcripts count by their own kind; the flat layout (2.0.76) brings `progress` entries.

```scrut
$ cc-sessions schema c4e6 5f6a7b8c a0f1 | grep -E '^(type\t(progress|user)|files)\t'
type\tuser\t5\tknown 2.0.76..2.1.314 (escaped)
type\tprogress\t2\tknown 2.0.76..2.0.76 (escaped)
files\tflat\t1\t1.2K (escaped)
files\tmain\t1\t5.8K (escaped)
files\tworkflow-agent\t1\t3.9K (escaped)
```

## --since and --until on sessions

With sessions, the bounds pick entries: ALPHA L77 alone is the unknown attachment.

```scrut
$ cc-sessions schema a7c3e9f --since L77 --until L77 | cut -f 1-3
attachment\tbrand_new_kind\t1 (escaped)
type\tattachment\t1 (escaped)
keys\tattachment\t1 (escaped)
files\tmain\t1 (escaped)
```

A time bound works the same way: GAMMA after 14:20 holds L19–L24.

```scrut
$ cc-sessions schema c7d9 --since 2026-10-26T14:20Z | grep '^type' | cut -f 1-3
type\tassistant\t3 (escaped)
type\tuser\t2 (escaped)
type\tattachment\t1 (escaped)
```

Bounds that hold no entry are an empty answer.

```scrut
$ out=$(cc-sessions schema a7c3e9f --since L84 2> err.txt); echo "exit $? stdout ${#out}"; cc_test_rel < err.txt
exit 0 stdout 0
cc-sessions: no entries in a7c3e9f with --since L84
```

## Unknown types sort first

Unknown entry types and system subtypes come before everything else, in section order, with the keys of the unknown entry type.

```scrut
$ printf '%s\n' '{"type":"user","uuid":"u1","version":"9.0.1","message":{"content":"hi"}}' '{"type":"brand_new_type","uuid":"u2","shape":1}' '{"type":"system","subtype":"brand_new_subtype","uuid":"u3"}' > "$CC_TEST_TMP/unknown.jsonl"
> cc-sessions schema "$CC_TEST_TMP/unknown.jsonl"
type\tbrand_new_type\t1\tUNKNOWN 9.0.1..9.0.1 (escaped)
system\tbrand_new_subtype\t1\tUNKNOWN 9.0.1..9.0.1 (escaped)
keys\tbrand_new_type\t1\tshape,type,uuid (escaped)
type\tsystem\t1\tknown 9.0.1..9.0.1 (escaped)
type\tuser\t1\tknown 9.0.1..9.0.1 (escaped)
keys\tsystem\t1\tsubtype,type,uuid (escaped)
keys\tuser\t1\tmessage,type,uuid,version (escaped)
files\tmain\t1\t181B (escaped)
```

Versions compare by number, not as text.

```scrut
$ printf '%s\n' '{"type":"mode","version":"2.1.9"}' '{"type":"mode","version":"2.1.10"}' '{"type":"mode","version":"2.0.100"}' > "$CC_TEST_TMP/versions.jsonl"
> cc-sessions schema "$CC_TEST_TMP/versions.jsonl" | head -n 1
type\tmode\t3\tknown 2.0.100..2.1.10 (escaped)
```

## The corpus

Without sessions, every file under the data root modified inside the bounds counts. Every fixture file is from 2026.

```scrut
$ cc-sessions schema --since 2026-01-01 > corpus.txt 2> corpus.err; echo "exit $?"; head -n 1 corpus.txt; grep '^files' corpus.txt
exit 0
attachment\tbrand_new_kind\t1\tUNKNOWN 2.1.314..2.1.314 (escaped)
files\tmain\t9\t203K (escaped)
files\tmeta\t7\t1.5K (escaped)
files\tsubagent\t7\t18K (escaped)
files\tflat\t2\t2.4K (escaped)
files\ttool-result\t2\t5.8K (escaped)
files\tworkflow-agent\t2\t8.5K (escaped)
files\tjournal\t1\t768B (escaped)
files\trun-record\t1\t913B (escaped)
files\tworkflow-script\t1\t89B (escaped)
```

The entry types, attachment types and system subtypes are those FACTS.md lists, journal records included; versions run from 2.0.76 to 2.1.316.

```scrut
$ grep '^type' corpus.txt | cut -f 2 | sort | tr '\n' ' '; echo
> grep '^attachment' corpus.txt | cut -f 2 | sort | tr '\n' ' '; echo
> grep '^system' corpus.txt | cut -f 2 | sort | tr '\n' ' '; echo
> grep -E '^type\t(user|launched)\t' corpus.txt
agent-name ai-title api-request api-request-blob assistant attachment cost-state custom-title fork-context-ref last-prompt launched mode permission-mode progress queue-operation relocated result started summary system user 
brand_new_kind edited_text_file file hook_success instructions invoked_skills nested_memory plan_file_reference queued_command skill_listing structured_output ultra_effort_enter 
away_summary compact_boundary informational local_command 
type\tuser\t76\tknown 2.0.76..2.1.316 (escaped)
type\tlaunched\t1\tknown (escaped)
```

Across the corpus, unparseable lines are summed in one notice.

```scrut
$ cat corpus.err
cc-sessions: skipped 1 unparseable line in 1 file
```

`--since` and `--until` pick files by modification time: only SDK changed on 2026-10-29.

```scrut
$ cc-sessions schema --since 2026-10-29 --until 2026-10-29 | grep -E '^(type|files)' | cut -f 1-3
type\tqueue-operation\t2 (escaped)
type\tai-title\t1 (escaped)
type\tassistant\t1 (escaped)
type\tuser\t1 (escaped)
files\tmain\t1 (escaped)
```

A window holding only a saved tool output still answers with its file row.

```scrut
$ cc-sessions schema --since 2026-10-28T11:31Z --until 2026-10-28T11:31Z
files\ttool-result\t1\t2.4K (escaped)
```

The default window is the last 7 days.

```scrut
$ RECENT=$CC_TEST_TMP/recent && cc_test_install_config "$RECENT" && find "$RECENT" -type f -exec touch -t 202001010000 {} + && touch "$RECENT/projects/-tmp-sessions-fixture-under-score/f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4.jsonl"
> CLAUDE_CONFIG_DIR=$RECENT cc-sessions schema | grep -E '^(type|files)' | cut -f 1-3
type\tuser\t2 (escaped)
type\tassistant\t1 (escaped)
files\tmain\t1 (escaped)
```

Files are read in batches, several at a time; the answer does not depend on how they are cut.

```scrut
$ CC_SESSIONS_SCHEMA_BATCH_BYTES=1 cc-sessions schema --since 2026-01-01 2> batched.err | cmp - corpus.txt && cmp batched.err corpus.err && echo same
same
```

A window with no file is an empty answer.

```scrut
$ out=$(cc-sessions schema --since 2027-01-01 2> err.txt); echo "exit $? stdout ${#out}"; cc_test_rel < err.txt
exit 0 stdout 0
cc-sessions: no files modified under <root>/projects with --since 2027-01-01
```

Without sessions a handle means nothing.

```scrut {output_stream: stderr}
$ cc-sessions schema --since L5
cc-sessions: --since L5 is a handle, which only per-session records have; pass a timestamp (2026-10-30T10:00:04Z, 2026-10-30) or an age (7d) to compare modified times, or name a <session>; see cc-sessions schema --help
[2]
```

A missing data root means the command could not answer.

```scrut {output_stream: stderr}
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions schema
cc-sessions: no transcripts directory at /nonexistent/sessions-fixture/projects; set CLAUDE_CONFIG_DIR to the directory that holds projects/; see cc-sessions schema --help
[1]
```

Files that are not transcripts are counted by kind: `memory/`, `sessions-index.json`, and anything else.

```scrut
$ K=$CC_TEST_TMP/kinds/projects/-tmp-kinds && mkdir -p "$K/memory" && printf '%s\n' '{"type":"user","uuid":"k1","message":{"content":"Hi."}}' > "$K/k1.jsonl"
> printf '# Memory\n' > "$K/memory/MEMORY.md" && printf '{}\n' > "$K/sessions-index.json" && printf 'x\n' > "$K/notes.txt"
> CLAUDE_CONFIG_DIR=$CC_TEST_TMP/kinds cc-sessions schema | awk -F '\t' '$1 == "files" { print $2, $3 }'
main 1
memory 1
other 1
sessions-index 1
```

## Usage errors

An unknown option names the valid ones; a bad bound is a usage error; an unknown session exits 2.

```scrut {output_stream: stderr}
$ cc-sessions schema --frob; cc-sessions schema --since soon; cc-sessions schema e0a0 2>/dev/null; echo "exit $?" >&2
cc-sessions: unknown option "--frob" for schema; valid options: --since, --until; to pass text that starts with -, put it after --; see cc-sessions schema --help
cc-sessions: --since takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got "soon"; pass one of those forms; see cc-sessions schema --help
exit 2
```

`--` ends options.

```scrut
$ cc-sessions schema -- d1f3 | head -n 1
type\tqueue-operation\t2\tknown 2.1.310..2.1.310 (escaped)
```

## Output budget

Records carry no leading handle, so a cut output continues with a larger budget.

```scrut {output_stream: stderr}
$ cc-sessions schema d1f3 --limit 2 > /dev/null
cc-sessions: output stopped at --limit 2 after 2 records; 7 more left out; continue with a larger --limit (0 removes the limit)
```

## Portability

jq 1.7 gives the same answer as the jq on PATH.

```scrut
$ JQ17=$CC_TEST_TMP/jq17 && mkdir -p "$JQ17" && ln -sf /usr/bin/jq "$JQ17/jq"
> PATH="$JQ17:$PATH" cc-sessions schema --since 2026-01-01 2> old.err | cmp - corpus.txt && cmp old.err corpus.err && echo same
> for s in a7c3e9f b2d4; do cc-sessions schema "$s" > new.txt 2>&1; PATH="$JQ17:$PATH" cc-sessions schema "$s" > old.txt 2>&1; cmp new.txt old.txt || echo "differs: $s"; done; echo compared
same
compared
```

The shell code is clean under shellcheck.

```scrut
$ cd "$CC_TEST_ROOT" && shellcheck -x -P SCRIPTDIR libexec/schema && echo clean
clean
```
