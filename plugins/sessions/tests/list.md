---
prepend: [setup.md]
---

# cc-sessions list

Values come from `fixtures/FACTS.md`. `ids` keeps the id and label of each row.

```scrut
$ ids() { cut -f 1,7-; }
```

## Help and synopsis

The synopsis is one index line that starts with the command name.

```scrut
$ "$CC_TEST_ROOT/libexec/list" --synopsis | awk '{ print $1, (length($0) <= 120 ? "short" : "long") }'
list short
```

Help names the operand, every option, the fields in order, the default limit and width, the notices and the exit codes, and reads no transcripts.

```scrut
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions list --help > help.txt; echo "exit $?"
> for w in '<pattern>' --skill --cwd --since --until --origin --full --limit 'default 50' '100 characters' --until 'Exit status'; do grep -q -e "$w" help.txt || echo "missing $w"; done
> grep -E -o '^  [a-z]+  ' help.txt | tr -d ' ' | paste -s -d ' ' -; [ "$(wc -l < help.txt)" -le 40 ] && echo short
exit 0
id modified size origin mark cwd label skill
short
```

## Rows

The default listing shows cli sessions, newest first: stubs, sdk sessions and flat sub-agents are not rows.

```scrut
$ cc-sessions list
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t2026-10-30T11:30:00Z\t77K\tcli\t-\t/tmp/sessions-fixture/alpha\talpha fixture session (escaped)
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d\t2026-10-28T12:00:00Z\t12K\tcli\t-\t/tmp/sessions-fixture/reloc\tShow the release notes (escaped)
f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4\t2026-10-27T12:00:00Z\t2.4K\tcli\t-\t/tmp/sessions fixture/under_score\tList the files with spaces in their names. (escaped)
c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f\t2026-10-26T15:00:00Z\t78K\tcli\t-\t/tmp/sessions-fixture/gamma\tgamma-indexer (escaped)
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\t2026-07-20T12:00:00Z\t6.9K\tcli\t-\t/tmp/sessions-fixture/beta\tFind where the header should live. (escaped)
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\t2026-07-15T12:00:00Z\t19K\tcli\t-\t/tmp/sessions-fixture/beta\tSummarise the beta build failures. (escaped)
c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a\t2026-01-03T12:00:00Z\t5.8K\tcli\t-\t/tmp/sessions-fixture/flat\tFlat era config loader search (escaped)
e2c4a6b8-0d2f-4b4d-8e6f-1a3b5c7d9e0f\t2025-12-08T09:06:00Z\t15K\tcli\t-\t/tmp/sessions-fixture/echo\tExplore the schema code and the state updates in the background. (escaped)
d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13\t2025-12-06T10:06:00Z\t17K\tcli\t-\t/tmp/sessions-fixture/delta\tRun the audit workflow, then check the log and bring in a reviewer. (escaped)
f3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\t2025-12-06T10:01:02Z\t3.3K\tcli\t-\t/tmp/sessions-fixture/delta\t- (escaped)
f0d2b4c6-8e0a-4b2c-9d4e-6f8a0b2c4d6e\t2025-11-20T12:00:00Z\t23K\tcli\t-\t/tmp/sessions-fixture/foxtrot\tSort the fixtures by era, then reload the skills. (escaped)
```

`size` is the main transcript's size: bytes below 1K, one decimal below 10 of a unit, whole units above.

```scrut
$ wc -c < "$ALPHA.jsonl" | tr -d ' '; wc -c < "$UNDER.jsonl" | tr -d ' '; wc -c < "$RELOC.jsonl" | tr -d ' '
78856
2491
11830
```

`modified` is the main transcript's mtime, so a sub-agent written later does not change it.

```scrut
$ touch -t 202610311200.00 "$ALPHA/subagents/agent-a7c3e9b2d4f6a8c01.jsonl" && cc-sessions list --limit 1 | cut -f 2
> touch -t 202610301021.00 "$ALPHA/subagents/agent-a7c3e9b2d4f6a8c01.jsonl"
2026-10-30T11:30:00Z
```

The label follows the SPEC order: a later custom title wins (ALPHA), a single-token ai-title is skipped for the agent name (GAMMA), a legacy summary labels FLAT, and the first human input labels BETA and RESUMED; FOXTROT's begins with a denial, which is never the label.

```scrut
$ cc-sessions list | cut -f 7
alpha fixture session
Show the release notes
List the files with spaces in their names.
gamma-indexer
Find where the header should live.
Summarise the beta build failures.
Flat era config loader search
Explore the schema code and the state updates in the background.
Run the audit workflow, then check the log and bring in a reviewer.
-
Sort the fixtures by era, then reload the skills.
```

`mark` is `*` for the current session.

```scrut
$ CLAUDE_CODE_SESSION_ID=a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e cc-sessions list --limit 2 | cut -f 1,5
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t* (escaped)
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d\t- (escaped)
```

BETA's corrupt line is not reported: a listing reports sessions, not lines.

```scrut
$ cc-sessions list 2>&1 > /dev/null | wc -l | tr -d ' '
0
```

## Origin

`--origin sdk` shows the SDK session, `--origin all` every non-stub session; STUB never appears.

```scrut
$ cc-sessions list --origin sdk; cc-sessions list --origin all | cut -f 1,4
d1f3b5d7-9e0a-4c2e-a4b6-c8d0e2f4a6b8\t2026-10-29T12:00:00Z\t2.3K\tsdk\t-\t/tmp/sessions-fixture/scuttlerun-project-Xy12\tRename the report generator skill (escaped)
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\tcli (escaped)
d1f3b5d7-9e0a-4c2e-a4b6-c8d0e2f4a6b8\tsdk (escaped)
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d\tcli (escaped)
f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4\tcli (escaped)
c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f\tcli (escaped)
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\tcli (escaped)
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\tcli (escaped)
c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a\tcli (escaped)
e2c4a6b8-0d2f-4b4d-8e6f-1a3b5c7d9e0f\tcli (escaped)
d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13\tcli (escaped)
f3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\tcli (escaped)
f0d2b4c6-8e0a-4b2c-9d4e-6f8a0b2c4d6e\tcli (escaped)
```

Another origin name selects sessions with that entrypoint; here there are none.

```scrut
$ cc-sessions list --origin claude-vscode 2>&1 | cc_test_rel
cc-sessions: no sessions with --origin claude-vscode; 13 sessions checked in <root>/projects
```

A malformed origin is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions list --origin 'not one'
cc-sessions: --origin needs cli, sdk, all or an entrypoint name, got "not one"; pass, for example, --origin all; see cc-sessions list --help
[2]
```

## Pattern

The pattern matches titles: every custom title and ai-title, including an earlier one and a plan slug.

```scrut
$ cc-sessions list 'alpha draft' | ids; cc-sessions list strict-parser-plan | ids; cc-sessions list 'release notes' | ids
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\talpha fixture session (escaped)
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\talpha fixture session (escaped)
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d\tShow the release notes (escaped)
```

It matches the agent name and the legacy summary, which can be labels.

```scrut
$ cc-sessions list gamma-indexer | ids; cc-sessions list 'era config' | ids
c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f\tgamma-indexer (escaped)
c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a\tFlat era config loader search (escaped)
```

It matches the first human input, decoded: the quotes are `\"` on disk.

```scrut
$ cc-sessions list 'please run "make test" now' | ids; cc-sessions list 'header should' | ids
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\talpha fixture session (escaped)
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\tFind where the header should live. (escaped)
```

A later human input does not match, and neither does an assistant reply.

```scrut
$ cc-sessions list 'wrap up' 2>&1 | cc_test_rel; cc-sessions list 'forty fixes' 2>&1 | cc_test_rel
cc-sessions: no sessions match "wrap up" with --origin cli; 13 sessions checked in <root>/projects
cc-sessions: no sessions match "forty fixes" with --origin cli; 13 sessions checked in <root>/projects
```

It matches the session id.

```scrut
$ cc-sessions list b9e1c3a5 | ids; cc-sessions list 7d2f-4e6a | ids
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\tFind where the header should live. (escaped)
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\tFind where the header should live. (escaped)
```

Smart case: all-lowercase text matches any case; text with a capital letter matches exactly.

```scrut
$ cc-sessions list content_term_alpha | ids; cc-sessions list CONTENT_TERM_ALPHA | ids; cc-sessions list Content_Term_Alpha 2>/dev/null | ids; echo done
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\talpha fixture session (escaped)
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\talpha fixture session (escaped)
done
```

The pattern is literal: `.` is not a wildcard.

```scrut
$ cc-sessions list 'alpha.fixture' 2>&1 | cc_test_rel
cc-sessions: no sessions match "alpha.fixture" with --origin cli; 13 sessions checked in <root>/projects
```

A stub's title never makes it a row.

```scrut
$ cc-sessions list 'Stub session title' --origin all 2>&1 | cc_test_rel
cc-sessions: no sessions match "Stub session title" with --origin all; 13 sessions checked in <root>/projects
```

A pattern that starts with `-` goes after `--`.

```scrut
$ cc-sessions list -- -2b4d-4c6e | ids
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\talpha fixture session (escaped)
```

```scrut {output_stream: stderr}
$ cc-sessions list -2b4d
cc-sessions: unknown option "-2b4d" for list; valid options: --skill, --cwd, --since, --until, --origin, --full; to pass text that starts with -, put it after --; see cc-sessions list --help
[2]
```

## Skill

`--skill` lists sessions where the skill loaded and adds the `skill` field: the exact name and how it loaded.

```scrut
$ cc-sessions list --skill alpha-helper | cut -f 1,8; cc-sessions list --skill doctor | cut -f 1,8
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\talpha-helper tool (escaped)
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\tdoctor bundled (escaped)
```

Bare and namespaced names match by their last segment; the field shows the exact name.

```scrut
$ cc-sessions list --skill review | cut -f 1,8; cc-sessions list --skill other:review | cut -f 1,8
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\tdemo:review skill (escaped)
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\tdemo:review skill (escaped)
```

A harness command with `<skill-format>` and an orphan skill body are loads too.

```scrut
$ cc-sessions list --skill fixture-focus | cut -f 1,8; cc-sessions list --skill orphan-skill | cut -f 1,8
c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f\tfixture-focus bundled (escaped)
f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4\torphan-skill orphan (escaped)
```

A failed Skill call, a skill that is only listed, and a slash command without a body are not loads.

```scrut
$ cc-sessions list --skill nope 2>&1 | cc_test_rel; cc-sessions list --skill gamma-helper 2>&1 | cc_test_rel; cc-sessions list --skill effort 2>&1 | cc_test_rel
cc-sessions: no sessions with --skill nope --origin cli; 13 sessions checked in <root>/projects
cc-sessions: no sessions with --skill gamma-helper --origin cli; 13 sessions checked in <root>/projects
cc-sessions: no sessions with --skill effort --origin cli; 13 sessions checked in <root>/projects
```

`SKILLS` is a copy of the fixtures where BETA has one sub-agent that loads `beta-helper` and an internal compaction agent that loads `beta-helper` and `hidden-helper`.

```scrut
$ SKILLS=$CC_TEST_TMP/skills && cc_test_install_config "$SKILLS"
> SD=$SKILLS/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e/subagents
> loads() {
>   local id=$1 file=$2 skill n=1; shift 2
>   printf '{"parentUuid":null,"isSidechain":true,"userType":"external","cwd":"/tmp/sessions-fixture/beta","sessionId":"b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e","version":"2.1.206","agentId":"%s","type":"user","message":{"role":"user","content":"Use the helpers."},"uuid":"f1000000-0000-4000-8000-000000000000","timestamp":"2026-07-15T09:10:00.000Z"}\n' "$id" > "$file"
>   for skill in "$@"; do
>     printf '{"parentUuid":null,"isSidechain":true,"agentId":"%s","type":"assistant","uuid":"f100000%d-0000-4000-8000-00000000000a","timestamp":"2026-07-15T09:10:0%d.000Z","message":{"id":"msg_fx%d","type":"message","role":"assistant","model":"claude-haiku-5-5","content":[{"type":"tool_use","id":"toolu_fx%d","name":"Skill","input":{"skill":"%s"}}],"usage":{"input_tokens":1,"output_tokens":1}}}\n' "$id" "$n" "$n" "$n" "$n" "$skill" >> "$file"
>     printf '{"parentUuid":null,"isSidechain":true,"agentId":"%s","type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_fx%d","content":"Launching skill: %s"}]},"uuid":"f100000%d-0000-4000-8000-00000000000b","timestamp":"2026-07-15T09:10:0%d.000Z"}\n' "$id" "$n" "$skill" "$n" "$n" >> "$file"
>     n=$((n + 1))
>   done
> }
> loads a1b2c3d4e5f6a7b8c "$SD/agent-a1b2c3d4e5f6a7b8c.jsonl" beta-helper
> loads acompact-0b1c2d "$SD/agent-acompact-0b1c2d.jsonl" beta-helper hidden-helper
```

A load in a sub-agent lists the session and counts the agents it happened in; internal agents are left out.

```scrut
$ CLAUDE_CONFIG_DIR=$SKILLS cc-sessions list --skill beta-helper | cut -f 1,8
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\tbeta-helper tool +1 agents (escaped)
```

```scrut
$ CLAUDE_CONFIG_DIR=$SKILLS cc-sessions list --skill hidden-helper 2>&1 | cc_test_rel "$SKILLS"
cc-sessions: no sessions with --skill hidden-helper --origin cli; 13 sessions checked in <root>/projects
```

A data root without any agent transcript still finds main-transcript loads.

```scrut
$ ALONE=$CC_TEST_TMP/alone && mkdir -p "$ALONE/projects/-tmp-alone" && cp "$UNDER.jsonl" "$ALONE/projects/-tmp-alone/"
> CLAUDE_CONFIG_DIR=$ALONE cc-sessions list --skill orphan-skill | cut -f 1,8
f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4\torphan-skill orphan (escaped)
```

`--skill` combines with a pattern.

```scrut
$ cc-sessions list --skill alpha-helper 'alpha draft' | ids
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\talpha fixture session\talpha-helper tool (escaped)
```

## Working directory

`--cwd` matches a cwd equal to the path or under it, at a path boundary; a trailing slash does not matter.

```scrut
$ cc-sessions list --cwd /tmp/sessions-fixture/beta/ | ids; cc-sessions list --cwd '/tmp/sessions fixture' | ids
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\tFind where the header should live. (escaped)
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\tSummarise the beta build failures. (escaped)
f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4\tList the files with spaces in their names. (escaped)
```

```scrut
$ cc-sessions list --cwd /tmp/sessions-fixture/bet 2>&1 | cc_test_rel
cc-sessions: no sessions with --cwd /tmp/sessions-fixture/bet --origin cli; 13 sessions checked in <root>/projects
```

Any cwd of the transcript counts: RELOC moved to `elsewhere` mid-session; its `cwd` field is still the first one.

```scrut
$ cc-sessions list --cwd /tmp/sessions-fixture/elsewhere | cut -f 1,6
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d\t/tmp/sessions-fixture/reloc (escaped)
```

A relative path is taken from the current directory.

```scrut
$ (cd /tmp && cc-sessions list --cwd sessions-fixture/flat | ids)
c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a\tFlat era config loader search (escaped)
```

## Time bounds

`--since` and `--until` filter by modified time; a date covers the whole day.

```scrut
$ cc-sessions list --since 2026-10-27 | cut -f 1,2; cc-sessions list --since 2026-07-15 --until 2026-07-20 | cut -f 1,2
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t2026-10-30T11:30:00Z (escaped)
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d\t2026-10-28T12:00:00Z (escaped)
f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4\t2026-10-27T12:00:00Z (escaped)
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\t2026-07-20T12:00:00Z (escaped)
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\t2026-07-15T12:00:00Z (escaped)
```

A printed `modified` passed to `--until` includes that session.

```scrut
$ cc-sessions list --until 2026-10-27T12:00:00Z --limit 2 | cut -f 1,2
f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4\t2026-10-27T12:00:00Z (escaped)
c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f\t2026-10-26T15:00:00Z (escaped)
```

An age counts back from now.

```scrut
$ cc-sessions list --since 100000d | wc -l | tr -d ' '; cc-sessions list --since 0s 2>/dev/null | wc -l | tr -d ' '
11
0
```

A handle is a usage error: handles belong to one session.

```scrut {output_stream: stderr}
$ cc-sessions list --since L5
cc-sessions: --since L5 is a handle, which only per-session records have; pass a timestamp (2026-10-30T10:00:04Z, 2026-10-30) or an age (7d) to compare modified times; see cc-sessions list --help
[2]
```

```scrut {output_stream: stderr}
$ cc-sessions list --until yesterday
cc-sessions: --until takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got "yesterday"; pass one of those forms; see cc-sessions list --help
[2]
```

## Limit and continuation

`--limit` stops after that many sessions; the notice says that older sessions were not all examined and how to
continue: `--until` the modified time of the next session, which the page never shares.

```scrut
$ cc-sessions list --limit 3 2> notice.txt | ids; cat notice.txt
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\talpha fixture session (escaped)
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d\tShow the release notes (escaped)
f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4\tList the files with spaces in their names. (escaped)
cc-sessions: output stopped at --limit 3 after 3 sessions; older sessions were not all examined; continue with --until 2026-10-26T15:00:00Z
```

No notice when exactly the limit qualifies; `--limit 0` lists everything.

```scrut {output_stream: combined}
$ cc-sessions list --limit 11 2>&1 | wc -l | tr -d ' '; cc-sessions list --limit 0 2>&1 | wc -l | tr -d ' '
11
11
```

`--max-chars` works the same way: listing stops at the last whole row that fits, and says where to continue.

```scrut
$ cc-sessions list --max-chars 300 2> notice.txt | cut -f 1; cat notice.txt
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d
cc-sessions: output stopped at --max-chars 300 after 2 sessions; older sessions were not all examined; continue with --until 2026-10-27T12:00:00Z
```

A first row longer than the budget is not printed; the notice gives the size that fits it.

```scrut {output_stream: stderr}
$ cc-sessions list --max-chars 50
cc-sessions: output stopped at --max-chars 50 after 0 sessions; the next record is 118 characters; continue with --max-chars 118
```

`GEN` holds 52 generated sessions, one a minute; the newest has a long two-line first prompt.

```scrut
$ GEN=$CC_TEST_TMP/gen && mkdir -p "$GEN/projects/-tmp-gen"
> for i in $(seq 10 61); do
>   id=00000000-0000-4000-8000-0000000000$i text="Generated prompt $i"
>   [ "$i" = 61 ] && text="Generated prompt $i, the long one:\\nline two$(printf ' word%.0s' $(seq 1 20))"
>   printf '{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/tmp/gen","sessionId":"%s","version":"2.1.316","type":"user","message":{"role":"user","content":"%s"},"uuid":"%s","timestamp":"2026-09-01T12:00:00.000Z","entrypoint":"cli"}\n' "$id" "$text" "$id" > "$GEN/projects/-tmp-gen/$id.jsonl"
>   touch -t "$(printf '2026090112%02d.00' $((i - 10)))" "$GEN/projects/-tmp-gen/$id.jsonl"
> done
```

The default limit is 50 sessions.

```scrut
$ CLAUDE_CONFIG_DIR=$GEN cc-sessions list 2> notice.txt | wc -l | tr -d ' '; cat notice.txt
50
cc-sessions: output stopped at --limit 50 after 50 sessions; older sessions were not all examined; continue with --until 2026-09-01T12:01:00Z
```

`TIE` holds six sessions: `0000aa01` and `0000aa02` modified at 12:05, `0000bb01` to `0000bb03` at 12:04, and
`0000cc01` at 12:03.

```scrut
$ TIE=$CC_TEST_TMP/tie && mkdir -p "$TIE/projects/-tmp-tie"
> for s in aa01:05 aa02:05 bb01:04 bb02:04 bb03:04 cc01:03; do id=0000${s%:*}-0000-4000-8000-000000000000
>   printf '{"type":"user","message":{"role":"user","content":"tied session %s"},"uuid":"%s","timestamp":"2026-09-05T12:00:00.000Z","sessionId":"%s","cwd":"/tmp/tie"}\n' "${s%:*}" "$id" "$id" > "$TIE/projects/-tmp-tie/$id.jsonl"
>   touch -t "2026090512${s#*:}.00" "$TIE/projects/-tmp-tie/$id.jsonl"; done
```

A page never splits the sessions that share one modified second: it ends before them, and the notice continues at
their time.

```scrut
$ CLAUDE_CONFIG_DIR=$TIE cc-sessions list --limit 3 2> notice.txt | cut -f 1,2; cat notice.txt
> CLAUDE_CONFIG_DIR=$TIE cc-sessions list --until 2026-09-05T12:04:00Z --limit 3 2> notice.txt | cut -f 1; cat notice.txt
0000aa01-0000-4000-8000-000000000000\t2026-09-05T12:05:00Z (escaped)
0000aa02-0000-4000-8000-000000000000\t2026-09-05T12:05:00Z (escaped)
cc-sessions: output stopped at --limit 3 after 2 sessions; older sessions were not all examined; continue with --until 2026-09-05T12:04:00Z
0000bb01-0000-4000-8000-000000000000
0000bb02-0000-4000-8000-000000000000
0000bb03-0000-4000-8000-000000000000
cc-sessions: output stopped at --limit 3 after 3 sessions; older sessions were not all examined; continue with --until 2026-09-05T12:03:00Z
```

When those sessions alone fill the page, the page holds them all, past the limit.

```scrut
$ CLAUDE_CONFIG_DIR=$TIE cc-sessions list --until 2026-09-05T12:04:00Z --limit 2 2> notice.txt | cut -f 1; cat notice.txt
> CLAUDE_CONFIG_DIR=$TIE cc-sessions list --since 2026-09-05T12:04:00Z --until 2026-09-05T12:04:00Z --limit 2 2>&1 | wc -l | tr -d ' '
0000bb01-0000-4000-8000-000000000000
0000bb02-0000-4000-8000-000000000000
0000bb03-0000-4000-8000-000000000000
cc-sessions: output stopped at --limit 2 after 3 sessions, which share one modified time; older sessions were not all examined; continue with --until 2026-09-05T12:03:00Z
3
```

`--max-chars` counts characters, whatever the locale: a row whose label holds 80 two-byte characters fits a budget
of its length in characters.

```scrut
$ U=$CC_TEST_TMP/utf && mkdir -p "$U/projects/-tmp-utf" && id=0000ee01-0000-4000-8000-000000000000
> printf '{"type":"user","message":{"role":"user","content":"%s"},"uuid":"%s","timestamp":"2026-09-06T10:00:00.000Z","sessionId":"%s","cwd":"/tmp/utf"}\n' "$(printf 'é%.0s' $(seq 1 80))" "$id" "$id" > "$U/projects/-tmp-utf/$id.jsonl"
> n=$(CLAUDE_CONFIG_DIR=$U cc-sessions list --max-chars 0 | LC_ALL=en_US.UTF-8 wc -m | tr -d ' ')
> CLAUDE_CONFIG_DIR=$U cc-sessions list --max-chars "$n" 2>/dev/null | wc -l | tr -d ' '; CLAUDE_CONFIG_DIR=$U cc-sessions list --max-chars "$((n - 1))" 2>&1 | cut -d ';' -f 1
1
cc-sessions: output stopped at --max-chars * after 0 sessions (glob)
```

Labels are cut to 100 characters, with whitespace runs shown as one space.

```scrut
$ CLAUDE_CONFIG_DIR=$GEN cc-sessions list --limit 1 | cut -f 7
Generated prompt 61, the long one: line two word word word word word word word word word word word…
```

`--full` shows the whole label, its newline escaped.

```scrut
$ CLAUDE_CONFIG_DIR=$GEN cc-sessions list --limit 1 --full | cut -f 7
Generated prompt 61, the long one:\\nline two word word word word word word word word word word word word word word word word word word word word (escaped)
```

## Usage errors and empty answers

More than one pattern is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions list alpha beta
cc-sessions: list takes at most one <pattern>, got 2; quote a pattern that holds spaces; see cc-sessions list --help
[2]
```

An option without its value is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions list --skill
cc-sessions: --skill needs a value; pass one after it; see cc-sessions list --help
[2]
```

An empty answer exits 0 with nothing on stdout and a notice naming the filters and how many sessions were checked.

```scrut
$ out=$(cc-sessions list zzz-none --since 2026-10-01 2> err.txt); echo "exit $? stdout ${#out}"; cc_test_rel < err.txt
exit 0 stdout 0
cc-sessions: no sessions match "zzz-none" with --since 2026-10-01 --origin cli; 6 sessions checked in <root>/projects
```

A missing data root means the command could not answer.

```scrut {output_stream: stderr}
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions list
cc-sessions: no transcripts directory at /nonexistent/sessions-fixture/projects; set CLAUDE_CONFIG_DIR to the directory that holds projects/; see cc-sessions list --help
[1]
```

## Compatibility

The listing is the same with jq 1.7 first on PATH and under `/bin/bash`.

```scrut
$ JQ17=$CC_TEST_TMP/jq17list && mkdir -p "$JQ17" && ln -s /usr/bin/jq "$JQ17/jq"
> cc-sessions list --origin all --skill review > modern.txt
> PATH="$JQ17:$PATH" cc-sessions list --origin all --skill review > old.txt && cmp modern.txt old.txt && echo same-jq
> /bin/bash "$CC_TEST_ROOT/bin/cc-sessions" list 'header' | ids
same-jq
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\tFind where the header should live. (escaped)
```
