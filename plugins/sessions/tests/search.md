---
prepend: [setup.md]
---

# cc-sessions search

Values come from `fixtures/FACTS.md`. `rows` keeps a corpus row's id, hits and kinds; `hits` keeps a per-session record's handle, source and kind.

```scrut
$ rows() { cut -f 1,3,4; }
> hits() { cut -f 1,2,4; }
```

## Help and synopsis

The synopsis is one index line that starts with the command name.

```scrut
$ "$CC_TEST_ROOT/libexec/search" --synopsis | awk '{ print $1, (length($0) <= 120 ? "short" : "long") }'
search short
```

Help names the operands, every option, both field lists in order, the default limit and widths, the notices and the exit codes, and reads no transcripts.

```scrut
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions search --help > help.txt; echo "exit $?"
> for w in '<text>' '<session>' --regex --kind --agents --since --until --cwd --origin --full --limit 'default --limit 20' '160 characters' '100 characters' 'Exit status'; do grep -q -e "$w" help.txt || echo "missing $w"; done
> grep -E '^  Fields:' help.txt; [ "$(wc -l < help.txt)" -le 40 ] && echo short
exit 0
  Fields: id  modified  hits  kinds  mark  cwd  label  snippet
  Fields: handle  src  time  kind  snippet
short
```

The kinds named in help are the library's content kinds, default ones first.

```scrut
$ tr '\n' ' ' < help.txt | tr -s ' ' | sed -E 's/.*Default: ([^;]*);.*/\1/'; echo; cc-sessions jq 's::default_kinds | join(" ")' -- -n -r
> tr '\n' ' ' < help.txt | tr -s ' ' | sed -E 's/.* all adds ([a-z -]*[a-z]) --full.*/\1/'; echo; cc-sessions jq 's::content_kinds[10:] | join(" ")' -- -n -r
prompt assistant tool-input tool-result from-parent agent-result plan file hook recap
prompt assistant tool-input tool-result from-parent agent-result plan file hook recap
thinking injected summary notification peer
thinking injected summary notification peer
```

## Corpus search

Without a session, one record per session: hits in sub-agents, workflow agents and the run journal count toward ALPHA, and `agent` ends the kinds when agents had hits.

```scrut
$ cc-sessions search CONTENT_TERM_ALPHA
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t2026-10-30T11:30:00Z\t8\tprompt,assistant,tool-input,tool-result,from-parent,agent-result,agent\t-\t/tmp/sessions-fixture/alpha\talpha fixture session\tCheck the CONTENT_TERM_ALPHA parser, then please run "make test" now. (escaped)
```

`--kind all` adds the thinking block and the injected skill body.

```scrut
$ cc-sessions search CONTENT_TERM_ALPHA --kind all | rows
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t10\tprompt,assistant,tool-input,tool-result,from-parent,agent-result,thinking,injected,agent (escaped)
```

Text that appears only in harness copies (skill listing, instructions, request blobs, nested memory) is never found.

```scrut
$ out=$(cc-sessions search NOISE_ONLY_TERM 2> err.txt); echo "exit $? stdout ${#out}"; cc_test_rel < err.txt
exit 0 stdout 0
cc-sessions: no session has "NOISE_ONLY_TERM" in the default kinds with --origin cli; 12 sessions searched in <root>/projects
```

A file the user edited is content of kind `file`.

```scrut
$ cc-sessions search GAMMA_FILE_TERM | rows
c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f\t1\tfile (escaped)
```

The background task id is found in the tool result; its notification counts only with `--kind all`, and the queue copy never.

```scrut
$ cc-sessions search b8r2k6t4q | rows; cc-sessions search b8r2k6t4q --kind all | rows
c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f\t1\ttool-result (escaped)
c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f\t2\ttool-result,notification (escaped)
```

A term repeated 699 times in one tool result is one hit.

```scrut
$ cc-sessions search 'state settled' | rows
c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f\t1\ttool-result (escaped)
```

Sessions come newest first; the label and first cwd are the session's.

```scrut
$ cc-sessions search 'the' | cut -f 1,2,6,7
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t2026-10-30T11:30:00Z\t/tmp/sessions-fixture/alpha\talpha fixture session (escaped)
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d\t2026-10-28T12:00:00Z\t/tmp/sessions-fixture/reloc\tShow the release notes (escaped)
f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4\t2026-10-27T12:00:00Z\t/tmp/sessions fixture/under_score\tList the files with spaces in their names. (escaped)
c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f\t2026-10-26T15:00:00Z\t/tmp/sessions-fixture/gamma\tgamma-indexer (escaped)
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\t2026-07-20T12:00:00Z\t/tmp/sessions-fixture/beta\tFind where the header should live. (escaped)
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\t2026-07-15T12:00:00Z\t/tmp/sessions-fixture/beta\tSummarise the beta build failures. (escaped)
c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a\t2026-01-03T12:00:00Z\t/tmp/sessions-fixture/flat\tFlat era config loader search (escaped)
e2c4a6b8-0d2f-4b4d-8e6f-1a3b5c7d9e0f\t2025-12-08T09:06:00Z\t/tmp/sessions-fixture/echo\tExplore the schema code and the state updates in the background. (escaped)
d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13\t2025-12-06T10:06:00Z\t/tmp/sessions-fixture/delta\tRun the audit workflow, then check the log and bring in a reviewer. (escaped)
f3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\t2025-12-06T10:01:02Z\t/tmp/sessions-fixture/delta\t- (escaped)
```

The current session is searched and marked.

```scrut
$ CLAUDE_CODE_SESSION_ID=a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e cc-sessions search CONTENT_TERM_ALPHA | cut -f 1,5
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t* (escaped)
```

Internal agents are left out of corpus search: the transcripts fork and the prompt-suggestion agent.

```scrut
$ cc-sessions search '[cc-sessions:transcripts-fork]' 2>&1 | cc_test_rel; cc-sessions search 'SUGGESTION MODE' 2>&1 | cc_test_rel
cc-sessions: no session has "[cc-sessions:transcripts-fork]" in the default kinds with --origin cli; 12 sessions searched in <root>/projects
cc-sessions: no session has "SUGGESTION MODE" in the default kinds with --origin cli; 12 sessions searched in <root>/projects
```

A flat-layout sub-agent's hits count toward its session; the copies in `progress` entries do not.

```scrut
$ cc-sessions search 'Locate the config loader' | rows
c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a\t2\ttool-input,from-parent,agent (escaped)
```

Across sessions an unparseable line is not reported either: BETA's corrupt L20 holds `warn` and is skipped quietly.

```scrut
$ cc-sessions search warn 2> err.txt | cut -f 1,3,4; wc -l < err.txt | tr -d ' '
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\t3\tprompt,assistant (escaped)
0
```

## Text matching

Text is matched decoded: the quotes are `\"` on disk.

```scrut
$ cc-sessions search 'please run "make test" now' | rows; cc-sessions search 'make test' | rows
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t1\tprompt (escaped)
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t2\tprompt,tool-input (escaped)
```

Text that starts with `-` goes after `--`.

```scrut
$ cc-sessions search -- --force-push-now | rows
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t1\tassistant (escaped)
```

```scrut {output_stream: stderr}
$ cc-sessions search --force-push-now
cc-sessions: unknown option "--force-push-now" for search; valid options: --regex, --kind, --agents, --since, --until, --cwd, --origin, --full; to pass text that starts with -, put it after --; see cc-sessions search --help
[2]
```

Text is literal: `.` matches only a dot. With `--regex` it is a jq (Oniguruma) regex.

```scrut
$ cc-sessions search lib.jq a7c3e9f | hits; echo; cc-sessions search --regex lib.jq a7c3e9f | hits; echo; cc-sessions search libXjq a7c3e9f | hits
L14\tmain\tassistant (escaped)

L13\tmain\ttool-result (escaped)
L14\tmain\tassistant (escaped)

L13\tmain\ttool-result (escaped)
```

A regex with alternatives and anchors matches decoded text.

```scrut
$ cc-sessions search --regex '^(Thanks|Done)' a7c3e9f | hits
L80\tmain\tprompt (escaped)
L81\tmain\tassistant (escaped)
```

An invalid regex is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions search --regex 'lib(' a7c3e9f
cc-sessions: --regex "lib(" is not a valid regex; fix it, or drop --regex to search for the text as written; see cc-sessions search --help
[2]
```

Smart case: all-lowercase text matches any case; text with a capital letter matches exactly.

```scrut
$ cc-sessions search content_term_alpha | rows; cc-sessions search Content_Term_Alpha 2>/dev/null | rows; echo done
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e\t8\tprompt,assistant,tool-input,tool-result,from-parent,agent-result,agent (escaped)
done
```

With `--regex` too, and a regex's backslash escapes (`\d`, `\S`) are not capital letters.

```scrut
$ cc-sessions search --regex 'content_term_\S+ is defined' a7c3e9f | hits; cc-sessions search --regex 'Content_term_\S+ is defined' a7c3e9f 2>/dev/null | hits; echo done
L14\tmain\tassistant (escaped)
done
```

## Kinds

`--kind` takes a comma-separated list; each kind finds only its own records.

```scrut
$ cc-sessions search CONTENT_TERM_ALPHA a7c3e9f --kind thinking,injected | hits; cc-sessions search parser a7c3e9f --kind plan,recap | hits
> cc-sessions search MODE_LENIENT a7c3e9f --kind file | hits
L10\tmain\tthinking (escaped)
L47\tmain\tinjected (escaped)
L42\tmain\tplan (escaped)
L76\tmain\trecap (escaped)
L41\tmain\tfile (escaped)
```

`hook` content is the hook's output.

```scrut
$ cc-sessions search 'fixture hook ready' a7c3e9f | hits
L3\tmain\thook (escaped)
```

An unknown kind is a usage error that lists the kinds.

```scrut {output_stream: stderr}
$ cc-sessions search x --kind prompt,bogus
cc-sessions: --kind "bogus" is not a content kind; pass all or a comma-separated list of: prompt, assistant, tool-input, tool-result, from-parent, agent-result, plan, file, hook, recap, thinking, injected, summary, notification, peer; see cc-sessions search --help
[2]
```

## Within sessions

With a session, one record per hit in file order: handle, source, time, kind and a snippet.

```scrut
$ cc-sessions search CONTENT_TERM_ALPHA a7c3e9f
L4\tmain\t2026-10-30T10:00:04Z\tprompt\tCheck the CONTENT_TERM_ALPHA parser, then please run "make test" now. (escaped)
L12\tmain\t2026-10-30T10:00:13Z\ttool-input\trg -n CONTENT_TERM_ALPHA src Find the parser symbol cd /tmp/sessions-fixture/alpha && rg -n CONTENT_TERM_ALPHA src (escaped)
L13\tmain\t2026-10-30T10:00:16Z\ttool-result\tsrc/parser.c:12:#define CONTENT_TERM_ALPHA 1 src/libXjq/notes.txt:3:see libXjq for the old rules (escaped)
L14\tmain\t2026-10-30T10:00:18Z\tassistant\tCONTENT_TERM_ALPHA is defined in src/parser.c. The rules live in lib.jq; running the tests next. (escaped)
```

`--agents` adds the session's sub-agents, workflow agents and run journal, each named in `src`; internal agents stay out.
The records of several files are merged by time, each file keeping its own order; a run journal has no timestamps, so
its records come last.

```scrut
$ cc-sessions search CONTENT_TERM_ALPHA a7c3e9f --agents | hits
L4\tmain\tprompt (escaped)
L12\tmain\ttool-input (escaped)
L13\tmain\ttool-result (escaped)
L14\tmain\tassistant (escaped)
L1\ta0f1e2d3c4b5a6978\tfrom-parent (escaped)
L3\ta9e8d7c6b5a4f3e21\ttool-input (escaped)
L4\ta9e8d7c6b5a4f3e21\tagent-result (escaped)
L5\twf_5d1c9a7e-3b2\tagent-result (escaped)
```

```scrut
$ cc-sessions search CONTENT_TERM_ALPHA a7c3e9f --agents --kind all | wc -l | tr -d ' '; cc-sessions search 'One session loaded' a7c3e9f --agents 2>&1 | cc_test_rel
10
cc-sessions: no hits for "One session loaded" in the default kinds of 7 transcripts (session a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e)
```

A split-pane teammate's transcript is a session of its own; with `--agents` its hits join under that session's id.

```scrut
$ cc-sessions search 'timeout to 30s' d5e7 --agents | hits; cc-sessions search 'timeout to 30s' d5e7 2>&1 | cc_test_rel
L5\tf3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\tassistant (escaped)
cc-sessions: no hits for "timeout to 30s" in the default kinds of 1 transcript (session d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13)
```

The notice names the bounds that left nothing.

```scrut {output_stream: stderr}
$ cc-sessions search CONTENT_TERM_ALPHA a7c3e9f --since L80 --until L83
cc-sessions: no hits for "CONTENT_TERM_ALPHA" in the default kinds of 1 transcript (session a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e) with --since L80 --until L83
```

An internal agent named as the session is searched.

```scrut
$ cc-sessions search '[cc-sessions:transcripts-fork]' a3d1e5f7 | hits; cc-sessions search 'SUGGESTION MODE' aprompt_suggestion-8d2e4b | hits
L1\ta3d1e5f7a9b0c2d4e\tfrom-parent (escaped)
L1\taprompt_suggestion-8d2e4b\tfrom-parent (escaped)
```

Re-appended duplicates are found once: BETA L18 and L19 copy L6 and L7.

```scrut
$ cc-sessions search 'undefined symbol' b2d4 2>/dev/null | hits; cc-sessions search 'undefined symbol' 2>/dev/null | rows
L6\tmain\ttool-result (escaped)
L7\tmain\tassistant (escaped)
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\t2\tassistant,tool-result (escaped)
```

The corrupt line is skipped with a notice; the queued prompt that exists only as a queue entry is found.

```scrut
$ cc-sessions search warn b2d4 2> err.txt | hits; cc_test_rel < err.txt
L8\tmain\tprompt (escaped)
L21\tmain\tprompt (escaped)
L22\tmain\tassistant (escaped)
cc-sessions: skipped 1 unparseable line in <root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e.jsonl: L20
```

`--since` and `--until` bound records by time even where timestamps run backwards (L7 is earlier than L6), or by handle.

```scrut
$ cc-sessions search symbol b2d4 --until 2026-07-15T09:00:03Z 2>/dev/null | hits; cc-sessions search symbol b2d4 --since 2026-07-15T09:00:05Z 2>/dev/null | hits
> cc-sessions search symbol b2d4 --since L7 2>/dev/null | hits
L7\tmain\tassistant (escaped)
L6\tmain\ttool-result (escaped)
L7\tmain\tassistant (escaped)
```

A flat-layout session's agents are its flat sub-agents; the Warmup agent is internal.

```scrut
$ cc-sessions search 'config loader' c4e6 --agents | hits
L2\tmain\tprompt (escaped)
L4\tmain\ttool-input (escaped)
L1\t5f6a7b8c\tfrom-parent (escaped)
L8\tmain\tassistant (escaped)
```

The resumed copy is its own session: it holds a copy of BETA's Agent call, but BETA's sub-agent counts only for BETA.

```scrut
$ cc-sessions search 'include path' | rows; cc-sessions search 'missing beta.h header' | rows
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\t2\tprompt,assistant (escaped)
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\t1\ttool-input (escaped)
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\t2\ttool-input,from-parent,agent (escaped)
```

A resumed copy's agents include those its calls name in another session's directory: RESUMED's Explore agent is stored
under BETA.

```scrut
$ cc-sessions search 'include/beta.h' b9e1 --agents | hits
L4\ta4c6e8f0a2b4c6d8e\ttool-result (escaped)
L5\ta4c6e8f0a2b4c6d8e\tassistant (escaped)
L4\tmain\ttool-result (escaped)
L5\tmain\tassistant (escaped)
L7\tmain\tassistant (escaped)
```

With several sessions, `src` names each session's own transcript by its id, and their records are merged by time.
RESUMED's L1 and L3 copy BETA's L9 and L11, timestamps included.

```scrut
$ cc-sessions search 'header should live' b2d4 b9e1 | hits
L9\tb2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\tprompt (escaped)
L1\tb9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\tprompt (escaped)
L11\tb2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\ttool-input (escaped)
L3\tb9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\ttool-input (escaped)
```

When the hits shown and left out come from several files, the notice continues with the next hit's time, so
following it loses nothing.

```scrut
$ cc-sessions search lexer a7c3e9f --agents --limit 2 2> notice.txt | hits; cat notice.txt
> cc-sessions search lexer a7c3e9f --agents --since 2026-10-30T10:25:12Z | hits
L3\ta0f1e2d3c4b5a6978\ttool-result (escaped)
L69\tmain\tprompt (escaped)
cc-sessions: output stopped at --limit 2 after 2 records; 3 more left out; continue with --since 2026-10-30T10:25:12Z
L70\tmain\tassistant (escaped)
L71\tmain\tprompt (escaped)
L2\tadoes-the-lexer-0a1b2c3d4e5f6a7b\tfrom-parent (escaped)
```

An unknown session is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions search x e0a0
cc-sessions: no transcript matches "e0a0"; pass a session or agent id, a prefix of at least 4 characters, or a path; see cc-sessions search --help
[2]
```

## Snippets and widths

A snippet is cut to 160 characters around the first match, whitespace runs shown as one space.

```scrut
$ cc-sessions search 'cell 0350' c7d9 | cut -f 5
…ed 349 cell 0349 | weight 913 | state settled 350 cell 0350 | weight 950 | state settled 351 cell 0351 | weight 987 | state settled 352 cell 0352 | weight 024…
```

`--full` prints the whole text; here a record longer than the default output budget, which then says how to fit it.

```scrut {output_stream: stderr}
$ cc-sessions search 'cell 0350' c7d9 --full > /dev/null
cc-sessions: output stopped at --max-chars 20000 after 0 records; 1 more left out; the next record is * characters; continue with --max-chars * --since L8 (glob)
```

```scrut
$ cc-sessions search 'cell 0350' c7d9 --full --max-chars 0 | cut -f 5 | awk '{ print (length($0) > 30000 ? "whole" : "cut") }'
whole
```

Corpus labels are cut to 100 characters.

```scrut
$ GEN=$CC_TEST_TMP/gen && mkdir -p "$GEN/projects/-tmp-gen"
> for i in $(seq 10 61); do
>   id=00000000-0000-4000-8000-0000000000$i text="Generated prompt $i"
>   [ "$i" = 61 ] && text="Generated prompt $i, the long one:\\nline two$(printf ' word%.0s' $(seq 1 20))"
>   printf '{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/tmp/gen","sessionId":"%s","version":"2.1.316","type":"user","message":{"role":"user","content":"%s"},"uuid":"%s","timestamp":"2026-09-01T12:00:00.000Z","entrypoint":"cli"}\n' "$id" "$text" "$id" > "$GEN/projects/-tmp-gen/$id.jsonl"
>   touch -t "$(printf '2026090112%02d.00' $((i - 10)))" "$GEN/projects/-tmp-gen/$id.jsonl"
> done
> CLAUDE_CONFIG_DIR=$GEN cc-sessions search 'long one' | cut -f 7
Generated prompt 61, the long one: line two word word word word word word word word word word word…
```

## Limit and continuation

The default limit is 20 sessions; the notice says that older sessions were not all examined and how to continue:
`--until` the modified time of the next session, which the page never shares.

```scrut
$ CLAUDE_CONFIG_DIR=$GEN cc-sessions search generated 2> notice.txt | wc -l | tr -d ' '; cat notice.txt
20
cc-sessions: output stopped at --limit 20 after 20 sessions; older sessions were not all examined; continue with --until 2026-09-01T12:31:00Z
```

Past the newest sessions, a rare text is found through one pass that lists the files holding it, and a common one by reading on.

```scrut
$ CLAUDE_CONFIG_DIR=$GEN cc-sessions search 'prompt 10' | cut -f 1,3; CLAUDE_CONFIG_DIR=$GEN cc-sessions search generated --limit 30 2> notice.txt | wc -l | tr -d ' '; cat notice.txt
00000000-0000-4000-8000-000000000010\t1 (escaped)
30
cc-sessions: output stopped at --limit 30 after 30 sessions; older sessions were not all examined; continue with --until 2026-09-01T12:21:00Z
```

Only the first 100 matching lines of a file are read in corpus search, and `hits` then ends with `+`; within a session every hit counts.

```scrut
$ MANY=$CC_TEST_TMP/many && mkdir -p "$MANY/projects/-tmp-many"
> for i in $(seq 1 150); do printf '{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/tmp/many","sessionId":"0000aaaa-0000-4000-8000-000000000001","version":"2.1.316","type":"user","message":{"role":"user","content":"repeat line %s"},"uuid":"0000aaaa-0000-4000-8000-%012d","timestamp":"2026-09-02T12:00:00.000Z","entrypoint":"cli"}\n' "$i" "$i"; done > "$MANY/projects/-tmp-many/0000aaaa-0000-4000-8000-000000000001.jsonl"
> CLAUDE_CONFIG_DIR=$MANY cc-sessions search repeat | cut -f 3; CLAUDE_CONFIG_DIR=$MANY cc-sessions search repeat 0000aaaa --max-chars 0 | wc -l | tr -d ' '
100+
150
```

`--limit` sets it; following the notice continues with the next session.

```scrut
$ cc-sessions search the --limit 2 2> notice.txt | cut -f 1; cat notice.txt; cc-sessions search the --until 2026-10-27T12:00:00Z --limit 2 2>/dev/null | cut -f 1
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d
cc-sessions: output stopped at --limit 2 after 2 sessions; older sessions were not all examined; continue with --until 2026-10-27T12:00:00Z
f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4
c7d9e1f3-5a6b-4c8d-9e0f-1a2b3c4d5e6f
```

`--max-chars` stops at the last whole row too.

```scrut
$ cc-sessions search the --max-chars 430 2> notice.txt | cut -f 1; cat notice.txt
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d
cc-sessions: output stopped at --max-chars 430 after 2 sessions; older sessions were not all examined; continue with --until 2026-10-27T12:00:00Z
```

`TIE` holds six sessions: `0000aa01` and `0000aa02` modified at 12:05, `0000bb01` to `0000bb03` at 12:04, and
`0000cc01` at 12:03. A page never splits the sessions that share one modified second, and holds them all when they
alone fill it.

```scrut
$ TIE=$CC_TEST_TMP/tie && mkdir -p "$TIE/projects/-tmp-tie"
> for s in aa01:05 aa02:05 bb01:04 bb02:04 bb03:04 cc01:03; do id=0000${s%:*}-0000-4000-8000-000000000000
>   printf '{"type":"user","message":{"role":"user","content":"tied session %s"},"uuid":"%s","timestamp":"2026-09-05T12:00:00.000Z","sessionId":"%s","cwd":"/tmp/tie"}\n' "${s%:*}" "$id" "$id" > "$TIE/projects/-tmp-tie/$id.jsonl"
>   touch -t "2026090512${s#*:}.00" "$TIE/projects/-tmp-tie/$id.jsonl"; done
> CLAUDE_CONFIG_DIR=$TIE cc-sessions search tied --limit 3 2> notice.txt | cut -f 1; cat notice.txt
> CLAUDE_CONFIG_DIR=$TIE cc-sessions search tied --until 2026-09-05T12:04:00Z --limit 2 2> notice.txt | cut -f 1; cat notice.txt
0000aa01-0000-4000-8000-000000000000
0000aa02-0000-4000-8000-000000000000
cc-sessions: output stopped at --limit 3 after 2 sessions; older sessions were not all examined; continue with --until 2026-09-05T12:04:00Z
0000bb01-0000-4000-8000-000000000000
0000bb02-0000-4000-8000-000000000000
0000bb03-0000-4000-8000-000000000000
cc-sessions: output stopped at --limit 2 after 3 sessions, which share one modified time; older sessions were not all examined; continue with --until 2026-09-05T12:03:00Z
```

`--max-chars` counts characters, whatever the locale: a row of 80 two-byte characters fits a budget of its length in
characters.

```scrut
$ U=$CC_TEST_TMP/utf && mkdir -p "$U/projects/-tmp-utf" && id=0000ee01-0000-4000-8000-000000000000
> printf '{"type":"user","message":{"role":"user","content":"%s"},"uuid":"%s","timestamp":"2026-09-06T10:00:00.000Z","sessionId":"%s","cwd":"/tmp/utf"}\n' "$(printf 'é%.0s' $(seq 1 80))" "$id" "$id" > "$U/projects/-tmp-utf/$id.jsonl"
> n=$(CLAUDE_CONFIG_DIR=$U cc-sessions search éé --max-chars 0 | LC_ALL=en_US.UTF-8 wc -m | tr -d ' ')
> CLAUDE_CONFIG_DIR=$U cc-sessions search éé --max-chars "$n" 2>/dev/null | wc -l | tr -d ' '; CLAUDE_CONFIG_DIR=$U cc-sessions search éé --max-chars "$((n - 1))" 2>&1 | cut -d ';' -f 1
1
cc-sessions: output stopped at --max-chars * after 0 sessions (glob)
```

## Corpus filters

`--since` and `--until` select sessions by modified time; a handle needs a session.

```scrut
$ cc-sessions search the --since 2026-10-27 | cut -f 1; cc-sessions search the --until 2026-07-20 | cut -f 1
a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e
e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d
f6b8d0e2-4a6c-4e8a-b0c2-d4e6f8a0b2c4
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e
c4e6a8b0-2d4f-4a6c-9e8a-0b2c4d6e8f1a
e2c4a6b8-0d2f-4b4d-8e6f-1a3b5c7d9e0f
d5e7f9a1-3b5c-4d7e-9f1a-2b4c6d8e0f13
f3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f
```

An age counts back from now, for sessions and for records.

```scrut
$ cc-sessions search the --since 100000d | wc -l | tr -d ' '; cc-sessions search symbol b2d4 --until 100000d 2>/dev/null | wc -l | tr -d ' '
10
0
```

```scrut {output_stream: stderr}
$ cc-sessions search the --since L5
cc-sessions: --since L5 is a handle, which only per-session records have; pass a timestamp (2026-10-30T10:00:04Z, 2026-10-30) or an age (7d) to compare modified times, or name a <session>; see cc-sessions search --help
[2]
```

`--origin` admits SDK sessions; `--cwd` keeps sessions with a cwd at or under the path.

```scrut
$ cc-sessions search report-builder 2>/dev/null | rows; cc-sessions search report-builder --origin sdk | rows; cc-sessions search header --cwd /tmp/sessions-fixture/beta | rows
d1f3b5d7-9e0a-4c2e-a4b6-c8d0e2f4a6b8\t2\tprompt,assistant (escaped)
b9e1c3a5-7d2f-4e6a-8b0c-1d3e5f7a9b2c\t5\tprompt,assistant,tool-input,tool-result (escaped)
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\t9\tprompt,assistant,tool-input,tool-result,from-parent,agent (escaped)
```

`--cwd` and `--origin` choose sessions, so with a session they are usage errors.

```scrut {output_stream: stderr}
$ cc-sessions search x a7c3e9f --origin all
cc-sessions: --origin filters the sessions searched without a <session>; drop it, or drop the <session>; see cc-sessions search --help
[2]
```

## Usage errors

No text is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions search
cc-sessions: search needs <text>; pass the text to find, as in cc-sessions search 'parser' or cc-sessions search -- --flag; see cc-sessions search --help
[2]
```

```scrut {output_stream: stderr}
$ cc-sessions search ''
cc-sessions: the <text> is empty; pass the text to find; see cc-sessions search --help
[2]
```

A missing data root means the command could not answer.

```scrut {output_stream: stderr}
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions search x
cc-sessions: no transcripts directory at /nonexistent/sessions-fixture/projects; set CLAUDE_CONFIG_DIR to the directory that holds projects/; see cc-sessions search --help
[1]
```

## Compatibility

Results are the same with jq 1.7 first on PATH and under `/bin/bash`.

```scrut
$ JQ17=$CC_TEST_TMP/jq17search && mkdir -p "$JQ17" && ln -s /usr/bin/jq "$JQ17/jq"
> cc-sessions search CONTENT_TERM_ALPHA a7c3e9f --agents --kind all > modern.txt && cc-sessions search the >> modern.txt
> PATH="$JQ17:$PATH" cc-sessions search CONTENT_TERM_ALPHA a7c3e9f --agents --kind all > old.txt && PATH="$JQ17:$PATH" cc-sessions search the >> old.txt
> cmp modern.txt old.txt && echo same-jq
> /bin/bash "$CC_TEST_ROOT/bin/cc-sessions" search 'undefined symbol' 2>/dev/null | rows
same-jq
b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e\t2\tassistant,tool-result (escaped)
```
