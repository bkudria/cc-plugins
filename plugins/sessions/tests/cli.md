---
prepend: [setup.md]
---

# cc-sessions dispatcher and session references

## Version

`--version` names the tool, the version in plugin.json and the plugin.

```scrut
$ cc-sessions --version
cc-sessions *.*.* (sessions plugin) (glob)
```

The version is the one in `.claude-plugin/plugin.json`.

```scrut
$ manifest=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$CC_TEST_ROOT/.claude-plugin/plugin.json")
> [ "$(cc-sessions --version)" = "cc-sessions $manifest (sessions plugin)" ] && echo matches
matches
```

## Help index

A copy of the plugin with an extra command shows that commands are discovered from `libexec/`.

```scrut
$ PLUGIN=$CC_TEST_TMP/plugin && mkdir -p "$PLUGIN"
> cp -R "$CC_TEST_ROOT/bin" "$CC_TEST_ROOT/lib" "$CC_TEST_ROOT/libexec" "$CC_TEST_ROOT/.claude-plugin" "$PLUGIN/"
> printf '%s\n' '#!/bin/bash' 'case $1 in' \
>   '  --synopsis) echo "probe <session>  answer a test question" ;;' \
>   '  -h|--help) echo "probe help text" ;;' \
>   '  *) echo "probe ran: $*" ;;' 'esac' > "$PLUGIN/libexec/probe"
> chmod +x "$PLUGIN/libexec/probe"
```

`cc-sessions`, `-h` and `--help` print the same index and exit 0.

```scrut
$ "$PLUGIN/bin/cc-sessions" > bare.txt && "$PLUGIN/bin/cc-sessions" -h > short.txt && "$PLUGIN/bin/cc-sessions" --help > long.txt
> cmp bare.txt short.txt && cmp bare.txt long.txt && echo same
same
```

The index starts with a usage summary and lists each command's synopsis line.

```scrut
$ head -n 1 long.txt; grep -n '^  probe ' long.txt
cc-sessions: investigate Claude Code session transcripts
*:  probe <session>  answer a test question (glob)
```

Every command in `libexec/` appears exactly once in the index.

```scrut
$ for c in "$PLUGIN"/libexec/*; do n=${c##*/}; printf '%s %s\n' "$n" "$(grep -c "^  $n " long.txt)"; done | grep -v ' 1$' || echo all-listed
all-listed
```

The index ends with the status of each dependency.

```scrut
$ tail -n 1 long.txt
deps: jq * ok, rg * ok (glob)
```

Synopses name each command's operands and its own options. The options most commands share are explained once, in
the index, and no synopsis repeats them.

```scrut
$ grep -E '^  [a-z]+ .*\[--(since|until|full)[] ]' long.txt || echo none
> grep -E '^  --since T, --until T|^  --full|^  --agents' long.txt | awk '{ print $1 }'
none
--since
--full
--agents
```

The index says how a field's text is escaped, as every command writes it: CR and the other control characters too.

```scrut
$ sed -n '/^Output:/,/^Per-session/p' long.txt
Output: one record per line, fields separated by TAB. Inside a field TAB, newline, CR and backslash
are written \t, \n, \r and \\, and the other control characters and DEL as \u00XX (lowercase hex);
an empty field is "-"; no header (each command's --help names its fields).
Per-session records start with a handle L<line> into the transcript, or into the file named by
```

Per-session records name their file in the `src` field, as every command's help calls it.

```scrut
$ grep -c 'src field' long.txt
1
```

The index stays within 4096 bytes.

```scrut
$ [ "$(wc -c < long.txt)" -le 4096 ] && echo small
small
```

Help never reads transcripts: it works and is unchanged when the data root does not exist.

```scrut
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture "$PLUGIN/bin/cc-sessions" --help > missing-root.txt; echo "exit $?"; cmp long.txt missing-root.txt && echo same
exit 0
same
```

`<command> -h` and `<command> --help` print that command's help and exit 0.

```scrut
$ "$PLUGIN/bin/cc-sessions" probe -h && "$PLUGIN/bin/cc-sessions" probe --help
probe help text
probe help text
```

Help for a command wins over its other arguments.

```scrut
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture "$PLUGIN/bin/cc-sessions" probe nothing-here --help
probe help text
```

When the bare name `cc-sessions` on PATH is another program, the index warns and names this binary.

```scrut
$ mkdir -p "$CC_TEST_TMP/shadow" && printf '#!/bin/sh\necho shadow\n' > "$CC_TEST_TMP/shadow/cc-sessions" && chmod +x "$CC_TEST_TMP/shadow/cc-sessions"
> PATH="$CC_TEST_TMP/shadow:$PATH" "$PLUGIN/bin/cc-sessions" --help | grep '^warning:' | cc_test_rel "$CC_TEST_TMP"
warning: cc-sessions on PATH is <root>/shadow/cc-sessions, not this program; call <root>/plugin/bin/cc-sessions
```

It also warns when `cc-sessions` is not on PATH at all.

```scrut
$ PATH=/usr/bin:/bin "$PLUGIN/bin/cc-sessions" --help | grep '^warning:' | cc_test_rel "$CC_TEST_TMP"
warning: cc-sessions is not on PATH; call <root>/plugin/bin/cc-sessions
```

There is no warning when PATH finds this binary.

```scrut
$ cc-sessions --help | grep '^warning:' || echo no-warning
no-warning
```

Every command's help has one shape: it starts with the usage line, documents every option the command accepts,
states its empty answer and its exit status in the same words, and fits in 40 lines of at most 100 characters.

```scrut
$ for c in $(cd "$CC_TEST_ROOT/libexec" && ls); do
>   [ "$c" = jq ] && continue
>   cc-sessions "$c" --help > "help.$c"
>   head -n 1 "help.$c" | grep -q "^Usage: cc-sessions $c " || echo "$c: no usage line"
>   grep -q '^Empty answer: ' "help.$c" || echo "$c: no empty answer"
>   grep -q '^Exit status: 0 answered, also when empty; 1 ' "help.$c" || echo "$c: no exit status"
>   [ "$(wc -l < "help.$c")" -le 40 ] || echo "$c: $(wc -l < "help.$c" | tr -d ' ') lines"
>   jq -R -r --arg c "$c" 'select(length > 100) | "\($c): a line of \(length) characters"' "help.$c"
>   cc-sessions "$c" --no-such-option 2>&1 | sed -n 's/.*valid options: \([^;]*\);.*/\1/p' | tr ',' '\n' | tr -d ' ' |
>     while read -r o; do grep -q -e "$o\b" "help.$c" || echo "$c: $o undocumented"; done
> done; echo checked
checked
```

## Usage errors

An unknown command exits 2, prints nothing on stdout, and says what went wrong, how to fix it and where help is.

```scrut
$ out=$("$PLUGIN/bin/cc-sessions" prob 2> err.txt); echo "exit $? stdout ${#out}"; cat err.txt
exit 2 stdout 0
cc-sessions: unknown command "prob"; did you mean "probe"? Commands: *probe*; see cc-sessions --help (glob)
```

Without a close match the error lists the commands.

```scrut {output_stream: stderr}
$ "$PLUGIN/bin/cc-sessions" zzz
cc-sessions: unknown command "zzz"; use one of: *probe*; see cc-sessions --help (glob)
[2]
```

A name that is not a plain command name never reaches the file system.

```scrut {output_stream: stderr}
$ "$PLUGIN/bin/cc-sessions" ../bin/cc-sessions
cc-sessions: unknown command "../bin/cc-sessions"; use one of: *probe*; see cc-sessions --help (glob)
[2]
```

An unknown option before the command exits 2.

```scrut {output_stream: stderr}
$ "$PLUGIN/bin/cc-sessions" --frob probe
cc-sessions: unknown option "--frob"; put options after the command name, as in cc-sessions <command> [<option>...]; see cc-sessions --help
[2]
```

`--` ends option scanning, so `--help` after it is an operand.

```scrut
$ "$PLUGIN/bin/cc-sessions" probe x -- --help
probe ran: x -- --help
```

## Session references

`where` prints what a reference resolves to: kind, owning session, agent id and workflow run.

```scrut
$ where() { cc-sessions jq '"\(.kind) \(.session) \(.agent // "-") \(.run // "-")"' "$@" -- -r; }
> where_file() { cc-sessions jq '.file' "$@" -- -r | cc_test_rel; }
```

A full session id, or a unique prefix of it, resolves to the main transcript.

```scrut
$ where a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e && where a7c3e9f && where_file a7c3e9f
main a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e - -
main a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e - -
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl
```

Each other session resolves from a four-character prefix.

```scrut
$ for p in b5a7 b2d4 b9e1 c4e6 d1f3 e5a7 f6b8; do where "$p"; done
main b5a7c9e1-0d2f-4a4b-9c6e-8f0a2b4c6d8e - -
main b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e - -
main b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c - -
main c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a - -
main d1f3b5d7-9e0a-4c2e-a4b6-c8d0e2f4a6b8 - -
main e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d - -
main f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4 - -
```

A sub-agent resolves from its full id, a prefix with or without the leading `a`, and its owning session is the parent.

```scrut
$ where a7c3e9b2d4f6a8c01 && where a7c3e9b && where 7c3e9b && where_file 7c3e9b
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e a7c3e9b2d4f6a8c01 -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e a7c3e9b2d4f6a8c01 -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e a7c3e9b2d4f6a8c01 -
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-a7c3e9b2d4f6a8c01.jsonl
```

BETA's sub-agent exists only under BETA.

```scrut
$ where a4c6e8f0a2b4c6d8e && where 4c6e8f0a
subagent b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e a4c6e8f0a2b4c6d8e -
subagent b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e a4c6e8f0a2b4c6d8e -
```

Flat-layout agents (8 hex digits, no leading `a`) belong to the session named by their `sessionId`.

```scrut
$ where 5f6a7b8c && where 9a0b1c2d && where_file 9a0b1c2d
flat c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a 5f6a7b8c -
flat c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a 9a0b1c2d -
<root>/projects/-tmp-sessions-fixture-flat/agent-9a0b1c2d.jsonl
```

Internal, named, teammate and fork agents resolve by any part of their id after `agent-`.

```scrut
$ for p in acompact compact-3f9a1c prompt_suggestion aprompt_suggestion-8d2e4b planner aplanner does-the-lexer adoes a3d1e5f7; do where "$p"; done
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e acompact-3f9a1c -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e acompact-3f9a1c -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e aprompt_suggestion-8d2e4b -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e aprompt_suggestion-8d2e4b -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e aplanner-5e1f0a2b3c4d5e6f -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e aplanner-5e1f0a2b3c4d5e6f -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e adoes-the-lexer-0a1b2c3d4e5f6a7b -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e adoes-the-lexer-0a1b2c3d4e5f6a7b -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e a3d1e5f7a9b0c2d4e -
```

Workflow agents carry their run id.

```scrut
$ where a0f1 && where a9e8 && where_file a9e8
workflow-agent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e a0f1e2d3c4b5a6978 wf_5d1c9a7e-3b2
workflow-agent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e a9e8d7c6b5a4f3e21 wf_5d1c9a7e-3b2
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/workflows/wf_5d1c9a7e-3b2/agent-a9e8d7c6b5a4f3e21.jsonl
```

`wf_<run-id>` resolves to the session that ran the workflow.

```scrut
$ where wf_5d1c9a7e-3b2
main a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e - -
```

A prefix shared by a session and a sub-agent is ambiguous: exit 2, nothing on stdout, and each candidate with its kind, parent session and path.

```scrut
$ out=$(cc-sessions jq '.file' a7c3 2> err.txt); echo "exit $? stdout ${#out}"; cc_test_rel < err.txt
exit 2 stdout 0
cc-sessions: "a7c3" matches 2 transcripts; pass a longer prefix or one of these paths; see cc-sessions jq --help
cc-sessions:   a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\tmain\t-\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl (escaped)
cc-sessions:   a7c3e9b2d4f6a8c01\tsubagent\ta7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-a7c3e9b2d4f6a8c01.jsonl (escaped)
```

```scrut {output_stream: stderr}
$ cc-sessions jq '.file' a7c3e9
cc-sessions: "a7c3e9" matches 2 transcripts; pass a longer prefix or one of these paths; see cc-sessions jq --help
cc-sessions:   a7c3e9f1-* (glob)
cc-sessions:   a7c3e9b2d4f6a8c01* (glob)
[2]
```

An id that names no transcript exits 2. Entry uuids are not file names.

```scrut {output_stream: stderr}
$ cc-sessions jq '.file' e0a0
cc-sessions: no transcript matches "e0a0"; pass a session or agent id, a prefix of at least 4 characters, or a path; see cc-sessions jq --help
[2]
```

An ambiguous reference lists at most 20 candidates. Files under `memory/` are never transcripts.

```scrut
$ RR=$CC_TEST_TMP/refs && mkdir -p "$RR/projects/-tmp-refs/memory" && for i in $(seq -w 1 22); do : > "$RR/projects/-tmp-refs/abcd00$i.jsonl"; done
> : > "$RR/projects/-tmp-refs/memory/zzzz1234.jsonl"
> CLAUDE_CONFIG_DIR=$RR cc-sessions jq '.file' abcd 2> err.txt; echo "exit $?"; wc -l < err.txt | tr -d ' '; tail -n 1 err.txt
> CLAUDE_CONFIG_DIR=$RR cc-sessions jq '.file' zzzz 2>&1
exit 2
22
cc-sessions:   … and 2 more
cc-sessions: no transcript matches "zzzz"; pass a session or agent id, a prefix of at least 4 characters, or a path; see cc-sessions jq --help
[2]
```

`--` ends the options of every command: what follows is an operand.

```scrut
$ for c in overview prompts conversation tools agents schema; do cc-sessions "$c" -- a7c3e9f > /dev/null 2>&1; echo "$c $?"; done
> cc-sessions entry -- a7c3e9f L4 > /dev/null; echo "entry $?"; cc-sessions list -- alpha > /dev/null; echo "list $?"
> cc-sessions search -- parser a7c3e9f > /dev/null; echo "search $?"
overview 0
prompts 0
conversation 0
tools 0
agents 0
schema 0
entry 0
list 0
search 0
```

A reference that is too short or has other characters is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions jq '.file' a7c; cc-sessions jq '.file' 'a7c3*'; echo "exit $?" >&2
cc-sessions: "a7c" is not a session reference; pass current, a path, wf_<run-id>, or an id or prefix of at least 4 characters from [A-Za-z0-9_-]; see cc-sessions jq --help
cc-sessions: "a7c3*" is not a session reference; pass current, a path, wf_<run-id>, or an id or prefix of at least 4 characters from [A-Za-z0-9_-]; see cc-sessions jq --help
exit 2
```

`current` is the session in `CLAUDE_CODE_SESSION_ID`.

```scrut
$ CLAUDE_CODE_SESSION_ID=a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e where current
main a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e - -
```

Without `CLAUDE_CODE_SESSION_ID`, `current` is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions jq '.file' current
cc-sessions: "current" needs CLAUDE_CODE_SESSION_ID, which is not set; pass a session id or a path instead; see cc-sessions jq --help
[2]
```

A `.jsonl` path is used as given, with `~/` expanded.

```scrut
$ where "$ALPHA.jsonl" && where "~/.claude/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/agent-aplanner-5e1f0a2b3c4d5e6f.jsonl"
main a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e - -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e aplanner-5e1f0a2b3c4d5e6f -
```

A session directory resolves to its `.jsonl`; a file under `tool-results/` resolves to the session that owns it.

```scrut
$ where "$ALPHA" && where "$ALPHA/" && where "$ALPHA/tool-results/b4k7m2q9x.txt" && where "$RELOC/tool-results/c8n2v5x1q.txt"
main a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e - -
main a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e - -
main a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e - -
main e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d - -
```

A relative path works too.

```scrut
$ (cd "$P/-tmp-sessions-fixture-reloc" && where ./e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d.jsonl)
main e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d - -
```

A path that no longer exists falls back to its basename as an id, so stored paths and ephemeral task files still resolve.

```scrut
$ where /tmp/sessions-fixture/gone/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl && where /private/tmp/claude-501/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/tasks/a7c3e9b2d4f6a8c01.output
main a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e - -
subagent a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e a7c3e9b2d4f6a8c01 -
```

A data root whose path contains a space works.

```scrut
$ CLAUDE_CONFIG_DIR=$CC_TEST_SPACE_CONFIG cc-sessions jq '"\(.kind) \(.file)"' a7c3e9f a0f1 -- -r | cc_test_rel "$CC_TEST_SPACE_CONFIG"
main <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl
workflow-agent <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/workflows/wf_5d1c9a7e-3b2/agent-a0f1e2d3c4b5a6978.jsonl
```

Without `CLAUDE_CONFIG_DIR` the data root is `~/.claude/projects`.

```scrut
$ (unset CLAUDE_CONFIG_DIR; cc-sessions jq '.file' a9e8 -- -r) | cc_test_rel
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/subagents/workflows/wf_5d1c9a7e-3b2/agent-a9e8d7c6b5a4f3e21.jsonl
```

A `projects/` directory that is a symbolic link is followed, by every lookup.

```scrut
$ SYM=$CC_TEST_TMP/symcfg && mkdir -p "$SYM" && ln -s "$P" "$SYM/projects"
> CLAUDE_CONFIG_DIR=$SYM cc-sessions jq '.file' a7c3e9f -- -r | cc_test_rel "$SYM"
> CLAUDE_CONFIG_DIR=$SYM cc-sessions list --origin all | wc -l | tr -d ' '
> CLAUDE_CONFIG_DIR=$SYM cc-sessions list --skill alpha-helper | cut -f 1
> CLAUDE_CONFIG_DIR=$SYM cc-sessions search CONTENT_TERM_ALPHA | cut -f 1
> CLAUDE_CONFIG_DIR=$SYM cc-sessions schema --since 100000d 2>/dev/null | grep -c '^files'
<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl
12
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e
9
```

A relative `CLAUDE_CONFIG_DIR` is made absolute, even one whose name starts with `-`.

```scrut
$ mkdir -p "$CC_TEST_TMP/-cfg" && cp -Rp "$CLAUDE_CONFIG_DIR/." "$CC_TEST_TMP/-cfg/"
> (cd "$HOME" && CLAUDE_CONFIG_DIR=.claude cc-sessions list no-session-has-this 2>&1) | cc_test_rel "$HOME"
> (cd "$CC_TEST_TMP" && CLAUDE_CONFIG_DIR=-cfg cc-sessions list --origin all) | wc -l | tr -d ' '
cc-sessions: no sessions match "no-session-has-this" with --origin cli; 12 sessions checked in <root>/.claude/projects
12
```

A missing data root means the command could not answer: exit 1.

```scrut {output_stream: stderr}
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions jq '.file' a7c3e9f
cc-sessions: no transcripts directory at /nonexistent/sessions-fixture/projects; set CLAUDE_CONFIG_DIR to the directory that holds projects/; see cc-sessions jq --help
[1]
```

A transcript that cannot be read means the command could not answer: exit 1, with one error that names the file.

```scrut
$ UR=$CC_TEST_TMP/unreadable && mkdir -p "$UR/projects/-tmp-u" && printf '%s\n' '{"type":"user","uuid":"u1","message":{"content":"Hi."}}' > "$UR/projects/-tmp-u/f0f0f0f0.jsonl" && chmod 000 "$UR/projects/-tmp-u/f0f0f0f0.jsonl"
> for c in overview prompts conversation tools agents schema 'entry - L1' 'search Hi'; do set -- $c; [ "$1" = entry ] && set -- entry f0f0f0f0 L1; [ "$1" = search ] && set -- search Hi f0f0f0f0; [ $# -eq 1 ] && set -- "$1" f0f0f0f0
>   CLAUDE_CONFIG_DIR=$UR cc-sessions "$@" > /dev/null 2> err.txt; echo "$1 exit $? errors $(wc -l < err.txt | tr -d ' ') $(sed -n 's/^cc-sessions: \(cannot read\) .*f0f0f0f0.jsonl; .*/\1/p' err.txt)"; done
> chmod 644 "$UR/projects/-tmp-u/f0f0f0f0.jsonl"
overview exit 1 errors 1 cannot read
prompts exit 1 errors 1 cannot read
conversation exit 1 errors 1 cannot read
tools exit 1 errors 1 cannot read
agents exit 1 errors 1 cannot read
schema exit 1 errors 1 cannot read
entry exit 1 errors 1 cannot read
search exit 1 errors 1 cannot read
```

## cc-sessions jq

The filter's input is one transcript object per operand, in operand order; output is compact JSON by default.

```scrut
$ cc-sessions jq '{kind, session}' b2d4 a0f1
{"kind":"main","session":"b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e"}
{"kind":"workflow-agent","session":"a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e"}
```

An operand named twice is read once.

```scrut
$ cc-sessions jq '.kind' b2d4 "$BETA.jsonl" b2d4f6a8
"main"
```

Options after `--` go to jq unchanged.

```scrut
$ cc-sessions jq '"\($x): \(.kind)"' b2d4 -- -r --arg x kind && cc-sessions jq '{a: 1}' -- -n --indent 1
kind: main
{
 "a": 1
}
```

With `-s` the input is one array holding every transcript object.

```scrut
$ cc-sessions jq 'map(.kind) | join(",")' a7c3e9f a0f1 -- -s -r
main,workflow-agent
```

With `-n` the filter runs once on null and needs no operand.

```scrut
$ cc-sessions jq '"pure"' -- -n -r && cc-sessions jq '[s::transcripts | .kind]' a0f1 -- -nc
pure
["workflow-agent"]
```

`-` reads stdin, explicitly.

```scrut
$ printf '{"type":"user","uuid":"u1"}\n{"type":"ai-title"}\n' | cc-sessions jq '[.file, .kind, (.rows | length)]' -
["-","file",2]
```

Any other file is read as JSON lines as given: a workflow journal, for example.

```scrut
$ cc-sessions jq '[.kind, .run, .rows[1].e.label]' "$WF/journal.jsonl"
["journal","wf_5d1c9a7e-3b2","scan"]
```

jq's exit status is passed through: 5 for a runtime error, 3 for a compile error, 1 for `-e` on false.

```scrut
$ cc-sessions jq 'error("boom")' b2d4 2>/dev/null; echo "exit $?"
> cc-sessions jq '.[' b2d4 2>/dev/null; echo "exit $?"
> cc-sessions jq 'false' b2d4 -- -e; echo "exit $?"
exit 5
exit 3
false
exit 1
```

A filter may end in a comment, in every input mode.

```scrut
$ cc-sessions jq '1 # one' -- -n && cc-sessions jq '.kind # the kind' b2d4 && cc-sessions jq 'length # how many' b2d4 a0f1 -- -s
1
"main"
2
```

Thousands of operands go to one jq run: the argument list does not grow with them, and the time grows in proportion.
`OPS` holds 4000 one-line files.

```scrut
$ OPS=$CC_TEST_TMP/ops/projects/-tmp-ops && mkdir -p "$OPS"
> for i in $(seq 1 4000); do printf '{"type":"user","uuid":"u%s"}\n' "$i" > "$OPS/$(printf '%08x' "$i")-0000-4000-8000-000000000000.jsonl"; done
```

```scrut {timeout: 40s}
$ cc-sessions jq '[.kind, (.rows | length)]' "$OPS"/*.jsonl --max-chars 0 | sort | uniq -c | sed 's/^ *//'
> cc-sessions jq 'map(.file) | unique | length' "$OPS"/*.jsonl "$OPS"/000001*.jsonl -- -s
4000 ["main",1]
4000
```

`schema` reads the same operands in the same way.

```scrut {timeout: 40s}
$ cc-sessions schema "$OPS"/*.jsonl | grep '^type'
type\tuser\t4000\t* (escaped) (glob)
```

No operand is a usage error unless `-n` is passed to jq.

```scrut {output_stream: stderr}
$ cc-sessions jq '.kind'
cc-sessions: jq needs at least one <session>, file or - operand; name a session, or pass -- -n to run the filter without input; see cc-sessions jq --help
[2]
```

No filter is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions jq
cc-sessions: jq needs a filter; pass one, as in cc-sessions jq '.kind' <session>; see cc-sessions jq --help
[2]
```

A jq option before `--` is an unknown option for this command.

```scrut {output_stream: stderr}
$ cc-sessions jq -r '.kind' b2d4
cc-sessions: unknown option "-r" for jq; pass jq options after --, as in cc-sessions jq '.kind' <session> -- -r; see cc-sessions jq --help
[2]
```

jq options that would replace the operands or the input format are refused.

```scrut
$ for o in --args --jsonargs --stream --stream-errors --seq -f --from-file --raw-input -R; do cc-sessions jq '.' b2d4 -- "$o" x; echo "exit $?"; done 2>&1 | sort | uniq -c | sed 's/^ *//'
1 cc-sessions: jq option "--args" is not supported here; operands are always transcripts and the filter is the first operand; see cc-sessions jq --help
1 cc-sessions: jq option "--from-file" is not supported here; operands are always transcripts and the filter is the first operand; see cc-sessions jq --help
1 cc-sessions: jq option "--jsonargs" is not supported here; operands are always transcripts and the filter is the first operand; see cc-sessions jq --help
1 cc-sessions: jq option "--raw-input" is not supported here; operands are always transcripts and the filter is the first operand; see cc-sessions jq --help
1 cc-sessions: jq option "--seq" is not supported here; operands are always transcripts and the filter is the first operand; see cc-sessions jq --help
1 cc-sessions: jq option "--stream" is not supported here; operands are always transcripts and the filter is the first operand; see cc-sessions jq --help
1 cc-sessions: jq option "--stream-errors" is not supported here; operands are always transcripts and the filter is the first operand; see cc-sessions jq --help
1 cc-sessions: jq option "-R" is not supported here; operands are always transcripts and the filter is the first operand; see cc-sessions jq --help
1 cc-sessions: jq option "-f" is not supported here; operands are always transcripts and the filter is the first operand; see cc-sessions jq --help
9 exit 2
```

The value of a jq option is never taken for an option.

```scrut
$ cc-sessions jq '$v' -- -n --arg v -s -r
-s
```

Unparseable lines are skipped with a notice on stderr; the answer still exits 0.

```scrut
$ cc-sessions jq '[(.rows | length), .skipped]' b2d4 2>&1 | cc_test_rel
cc-sessions: skipped 1 unparseable line in <root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e.jsonl: L20
[21,[20]]
```

stdin is never read unless `-` is an operand: a reader blocked on stdin would hang here.

```scrut {timeout: 20s}
$ mkfifo "$CC_TEST_TMP/never" && cc-sessions jq '.kind' b2d4 3<>"$CC_TEST_TMP/never" <&3
"main"
```

No command reads stdin: with a stdin that never ends, each one still answers.

```scrut {timeout: 60s}
$ for c in 'overview a7c3e9f' 'prompts a7c3e9f' 'conversation a7c3e9f' 'tools a7c3e9f' 'agents a7c3e9f' 'entry a7c3e9f L4' 'schema a7c3e9f' 'search parser a7c3e9f' 'search parser' 'list'; do
>   set -f; set -- $c; set +f; cc-sessions "$@" 3<>"$CC_TEST_TMP/never" <&3 > /dev/null 2>&1; echo "$1 $?"; done
overview 0
prompts 0
conversation 0
tools 0
agents 0
entry 0
schema 0
search 0
search 0
list 0
```

## Output budget

`--max-chars` stops stdout at a record boundary; the notice says how many records were left out and, for records that
start with a handle, where to continue. `recprobe` prints its operands as records, after `cc_several_files` when the
first operand is `several`.

```scrut
$ printf '%s\n' '#!/bin/bash' '. "${0%/*}/../lib/common.sh"' 'case $1 in --synopsis) echo "recprobe  print records"; exit 0 ;; several) cc_several_files ;; esac' \
>   'shift' 'printf "%b\n" "$@"' > "$PLUGIN/libexec/recprobe" && chmod +x "$PLUGIN/libexec/recprobe"
```

```scrut
$ "$PLUGIN/bin/cc-sessions" recprobe one $(seq -f 'L%g\\tabcdefgh' 1 30) --max-chars 50
L1\tabcdefgh (escaped)
L2\tabcdefgh (escaped)
L3\tabcdefgh (escaped)
L4\tabcdefgh (escaped)
```

```scrut {output_stream: stderr}
$ "$PLUGIN/bin/cc-sessions" recprobe one $(seq -f 'L%g\\tabcdefgh' 1 30) --max-chars 50
cc-sessions: output stopped at --max-chars 50 after 4 records; 26 more left out; continue with --since L5
```

`--limit` stops after that many records.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe one $(seq -f 'L%g\\tabcdefgh' 1 30) --limit 3 2>&1
L1\tabcdefgh (escaped)
L2\tabcdefgh (escaped)
L3\tabcdefgh (escaped)
cc-sessions: output stopped at --limit 3 after 3 records; 27 more left out; continue with --since L4
```

The default budget is 20000 characters; records without a handle continue with a larger budget.

```scrut
$ "$PLUGIN/bin/cc-sessions" recprobe one $(seq -f 'record-%g' 1000 2999) 2> notice.txt | wc -l | tr -d ' '; cat notice.txt
1666
cc-sessions: output stopped at --max-chars 20000 after 1666 records; 334 more left out; continue with a larger --max-chars (0 removes the limit)
```

`--max-chars 0` removes the limit.

```scrut
$ cc-sessions jq 'range(2000) | "record-\(. + 1000)"' --max-chars 0 -- -n -r 2> notice.txt | wc -l | tr -d ' '; wc -c < notice.txt | tr -d ' '
2000
0
```

A record that alone is over the budget is not printed; the notice gives the size that fits it.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe one "L7\t$(printf 'x%.0s' $(seq 1 100))" 'L8\tsmall' --max-chars 50 2>&1
cc-sessions: output stopped at --max-chars 50 after 0 records; 2 more left out; the next record is 104 characters; continue with --max-chars 104 --since L7
```

Records whose handles do not run forward continue with a larger budget instead of `--since`.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe one 'L9\ta' 'L2\tb' 'L3\tc' --limit=2 2>&1
L9\ta (escaped)
L2\tb (escaped)
cc-sessions: output stopped at --limit 2 after 2 records; 1 more left out; continue with a larger --limit (0 removes the limit)
```

So do handles that run forward in what was shown but not in what was left out.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe one 'L1\ta' 'L5\tb' 'L3\tc' --limit 1 2>&1
L1\ta (escaped)
cc-sessions: output stopped at --limit 1 after 1 record; 2 more left out; continue with a larger --limit (0 removes the limit)
```

A handle bound is offered only when it moves forward: when the next record carries the first handle shown, `--since`
would print the same page again, so the notice asks for a larger budget and names the handle that keeps the place. A
page that shows no handle at all is in the same case.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe one 'L5\ta' 'L5\tb' 'L5\tc' 'L6\td' --limit 2 2>&1
> "$PLUGIN/bin/cc-sessions" recprobe one 'L5\ta' 'L5\tb' 'L5\tc' 'L6\td' --max-chars 10 2>&1 >/dev/null
> "$PLUGIN/bin/cc-sessions" recprobe one 'dir\tx' 'L2\ta' 'L2\tb' --limit 1 2>&1 >/dev/null
L5\ta (escaped)
L5\tb (escaped)
cc-sessions: output stopped at --limit 2 after 2 records; 2 more left out; continue with a larger --limit (0 removes the limit) and --since L5
cc-sessions: output stopped at --max-chars 10 after 2 records; 2 more left out; continue with a larger --max-chars (0 removes the limit) and --since L5
cc-sessions: output stopped at --limit 1 after 1 record; 2 more left out; continue with a larger --limit (0 removes the limit) and --since L2
```

A page that ends inside records sharing a later handle continues with that handle, which shows them again.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe one 'L4\ta' 'L5\tb' 'L5\tc' 'L6\td' --limit 2 2>&1
L4\ta (escaped)
L5\tb (escaped)
cc-sessions: output stopped at --limit 2 after 2 records; 2 more left out; continue with --since L5
```

`cc-sessions jq` takes no `--since`, so its output, whatever its records hold, continues with a larger budget.

```scrut {output_stream: combined}
$ cc-sessions jq 'range(1; 31) | "L\(.)\tabcdefgh"' --limit 3 -- -n -r 2>&1
> cc-sessions jq '"L7\t" + ("x" * 100), "L8\tsmall"' --max-chars 50 -- -n -r 2>&1
L1\tabcdefgh (escaped)
L2\tabcdefgh (escaped)
L3\tabcdefgh (escaped)
cc-sessions: output stopped at --limit 3 after 3 records; 27 more left out; continue with a larger --limit (0 removes the limit)
cc-sessions: output stopped at --max-chars 50 after 0 records; 2 more left out; the next record is 104 characters; continue with --max-chars 104
```

A command whose records come from several files says so before its first record, with `cc_several_files` from
`lib/common.sh`. A handle bound applies to each file's own lines, so its notices continue with the next record's time
instead, on every page, even one whose records all come from one of the files. `--since` is inclusive, so the notice
says how many records already shown carry that second and will repeat.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe several 'L1\tmain\t2026-10-30T10:00:01Z\ta' 'L1\tagent\t2026-10-30T10:00:02Z\tb' 'L2\tmain\t2026-10-30T10:00:02Z\tc' 'L2\tagent\t2026-10-30T10:00:03Z\td' --limit 2 2>&1
L1\tmain\t2026-10-30T10:00:01Z\ta (escaped)
L1\tagent\t2026-10-30T10:00:02Z\tb (escaped)
cc-sessions: output stopped at --limit 2 after 2 records; 2 more left out; continue with --since 2026-10-30T10:00:02Z, which repeats the 1 record already shown at that second
```

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe several 'L1\tmain\t2026-10-30T10:00:01Z\ta' 'L1\tagent\t2026-10-30T10:00:02Z\tb' 'L2\tmain\t2026-10-30T10:00:03Z\tc' --limit 1 2>&1
L1\tmain\t2026-10-30T10:00:01Z\ta (escaped)
cc-sessions: output stopped at --limit 1 after 1 record; 2 more left out; continue with --since 2026-10-30T10:00:02Z
```

A page whose records, shown and left out, all come from one of the files continues by time too.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe several 'L5\tmain\t2026-10-30T10:00:01Z\ta' 'L6\tmain\t2026-10-30T10:00:02Z\tb' --limit 1 2>&1
L5\tmain\t2026-10-30T10:00:01Z\ta (escaped)
cc-sessions: output stopped at --limit 1 after 1 record; 1 more left out; continue with --since 2026-10-30T10:00:02Z
```

A time bound, like a handle bound, is offered only when it moves forward: when every record shown carries the next
record's second, `--since` would print the same page again, so the notice asks for a larger budget and names the time
that keeps the place.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe several 'L1\tmain\t2026-10-30T10:00:02Z\ta' 'L1\tagent\t2026-10-30T10:00:02Z\tb' 'L2\tmain\t2026-10-30T10:00:02Z\tc' 'L3\tmain\t2026-10-30T10:00:03Z\td' --limit 2 2>&1
> "$PLUGIN/bin/cc-sessions" recprobe several 'L1\tmain\t2026-10-30T10:00:02Z\ta' 'L1\tagent\t2026-10-30T10:00:02Z\tb' 'L2\tmain\t2026-10-30T10:00:02Z\tc' 'L3\tmain\t2026-10-30T10:00:03Z\td' --max-chars 80 2>&1 >/dev/null
L1\tmain\t2026-10-30T10:00:02Z\ta (escaped)
L1\tagent\t2026-10-30T10:00:02Z\tb (escaped)
cc-sessions: output stopped at --limit 2 after 2 records; 2 more left out; continue with a larger --limit (0 removes the limit) and --since 2026-10-30T10:00:02Z
cc-sessions: output stopped at --max-chars 80 after 2 records; 2 more left out; continue with a larger --max-chars (0 removes the limit) and --since 2026-10-30T10:00:02Z
```

A record left out with an earlier time, or with none, would be lost by a time bound: the notice asks for a larger
budget instead.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe several 'L1\tmain\t2026-10-30T10:00:01Z\ta' 'L1\tagent\t2026-10-30T10:00:05Z\tb' 'L2\tmain\t2026-10-30T10:00:03Z\tc' --limit 1 2>&1
> "$PLUGIN/bin/cc-sessions" recprobe several 'L1\tmain\t2026-10-30T10:00:01Z\ta' 'L1\tagent\t2026-10-30T10:00:05Z\tb' 'L5\trun\t-\tc' --limit 1 2>&1 >/dev/null
L1\tmain\t2026-10-30T10:00:01Z\ta (escaped)
cc-sessions: output stopped at --limit 1 after 1 record; 2 more left out; continue with a larger --limit (0 removes the limit)
cc-sessions: output stopped at --limit 1 after 1 record; 2 more left out; continue with a larger --limit (0 removes the limit)
```

A first record over the budget gives the size that fits it and, with several files, its time.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe several "L7\tmain\t2026-10-30T10:00:01Z\t$(printf 'x%.0s' $(seq 1 100))" 'L1\tagent\t2026-10-30T10:00:02Z\tsmall' --max-chars 50 2>&1
cc-sessions: output stopped at --max-chars 50 after 0 records; 2 more left out; the next record is 130 characters; continue with --max-chars 130 --since 2026-10-30T10:00:01Z
```

Output of a command that read one file continues with `--since L<next>`, whatever its records hold.

```scrut {output_stream: combined}
$ "$PLUGIN/bin/cc-sessions" recprobe one 'L1\tmain\t2026-10-30T10:00:01Z\ta' 'L2\tmain\t2026-10-30T10:00:01Z\tb' --limit 1 2>&1
L1\tmain\t2026-10-30T10:00:01Z\ta (escaped)
cc-sessions: output stopped at --limit 1 after 1 record; 1 more left out; continue with --since L2
```

The dispatcher leaves no file of its own behind, even when it is stopped while the command runs on: `slowprobe` says
that its records come from several files a second after it starts, after the dispatcher has gone.

```scrut
$ ls "$TMPDIR" | grep -c '^cc-sessions' || true
> printf '%s\n' '#!/bin/bash' '. "${0%/*}/../lib/common.sh"' 'case $1 in --synopsis) echo "slowprobe  print a record late"; exit 0 ;; esac' \
>   'sleep 1' 'cc_several_files' 'printf "L1\tmain\t-\tx\n"' > "$PLUGIN/libexec/slowprobe" && chmod +x "$PLUGIN/libexec/slowprobe"
> T=$CC_TEST_TMP/stopped && mkdir -p "$T"
> (TMPDIR=$T "$PLUGIN/bin/cc-sessions" slowprobe > /dev/null 2>&1 & pid=$!; sleep 0.3; kill -TERM $pid; wait $pid; sleep 1.5) 2> /dev/null
> ls -A "$T" | wc -l | tr -d ' '
0
0
```

`--max-chars` counts characters, not bytes, whatever the locale (this suite runs under `LC_ALL=C`): a record of 100
two-byte characters takes 101 characters with its newline.

```scrut
$ for n in 101 100; do cc-sessions jq '"é" * 100' --max-chars $n -- -n -r 2> notice.txt | wc -c | tr -d ' '; cut -d ";" -f 1 notice.txt; done
201
0
cc-sessions: output stopped at --max-chars 100 after 0 records
```

Global options are accepted before the command too, and their values are checked.

```scrut {output_stream: combined}
$ cc-sessions --max-chars=12 jq '"L1\tone", "L2\ttwo"' -- -n -r 2>&1
L1\tone (escaped)
cc-sessions: output stopped at --max-chars 12 after 1 record; 1 more left out; continue with a larger --max-chars (0 removes the limit)
```

```scrut {output_stream: stderr}
$ cc-sessions jq '1' --limit x -- -n; cc-sessions jq '1' --max-chars; echo "exit $?" >&2
cc-sessions: --limit needs a whole number of 0 or more, got "x"; pass, for example, --limit 20; see cc-sessions jq --help
cc-sessions: --max-chars needs a value; pass, for example, --max-chars 20; see cc-sessions jq --help
exit 2
```

After `--`, `--max-chars` is not a global option: here jq receives it.

```scrut
$ cc-sessions jq '1' -- -n --max-chars 5 2>&1 >/dev/null | head -n 1
*Unknown option --max-chars (glob)
```

The command's exit status survives the budget filter.

```scrut
$ cc-sessions jq 'error("boom")' b2d4 --limit 1 2>/dev/null; echo "exit $?"
exit 5
```

Commands receive the budget in `CC_SESSIONS_LIMIT` and `CC_SESSIONS_MAX_CHARS`, never as arguments.
`CC_SESSIONS_LIMIT` is empty when no `--limit` was given, so a command can apply a default of its own.

```scrut
$ printf '%s\n' '#!/bin/bash' 'echo "args=$* limit=$CC_SESSIONS_LIMIT max=$CC_SESSIONS_MAX_CHARS command=$CC_SESSIONS_COMMAND"' > "$PLUGIN/libexec/envprobe" && chmod +x "$PLUGIN/libexec/envprobe"
> "$PLUGIN/bin/cc-sessions" envprobe a --limit 7 b && "$PLUGIN/bin/cc-sessions" --max-chars 900 envprobe -- --limit 1
> "$PLUGIN/bin/cc-sessions" envprobe --limit 0
args=a b limit=7 max=20000 command=envprobe
args=-- --limit 1 limit= max=900 command=envprobe
args= limit=0 max=20000 command=envprobe
```

Without `--limit`, the dispatcher cuts nothing by count.

```scrut
$ printf '%s\n' '#!/bin/bash' 'for i in 1 2 3 4 5; do printf "L%s\tx\n" "$i"; done' > "$PLUGIN/libexec/fiveprobe" && chmod +x "$PLUGIN/libexec/fiveprobe"
> "$PLUGIN/bin/cc-sessions" fiveprobe 2>&1 | wc -l | tr -d ' '
5
```

When the reader of stdout goes away early, output ends quietly: no notice and no write error, even when SIGPIPE is ignored.

```scrut
$ (cc-sessions jq 'range(100000)' -- -n | head -n 1) 2>&1; (trap '' PIPE; cc-sessions jq 'range(100000)' -- -n | head -n 1) 2>&1
0
0
```

`PIPES` holds sessions whose answers are far larger than a pipe holds: `0000beef` has 1000 prompts, each with a Bash
call, and one assistant text of 200000 characters at L3001; `0000bee2` has 3000 entry types `schema` does not know;
the sixty `0000c0de` sessions each start with a 2000-character prompt and load the skill `pipe-skill`.

```scrut
$ PIPES=$CC_TEST_TMP/pipes && D=$PIPES/projects/-tmp-pipes && mkdir -p "$D" && pad=$(printf 'p%.0s' $(seq 1 120))
> for i in $(seq 1 1000); do t=$(printf '2026-09-03T%02d:%02d:%02d' $((10 + i * 3 / 3600)) $((i * 3 / 60 % 60)) $((i * 3 % 60)))
>   printf '{"type":"user","message":{"role":"user","content":"pipe prompt %s %s"},"uuid":"0000beef-0000-4000-8000-%012d","timestamp":"%s.000Z","sessionId":"0000beef-0000-4000-8000-000000000000","cwd":"/tmp/pipes"}\n' "$i" "$pad" "$i" "$t"
>   printf '{"type":"assistant","message":{"id":"msg_%s","model":"claude-opus-5-5","role":"assistant","content":[{"type":"tool_use","id":"toolu_%s","name":"Bash","input":{"command":"echo pipe %s %s"}}],"usage":{"input_tokens":1,"output_tokens":1}},"uuid":"0000beef-0000-4000-8001-%012d","timestamp":"%s.100Z"}\n' "$i" "$i" "$i" "$pad" "$i" "$t"
>   printf '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_%s","content":"pipe %s %s"}]},"uuid":"0000beef-0000-4000-8002-%012d","timestamp":"%s.200Z"}\n' "$i" "$i" "$pad" "$i" "$t"
> done > "$D/0000beef-0000-4000-8000-000000000000.jsonl"
> printf '{"type":"assistant","message":{"id":"msg_big","model":"claude-opus-5-5","role":"assistant","content":[{"type":"text","text":"%s"}]},"uuid":"0000beef-0000-4000-8003-000000000001","timestamp":"2026-09-03T11:00:00.000Z"}\n' "$(printf 'x%.0s' $(seq 1 200000))" >> "$D/0000beef-0000-4000-8000-000000000000.jsonl"
> for i in $(seq 1 3000); do printf '{"type":"zz-unknown-%s","uuid":"0000bee2-0000-4000-8000-%012d"}\n' "$i" "$i"; done > "$D/0000bee2-0000-4000-8000-000000000000.jsonl"
> long=$(printf 'w%.0s' $(seq 1 2000))
> for i in $(seq 10 69); do id=0000c0de-0000-4000-8000-0000000000$i; {
>   printf '{"type":"user","message":{"role":"user","content":"pipeword %s"},"uuid":"%s","timestamp":"2026-09-04T10:00:00.000Z","sessionId":"%s","cwd":"/tmp/pipes"}\n' "$long" "$id" "$id"
>   printf '{"type":"assistant","message":{"id":"msg_s%s","model":"claude-opus-5-5","role":"assistant","content":[{"type":"tool_use","id":"toolu_s%s","name":"Skill","input":{"skill":"pipe-skill"}}]},"uuid":"0000c0de-0000-4000-8001-0000000000%s","timestamp":"2026-09-04T10:00:01.000Z"}\n' "$i" "$i" "$i"
>   printf '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_s%s","content":"Launching skill: pipe-skill"}]},"uuid":"0000c0de-0000-4000-8002-0000000000%s","timestamp":"2026-09-04T10:00:02.000Z"}\n' "$i" "$i"
> } > "$D/$id.jsonl"; done
```

Every command, read by a reader that stops after 100 bytes, ends without a word on stderr and exits 0: through
the budget, without it, and with SIGPIPE ignored.

```scrut {timeout: 180s}
$ for ignore in no yes; do for c in 'tools 0000beef' 'conversation 0000beef' 'prompts 0000beef' 'entry 0000beef L3001 --full' \
>   'search pipe 0000beef' 'search pipeword --full --limit 0' 'list --skill pipe-skill --full --limit 0' 'schema 0000bee2' 'jq .rows[] 0000beef'; do
>   for budget in '--max-chars 1000000' '--max-chars 0'; do set -f; set -- $c $budget; set +f
>     ( [ $ignore = yes ] && trap '' PIPE; CLAUDE_CONFIG_DIR=$PIPES cc-sessions "$@" 2> err.txt | head -c 100 > /dev/null; echo "${PIPESTATUS[0]} $(wc -c < err.txt | tr -d ' ')" )
>   done; done; done | sort | uniq -c | sed 's/^ *//'
36 0 0
```

Help is never cut.

```scrut
$ cc-sessions --max-chars 10 --help | wc -l | awk '$1 > 20 { print "whole index" }'
whole index
```

## Dependencies

`nojq` holds every tool in `/usr/bin` and `/bin` except jq; neither has rg.

```scrut
$ NOJQ=$CC_TEST_TMP/nojq && mkdir -p "$NOJQ" && { ln -s /usr/bin/* /bin/* "$NOJQ"/ 2>/dev/null; rm -f "$NOJQ/jq"; }
> OLDJQ=$CC_TEST_TMP/oldjq && mkdir -p "$OLDJQ" && printf '%s\n' '#!/bin/sh' 'echo jq-1.6' > "$OLDJQ/jq" && chmod +x "$OLDJQ/jq"
> JQ17=$CC_TEST_TMP/jq17 && mkdir -p "$JQ17" && ln -s /usr/bin/jq "$JQ17/jq"
> RG=$(command -v rg) && JQ=$(command -v jq)
```

Without jq a command cannot answer: exit 1, with what is missing and how to fix it.

```scrut {output_stream: stderr}
$ PATH="$CC_TEST_ROOT/bin:$NOJQ" cc-sessions jq '.kind' b2d4
cc-sessions: jq is missing (need 1.7 or later); install jq 1.7 or later and put it on PATH; see cc-sessions jq --help
[1]
```

Help and `--version` still work, and the index reports the missing dependencies.

```scrut
$ PATH="$CC_TEST_ROOT/bin:$NOJQ" cc-sessions --help | tail -n 1; PATH="$CC_TEST_ROOT/bin:$NOJQ" cc-sessions jq --help > /dev/null && echo "jq help exit $?"
> PATH="$CC_TEST_ROOT/bin:$NOJQ" cc-sessions --version
deps: jq missing (need 1.7 or later), rg missing
jq help exit 0
cc-sessions *.*.* (sessions plugin) (glob)
```

A jq older than 1.7 is refused the same way.

```scrut
$ PATH="$OLDJQ:$PATH" cc-sessions jq '.kind' b2d4 2>&1; echo "exit $?"; PATH="$OLDJQ:$PATH" cc-sessions --help | tail -n 1
cc-sessions: jq 1.6 is too old (need 1.7 or later); install jq 1.7 or later and put it on PATH; see cc-sessions jq --help
exit 1
deps: jq 1.6 too old (need 1.7 or later), rg * ok (glob)
```

A command that needs rg calls `cc_need rg`; without rg it exits 1.

```scrut
$ printf '%s\n' '#!/bin/bash' '. "${0%/*}/../lib/common.sh"' 'case $1 in --synopsis) echo "rgprobe  needs rg";; esac' 'cc_need rg' 'echo "rg found"' > "$PLUGIN/libexec/rgprobe" && chmod +x "$PLUGIN/libexec/rgprobe"
> mkdir -p "$CC_TEST_TMP/jqonly" && ln -s "$JQ" "$CC_TEST_TMP/jqonly/jq"
> PATH="$CC_TEST_TMP/jqonly:$NOJQ" "$PLUGIN/bin/cc-sessions" rgprobe 2>&1; echo "exit $?"; "$PLUGIN/bin/cc-sessions" rgprobe
cc-sessions: rg (ripgrep) is missing; install ripgrep and put it on PATH; see cc-sessions rgprobe --help
exit 1
rg found
```

With jq 1.7 (`/usr/bin/jq`, 1.7.1-apple) first on PATH the index accepts it and commands work.

```scrut
$ PATH="$JQ17:$PATH" cc-sessions --help | tail -n 1 && PATH="$JQ17:$PATH" cc-sessions jq '[.kind, (.rows | length), .skipped]' b2d4 a9e8 2>/dev/null
deps: jq 1.7.1* ok, rg * ok (glob)
["main",21,[20]]
["workflow-agent",5,[]]
```

```scrut
$ PATH="$JQ17:$PATH" where wf_5d1c9a7e-3b2 && PATH="$JQ17:$PATH" cc-sessions jq 'range(1; 9) | "L\(.)\tx"' --limit 2 -- -n -r
main a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e - -
L1\tx (escaped)
L2\tx (escaped)
```

Under jq 1.7, `--since` and `--until` take ages in every command.

```scrut
$ PATH="$JQ17:$PATH" cc-sessions overview a7c3e9f --until 1s | grep -c '^tokens'; PATH="$JQ17:$PATH" cc-sessions entry a7c3e9f L4 --until 1s | head -n 1 | cut -f 1,2
> PATH="$JQ17:$PATH" cc-sessions list --since 100000d | wc -l | tr -d ' '; PATH="$JQ17:$PATH" cc-sessions prompts a7c3e9f --until 1s | wc -l | tr -d ' '
1
entry\tL4 (escaped)
11
18
```

Run explicitly under `/bin/bash` (3.2 on macOS), the dispatcher and commands behave the same.

```scrut
$ /bin/bash "$CC_TEST_ROOT/bin/cc-sessions" jq '"\(.kind) \(.agent)"' 7c3e9b planner -- -r && /bin/bash "$CC_TEST_ROOT/bin/cc-sessions" --help | head -n 1
subagent a7c3e9b2d4f6a8c01
subagent aplanner-5e1f0a2b3c4d5e6f
cc-sessions: investigate Claude Code session transcripts
```

```scrut {output_stream: stderr}
$ /bin/bash "$CC_TEST_ROOT/bin/cc-sessions" jq '.kind' a7c3 2>&1 >/dev/null | head -n 1 >&2; /bin/bash "$CC_TEST_ROOT/bin/cc-sessions" jq '.kind' a7c3 2>/dev/null; echo "exit $?" >&2
cc-sessions: "a7c3" matches 2 transcripts; pass a longer prefix or one of these paths; see cc-sessions jq --help
exit 2
```

## Lint

shellcheck finds nothing in the dispatcher, the commands, the shared shell code or the test setup.

```scrut
$ cd "$CC_TEST_ROOT" && shellcheck -x -P SCRIPTDIR bin/cc-sessions libexec/* lib/*.sh tests/setup.sh && echo clean
clean
```

Every jq module compiles with jq 1.8 and jq 1.7, imported and as the main program (as commands run them).

```scrut
$ for j in "$JQ" /usr/bin/jq; do for m in "$CC_TEST_ROOT"/lib/*.jq; do n=${m##*/}
>   "$j" -n -L "$CC_TEST_ROOT/lib" "import \"${n%.jq}\" as m; empty" || echo "failed: $j $n"
>   "$j" -n -L "$CC_TEST_ROOT/lib" "$(cat "$m")"$'\n''empty' || echo "failed as main: $j $n"
> done; done; echo checked
checked
```
