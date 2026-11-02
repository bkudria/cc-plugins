---
prepend: [setup.md]
---

# cc-sessions tools

Values come from `fixtures/FACTS.md`.

## Rendering a call (lib/render.jq)

`render` runs one `lib/render.jq` function over each tool call record on stdin and prints it as a field.

```scrut
$ render() { jq -r -L "$CC_TEST_ROOT/lib" "import \"sessions\" as s; import \"render\" as r; $1 | s::field"; }
```

Bash shows the command's first line, how many lines follow, and the background and timeout flags; the background flag
can be stored as the string `"true"`.

```scrut
$ printf '%s\n' '{"name":"Bash","input":{"command":"make test","description":"Run the tests"}}' \
>   '{"name":"Bash","input":{"command":"cd src &&\nmake\nmake install\n","run_in_background":true,"timeout":600000}}' \
>   '{"name":"Bash","input":{"command":"make watch","run_in_background":"true"}}' \
>   '{"name":"Bash","input":{"command":"sleep 90","timeout":90000}}' '{"name":"Bash","input":{"command":"true","timeout":1500}}' | render 'r::input(160)'
make test
cd src && [+2 lines] [bg] [timeout=10m]
make watch [bg]
sleep 90 [timeout=90s]
true [timeout=1500ms]
```

Read, Write, Edit, MultiEdit and NotebookEdit show the path, with the read range or the edit sizes.

```scrut
$ printf '%s\n' '{"name":"Read","input":{"file_path":"/w/a.c"}}' '{"name":"Read","input":{"file_path":"/w/a.c","offset":10,"limit":50}}' \
>   '{"name":"Write","input":{"file_path":"/w/a.c","content":"abc\n"}}' \
>   '{"name":"Edit","input":{"file_path":"/w/a.c","old_string":"MODE_LENIENT","new_string":"MODE_STRICT"}}' \
>   '{"name":"Edit","input":{"file_path":"/w/a.c","old_string":"a","new_string":"bb","replace_all":true}}' \
>   '{"name":"MultiEdit","input":{"file_path":"/w/a.c","edits":[{},{},{}]}}' \
>   '{"name":"NotebookEdit","input":{"notebook_path":"/w/n.ipynb","cell_id":"c3","new_source":"x = 1","edit_mode":"insert"}}' | render 'r::input(160)'
/w/a.c
/w/a.c [offset=10 limit=50]
/w/a.c [4 chars]
/w/a.c [12→11 chars]
/w/a.c [1→2 chars] [all]
/w/a.c [3 edits]
/w/n.ipynb [insert c3] [5 chars]
```

Grep and Glob show the pattern and, when given, the path and the file filter.

```scrut
$ printf '%s\n' '{"name":"Grep","input":{"pattern":"TODO","path":"src","glob":"*.c","-i":true,"output_mode":"content"}}' \
>   '{"name":"Grep","input":{"pattern":"def main","type":"py"}}' '{"name":"Glob","input":{"pattern":"**/beta.h"}}' \
>   '{"name":"Glob","input":{"pattern":"*.md","path":"docs"}}' | render 'r::input(160)'
TODO in src [glob=*.c]
def main [type=py]
**/beta.h
*.md in docs
```

AskUserQuestion shows each question with its option labels.

```scrut
$ printf '%s\n' '{"name":"AskUserQuestion","input":{"questions":[{"question":"Which mode?","options":[{"label":"Strict"},{"label":"Lenient"}]},{"question":"Ship now?","options":[{"label":"Yes"},{"label":"No"}]}]}}' | render 'r::input(160)'
Which mode? [Strict | Lenient] / Ship now? [Yes | No]
```

Agent and Task show the agent type and description, then the name, model, resumed agent and background flag.

```scrut
$ printf '%s\n' '{"name":"Agent","input":{"description":"Survey tokenizer tests","subagent_type":"Explore","prompt":"p","run_in_background":true}}' \
>   '{"name":"Agent","input":{"description":"Plan","name":"planner","subagent_type":"general-purpose","model":"haiku","prompt":"p"}}' \
>   '{"name":"Task","input":{"description":"Locate config loader","subagent_type":"Explore","resume":"5f6a7b8c","prompt":"p"}}' \
>   '{"name":"Agent","input":{"subagent_type":"Explore","prompt":"p"}}' \
>   '{"name":"Agent","input":{"subagent_type":"Explore","prompt":"p","run_in_background":"true"}}' | render 'r::input(160)'
Explore "Survey tokenizer tests" [bg]
general-purpose "Plan" [name=planner] [model=haiku]
Explore "Locate config loader" [resume=5f6a7b8c]
Explore
Explore [bg]
```

Workflow shows the name or the script path, then the arguments as compact JSON, whether stored as an object or a string.

```scrut
$ printf '%s\n' '{"name":"Workflow","input":{"name":"fixture-scan","args":{"target":"src"}}}' \
>   '{"name":"Workflow","input":{"scriptPath":"/w/scan.js","args":"{\"n\": 1}"}}' '{"name":"Workflow","input":{"name":"fixture-scan"}}' | render 'r::input(160)'
fixture-scan {"target":"src"}
/w/scan.js {"n":1}
fixture-scan
```

Skill shows the skill and its arguments; WebFetch the URL; WebSearch and ToolSearch the query.

```scrut
$ printf '%s\n' '{"name":"Skill","input":{"skill":"demo:review","args":"parser changes"}}' '{"name":"Skill","input":{"command":"legacy"}}' \
>   '{"name":"WebFetch","input":{"url":"https://example.invalid/a","prompt":"Summarise"}}' '{"name":"WebSearch","input":{"query":"jq 1.8 changes"}}' \
>   '{"name":"ToolSearch","input":{"query":"select:Read","max_results":5}}' | render 'r::input(160)'
demo:review parser changes
legacy
https://example.invalid/a
jq 1.8 changes
select:Read
```

SendMessage shows the recipient and the summary or the message's first line; TaskStop, KillShell and TaskOutput the target id.

```scrut
$ printf '%s\n' '{"name":"SendMessage","input":{"to":"planner","message":"Start the rollout.\nThen report."}}' \
>   '{"name":"SendMessage","input":{"to":"planner","summary":"Rollout go","message":"long text"}}' \
>   '{"name":"TaskStop","input":{"task_id":"b8r2k6t4q"}}' '{"name":"KillShell","input":{"shell_id":"s1"}}' '{"name":"TaskOutput","input":{"task_id":"t1","block":true}}' | render 'r::input(160)'
planner "Start the rollout."
planner "Rollout go"
b8r2k6t4q
s1
t1
```

MCP tools and every other tool show their input as compact JSON; so does an input a rule cannot use.

```scrut
$ printf '%s\n' '{"name":"mcp__demo__fetch","input":{"url":"https://example.invalid/parser-spec"}}' '{"name":"TodoWrite","input":{"todos":[{"content":"a","status":"pending"}]}}' \
>   '{"name":"Bash","input":{}}' '{"name":"Read","input":"raw"}' | render 'r::input(160)'
{"url":"https://example.invalid/parser-spec"}
{"todos":[{"content":"a","status":"pending"}]}
{}
"raw"
```

A width cuts the variable part and keeps the flags; width 0 keeps it whole.

```scrut
$ printf '%s\n' '{"name":"Bash","input":{"command":"echo xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","run_in_background":true}}' | render 'r::input(30), r::input(0)'
echo xxxxxxxxxxxxxxxxxxx… [bg]
echo xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx [bg]
```

The status adds `persisted` for an ok result saved to a file; the size is characters, or the saved file's bytes with `B` (the stated size when the file is missing).

```scrut
$ printf '%s\n' '{"status":"ok","chars":96}' '{"status":"ok","chars":2277,"persisted":{"bytes":3402,"stated_size":"3.3KB"}}' \
>   '{"status":"ok","chars":2277,"persisted":{"bytes":null,"stated_size":"3.3KB"}}' '{"status":"denied","chars":231}' '{"status":"none","chars":null}' | render '"\(r::status) \(r::size | s::field)"'
ok 96
persisted 3402B
persisted 3.3KB
denied 231
none -
```

The result shows the answers of AskUserQuestion, the agent or run that an Agent, Task or Workflow call started and its
status (`started`, which `tools` computes), the feedback of a denial, the saved path of a persisted output, and otherwise
the text: also for an Agent call that names no agent.

```scrut
$ printf '%s\n' '{"name":"AskUserQuestion","status":"ok","text":"Your questions have been answered","answer":"Which mode? → Strict"}' \
>   '{"name":"Agent","status":"ok","text":"Async agent launched","started":{"id":"a1","status":"killed"}}' \
>   '{"name":"Task","status":"ok","text":"done","started":{"id":"5f6a7b8c","status":"completed"}}' \
>   '{"name":"Workflow","status":"ok","text":"Workflow launched","started":{"id":"wf_1","status":"running"}}' \
>   '{"name":"Agent","status":"error","text":"Agent type '"'"'x'"'"' not found","started":null}' \
>   '{"name":"Edit","status":"denied","text":"The user doesn'"'"'t want to proceed","feedback":"Keep lenient."}' \
>   '{"name":"Edit","status":"denied","text":"The user doesn'"'"'t want to proceed","feedback":null}' \
>   '{"name":"Bash","status":"ok","text":"<persisted-output>…","persisted":{"path":"/r/t.txt","stated_path":"/s/t.txt"}}' \
>   '{"name":"Bash","status":"ok","text":"<persisted-output>…","persisted":{"path":null,"stated_path":"/s/t.txt"}}' \
>   '{"name":"Bash","status":"error","text":"Exit code 1\ncat: missing.txt"}' '{"name":"Bash","status":"none","text":null}' | render 'r::result(160)'
Which mode? → Strict
a1 killed
5f6a7b8c completed
wf_1 running
Agent type 'x' not found
Keep lenient.
The user doesn't want to proceed
/r/t.txt
/s/t.txt
Exit code 1\ncat: missing.txt
-
```

A result text is cut to the width; a saved path never is.

```scrut
$ printf '%s\n' '{"name":"Bash","status":"ok","text":"abcdefghijklmnopqrstuvwxyz"}' '{"name":"Bash","status":"ok","persisted":{"path":"/a/long/path/to/out.txt"}}' | render 'r::result(10)'
abcdefghi…
/a/long/path/to/out.txt
```

A call line, as conversation shows it, is the name, the input, the status and the size, and fits its width.

```scrut
$ printf '%s\n' '{"name":"Bash","input":{"command":"make test"},"status":"ok","chars":2277,"persisted":{"bytes":3402}}' \
>   '{"name":"Bash","input":{"command":"sleep 9"},"status":"none","chars":null}' \
>   '{"name":"Bash","input":{"command":"echo xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"},"status":"ok","chars":96}' | render 'r::call(40)'
Bash make test → persisted 3402B
Bash sleep 9 → none
Bash echo xxxxxxxxxxxxxxxxxxxxx… → ok 96
```

## Help

The index lists tools with its synopsis line.

```scrut
$ cc-sessions --help | grep '^  tools '
  tools <session> [--name RE] [--input RE] [--result RE] [--errors] [--agents]  what tools ran, paired with results
```

Help names every option and each field in order, stays short, and never reads transcripts.

```scrut
$ CLAUDE_CONFIG_DIR=/nonexistent/sessions-fixture cc-sessions tools --help > help.txt; echo "exit $?"
> sed -n '/^Fields/,/^$/p' help.txt | awk '/^  [a-z]/ { print $1 }' | paste -s -d ' ' -
> for o in --name --input --result --errors --agents --since --until --full; do grep -q -e "^  $o" help.txt || echo "missing $o"; done
> [ "$(wc -l < help.txt)" -le 40 ] && echo short
exit 0
handle src time name status size input result
short
```

```scrut
$ cc-sessions tools --help | grep -E -c 'Empty answer|Exit status|160 characters'
3
```

Help says that `--errors` is about the call: an agent killed or failed after its call returned is not an error.

```scrut
$ cc-sessions tools --help | grep -A 1 -e '^  --errors' | grep -c -e 'killed or failed'
1
```

`-h` prints the same help, and the synopsis comes from `--synopsis`.

```scrut
$ cc-sessions tools -h | cmp - help.txt && "$CC_TEST_ROOT/libexec/tools" --synopsis | cut -c1-16
tools <session> 
```

## Records

One record per call in file order: handle, src, time, name, status, size and the rendered input.

```scrut
$ cc-sessions tools a7c3e9f | cut -f1-7
L12\tmain\t2026-10-30T10:00:13Z\tBash\tok\t96\trg -n CONTENT_TERM_ALPHA src (escaped)
L15\tmain\t2026-10-30T10:00:20Z\tBash\tpersisted\t3402B\tmake test (escaped)
L17\tmain\t2026-10-30T10:00:24Z\tmcp__demo__fetch\tok\t49\t{"url":"https://example.invalid/parser-spec"} (escaped)
L26\tmain\t2026-10-30T10:00:48Z\tAskUserQuestion\tok\t153\tWhich parser mode should the review target? [Strict (Recommended) | Lenient] (escaped)
L28\tmain\t2026-10-30T10:00:53Z\tEdit\tdenied\t231\t/tmp/sessions-fixture/alpha/src/parser.c [12→11 chars] (escaped)
L30\tmain\t2026-10-30T10:00:58Z\tBash\terror\t55\tcat missing.txt (escaped)
L32\tmain\t2026-10-30T10:01:03Z\tSkill\terror\t52\tnope (escaped)
L45\tmain\t2026-10-30T10:01:32Z\tSkill\tok\t29\talpha-helper (escaped)
L48\tmain\t2026-10-30T10:01:40Z\tSkill\tok\t29\talpha-helper (escaped)
L51\tmain\t2026-10-30T10:01:48Z\tExitPlanMode\tok\t319\t{"plan":"# Plan\\\\n\\\\n1. Switch the parser to strict mode behind a flag."} (escaped)
L60\tmain\t2026-10-30T10:19:54Z\tAgent\tok\t397\tExplore "Survey tokenizer tests" [bg] (escaped)
L62\tmain\t2026-10-30T10:19:58Z\tAgent\tok\t180\tgeneral-purpose "Plan the strict-mode rollout" [name=planner] (escaped)
L64\tmain\t2026-10-30T10:20:02Z\tWorkflow\tok\t522\tfixture-scan {"target":"src"} (escaped)
```

The last field is the result: answers, the agent and its status as `agents` gives it, the run, the feedback of a denial, the saved file of a persisted output, else the text. The teammate at L62 never sent a notification; its transcript ended with a finished message, so it completed.

```scrut
$ cc-sessions tools a7c3e9f | cut -f1,8 | cc_test_rel
L12\tsrc/parser.c:12:#define CONTENT_TERM_ALPHA 1\\nsrc/libXjq/notes.txt:3:see libXjq for the old rules (escaped)
L15\t<root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e/tool-results/b4k7m2q9x.txt (escaped)
L17\tspec: the parser accepts strict and lenient modes (escaped)
L26\tWhich parser mode should the review target? → Strict (Recommended) (escaped)
L28\tKeep lenient mode until the release. (escaped)
L30\tExit code 1\\ncat: missing.txt: No such file or directory (escaped)
L32\t<tool_use_error>Unknown skill: nope</tool_use_error> (escaped)
L45\tLaunching skill: alpha-helper (escaped)
L48\tLaunching skill: alpha-helper (escaped)
L51?User has approved your plan. * (glob)
L60\ta7c3e9b2d4f6a8c01 completed (escaped)
L62\taplanner-5e1f0a2b3c4d5e6f completed (escaped)
L64\twf_5d1c9a7e-3b2 completed (escaped)
```

The status column is the call's own outcome, and the result names what the call started with the status `agents`
gives it. In DELTA the run's record says the run completed, though the first call's notification said killed (L2); the
teammates' ids are their transcripts' (L6 in process, L8 in a split pane, both finished); the agent of the interrupted
call (L10) is found through its meta file.

```scrut
$ cc-sessions tools d5e7 --name '^(Agent|Workflow)$' | cut -f1,5,8
> cc-sessions agents d5e7 | awk -F '\t' '$1 != "dir" { print $1 "\t" $3 " " $5 }'
L2\tok\twf_8c2e4a6b-1d3 completed (escaped)
L4\tok\ta1e3c5a7b9d1f3e5a completed (escaped)
L6\tok\tareviewer-1a2b3c4d5e6f7a8b completed (escaped)
L8\tok\tf3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f completed (escaped)
L10\terror\ta2b4d6f8a0c2e4a6b killed (escaped)
L15\tok\twf_8c2e4a6b-1d3 completed (escaped)
L2\twf_8c2e4a6b-1d3 completed (escaped)
L2\ta6d8f0b2c4e6a8b0d completed (escaped)
L4\ta1e3c5a7b9d1f3e5a completed (escaped)
L6\tareviewer-1a2b3c4d5e6f7a8b completed (escaped)
L8\tf3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f completed (escaped)
L10\ta2b4d6f8a0c2e4a6b killed (escaped)
-\ta5c7e9a1b3c5d7e9f completed (escaped)
```

FOXTROT: the background flag stored as the string `"true"` still shows `[bg]`; a result's size counts its text only
(an image-only Read result is 0, text plus an image 19); control characters print escaped (CR as `\r`, others as
`\u00XX`); an Agent call whose agent was killed is `ok`, with the kill in its result.

```scrut
$ cc-sessions tools f0d2 | cut -f1,4-8
L10\tExitPlanMode\terror\t106\t{"plan":"# Plan\\\\n\\\\n1. Sort the fixtures by era."}\t<tool_use_error>You are not in plan mode. To enter plan mode, call the EnterPlanMode tool</tool_use_error> (escaped)
L12\tExitPlanMode\tok\t57\t{"plan":"# Plan\\\\n\\\\n1. Sort the fixtures by era."}\tUser has approved exiting plan mode. You can now proceed. (escaped)
L32\tBash\tok\t22\t./progress.sh\tstep 1\\rstep 2\\r\\n\\u0000\\u0007done\\u007f (escaped)
L34\tRead\tok\t0\t/tmp/sessions-fixture/foxtrot/screen.png\t[image] (escaped)
L36\tmcp__demo__click\tok\t19\t{"x":10,"y":20}\tClicked at (10, 20)\\n[image] (escaped)
L38\tWorkflow\terror\t69\tfixture-missing\t<tool_use_error>Workflow "fixture-missing" not found</tool_use_error> (escaped)
L40\tAgent\tok\t264\tExplore "Survey the fixture eras" [bg]\ta0f2c4e6a8b0d2f4a killed (escaped)
```

Each record is one line for any line reader: no raw control character is left in it.

```scrut
$ cc-sessions tools f0d2 --full | LC_ALL=C tr -d '\n' | LC_ALL=C tr -dc '\000-\010\013-\037\177' | wc -c | tr -d ' '
0
```

A persisted output's size is the saved file's bytes, found under the session's `tool-results/` when the stored path is gone; a result that quotes the marker mid-text is not persisted.

```scrut
$ cc-sessions tools e5a7 | cut -f1,5,6,8 | cc_test_rel
L4\tpersisted\t2502B\t<root>/projects/-tmp-sessions-fixture-reloc/e5a7c9b1-3d5f-4b7d-8f9a-0c1e2a3b4c5d/tool-results/c8n2v5x1q.txt (escaped)
L6?ok?154?notes.txt:4:<persisted-output>\nOutput too large (9.0KB). * (glob)
```

A large inline Read result is not persisted; a background Bash call carries `[bg]`.

```scrut
$ cc-sessions tools c7d9 | cut -f1,4-7
L7\tRead\tok\t30000\t/tmp/sessions-fixture/gamma/data/table.txt (escaped)
L10\tBash\tok\t229\tmake index [bg] (escaped)
L20\tBash\tok\t63\tgit diff --stat (escaped)
```

Re-appended duplicates are read once and the corrupt line is skipped with a notice.

```scrut
$ cc-sessions tools b2d4 2>/dev/null | cut -f1,4-8
L5\tBash\tok\t62\tcat build.log\terror: missing header beta.h\\nerror: undefined symbol beta_init (escaped)
L11\tAgent\tok\t134\tExplore "Check header paths"\ta4c6e8f0a2b4c6d8e completed (escaped)
```

```scrut {output_stream: stderr}
$ cc-sessions tools b2d4 > /dev/null 2> err.txt; cc_test_rel < err.txt >&2
cc-sessions: skipped 1 unparseable line in <root>/projects/-tmp-sessions-fixture-beta/b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e.jsonl: L20
```

The flat-era Task call names its agent.

```scrut
$ cc-sessions tools c4e6 | cut -f1,4,7,8
L4\tTask\tExplore "Locate config loader"\t5f6a7b8c completed (escaped)
```

In 2.0.x a background agent's completion is an `<agent-notification>` block keyed by `<agent-id>`; one entry can hold
several (ECHO L10), and some exist only as a `queue-operation` enqueue (L8).

```scrut
$ cc-sessions tools e2c4 --name '^Task$' | cut -f1,8
L2\ta1d2e3f completed (escaped)
L4\ta4b5c6d completed (escaped)
L6\ta7e8f9a completed (escaped)
L11\ta0b1c2d completed (escaped)
L13\ta0b1c2d completed (escaped)
L15\ta3c4d5e killed (escaped)
```

A call is linked to its agent as `agents` links it, also by the agent's delegation prompt alone, as for the
interrupted call at L15, and the result names that agent whatever the call's own status. In `LINK`, `11110001`'s
Agent call at L2 was rejected, yet its agent ran: its meta holds no `toolUseId` and its prompt is the call's. The
call at L4 has no result, and its agent's meta names it.

```scrut
$ LINK=$CC_TEST_TMP/link && LS=$LINK/projects/-tmp-link/11110001-0000-4000-8000-000000000001 && mkdir -p "$LS/subagents"
> e='"sessionId":"11110001-0000-4000-8000-000000000001","cwd":"/tmp/link"'
> printf '%s\n' '{"type":"user","message":{"role":"user","content":"Survey the trees."},"uuid":"11111001-0000-4000-8000-000000000001","timestamp":"2026-09-20T10:00:01.000Z",'"$e"'}' \
>   '{"type":"assistant","message":{"id":"msg_link1","role":"assistant","model":"claude-opus-5-5","content":[{"type":"tool_use","id":"toolu_link1","name":"Agent","input":{"subagent_type":"Explore","description":"Survey the first tree","prompt":"Survey the first tree."}}],"usage":{"input_tokens":1,"output_tokens":1}},"uuid":"11111001-0000-4000-8000-000000000002","timestamp":"2026-09-20T10:00:02.000Z",'"$e"'}' \
>   '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_link1","content":"The user doesn'"'"'t want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.","is_error":true}]},"uuid":"11111001-0000-4000-8000-000000000003","timestamp":"2026-09-20T10:00:30.000Z",'"$e"'}' \
>   '{"type":"assistant","message":{"id":"msg_link2","role":"assistant","model":"claude-opus-5-5","content":[{"type":"tool_use","id":"toolu_link2","name":"Agent","input":{"subagent_type":"Explore","description":"Survey the second tree","prompt":"Survey the second tree."}}],"usage":{"input_tokens":1,"output_tokens":1}},"uuid":"11111001-0000-4000-8000-000000000004","timestamp":"2026-09-20T10:00:31.000Z",'"$e"'}' \
>   > "$LS.jsonl"
> for n in 1 2; do a=a111100000000000$n; printf '%s\n' \
>   '{"type":"user","isSidechain":true,"agentId":"'"$a"'","message":{"role":"user","content":"Survey the '"$([ $n = 1 ] && echo first || echo second)"' tree."},"uuid":"1111a00'"$n"'-0000-4000-8000-000000000001","timestamp":"2026-09-20T10:00:0'"$((n * 2 + 1))"'.000Z",'"$e"'}' \
>   '{"type":"assistant","isSidechain":true,"agentId":"'"$a"'","message":{"id":"msg_link_a'"$n"'","role":"assistant","model":"claude-haiku-5-5","content":[{"type":"text","text":"Tree '"$n"' surveyed."}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":5}},"uuid":"1111a00'"$n"'-0000-4000-8000-000000000002","timestamp":"2026-09-20T10:00:2'"$n"'.000Z",'"$e"'}' \
>   > "$LS/subagents/agent-$a.jsonl"; done
> printf '%s\n' '{"agentType":"Explore","description":"Survey the first tree"}' > "$LS/subagents/agent-a1111000000000001.meta.json"
> printf '%s\n' '{"agentType":"Explore","description":"Survey the second tree","toolUseId":"toolu_link2"}' > "$LS/subagents/agent-a1111000000000002.meta.json"
> CLAUDE_CONFIG_DIR=$LINK cc-sessions tools 11110001 | cut -f1,4,5,8
> CLAUDE_CONFIG_DIR=$LINK cc-sessions agents 11110001 | awk -F '\t' '$1 ~ /^L/ { print $1 "\t" $3 " " $5 }'
L2\tAgent\tdenied\ta1111000000000001 denied (escaped)
L4\tAgent\tnone\ta1111000000000002 completed (escaped)
L2\ta1111000000000001 denied (escaped)
L4\ta1111000000000002 completed (escaped)
```

An agent transcript given as the operand has its id as src.

```scrut
$ cc-sessions tools a4c6e8f0 | cut -f1-4,7,8
L3\ta4c6e8f0a2b4c6d8e\t2026-07-15T09:01:17Z\tGlob\t**/beta.h\tinclude/beta.h (escaped)
```

## Widths

The result is cut at 160 characters unless `--full`.

```scrut
$ cc-sessions tools c7d9 --name Read | cut -f8 | grep -c '…$'
> cc-sessions tools c7d9 --name Read --full --max-chars 0 | cut -f8 | sed 's/\\t/\t/g; s/\\n/\n/g' | wc -c | tr -d ' '
1
30001
```

With `--full`, the GAMMA Read record alone is over the default budget: nothing is printed and the notice says how to continue.

```scrut {output_stream: stderr}
$ cc-sessions tools c7d9 --full > out.txt; echo "stdout $(wc -c < out.txt | tr -d ' ')" >&2
cc-sessions: output stopped at --max-chars 20000 after 0 records; 3 more left out; the next record is * characters; continue with --max-chars * --since L7 (glob)
stdout 0
```

## Filters

`--name` matches the tool name as a regex.

```scrut
$ cc-sessions tools a7c3e9f --name '^Skill$' | cut -f1,4 && cc-sessions tools a7c3e9f --name mcp__ | cut -f1,4
L32\tSkill (escaped)
L45\tSkill (escaped)
L48\tSkill (escaped)
L17\tmcp__demo__fetch (escaped)
```

`--input` matches the rendered input, the input JSON (here its description) and the wire form (here its `cd` prefix).

```scrut
$ for re in 'make test' 'Find the parser symbol' 'alpha && rg' '"target":"src"'; do cc-sessions tools a7c3e9f --input "$re" | cut -f1 | paste -s -d ' ' -; done
L15
L12
L12
L64
```

`--result` matches the result text and the rendered result.

```scrut
$ for re in 'Unknown skill' '^Launching skill' 'aplanner.* completed'; do cc-sessions tools a7c3e9f --result "$re" | cut -f1 | paste -s -d ' ' -; done
L32
L45 L48
L62
```

`--errors` selects failed calls only: a denial is the user's choice, not an error, and an agent killed after its call
returned (FOXTROT L40) is not one either.

```scrut
$ cc-sessions tools a7c3e9f --errors | cut -f1,4,5 && cc-sessions tools a7c3e9f --errors --name Bash | cut -f1
> cc-sessions tools f0d2 --errors | cut -f1,4,5
L30\tBash\terror (escaped)
L32\tSkill\terror (escaped)
L30
L10\tExitPlanMode\terror (escaped)
L38\tWorkflow\terror (escaped)
```

`--since` and `--until` take handles, inclusive.

```scrut
$ cc-sessions tools a7c3e9f --since L26 --until L32 | cut -f1 | paste -s -d ' ' -
L26 L28 L30 L32
```

They take timestamps as printed, so a printed time selects the same record.

```scrut
$ cc-sessions tools a7c3e9f --since 2026-10-30T10:01:32Z --until 2026-10-30T10:01:48Z | cut -f1 | paste -s -d ' ' -
L45 L48 L51
```

They take an age.

```scrut
$ cc-sessions tools a7c3e9f --until 1s | wc -l | tr -d ' '
13
```

A bound that is none of those is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions tools a7c3e9f --since yesterday
cc-sessions: --since takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got "yesterday"; pass one of those forms; see cc-sessions tools --help
[2]
```

## Agents

`--agents` merges the calls of the session's sub-agents and workflow agents in by time, each with its agent id as src.

```scrut
$ cc-sessions tools a7c3e9f --agents | cut -f1-4 | tail -n 4
L64\tmain\t2026-10-30T10:20:02Z\tWorkflow (escaped)
L2\ta7c3e9b2d4f6a8c01\t2026-10-30T10:20:10Z\tBash (escaped)
L2\ta0f1e2d3c4b5a6978\t2026-10-30T10:22:05Z\tBash (escaped)
L3\ta9e8d7c6b5a4f3e21\t2026-10-30T10:23:07Z\tStructuredOutput (escaped)
```

A resumed session's agent that stayed with the original session is found through its call.

```scrut
$ cc-sessions tools b9e1 --agents | cut -f1-4
L3\tmain\t2026-07-15T09:01:07Z\tAgent (escaped)
L3\ta4c6e8f0a2b4c6d8e\t2026-07-15T09:01:17Z\tGlob (escaped)
```

A split-pane teammate's transcript is a session of its own; its src is that session's id.

```scrut
$ cc-sessions tools d5e7 --agents | cut -f1-4 | awk -F '\t' '$2 != "main"'
L2\ta1e3c5a7b9d1f3e5a\t2025-12-06T10:00:11Z\tRead (escaped)
L2\tareviewer-1a2b3c4d5e6f7a8b\t2025-12-06T10:00:31Z\tAgent (escaped)
L3\tf3a5c7e9-1b3d-4f5a-8c7e-9a1b3c5d7e9f\t2025-12-06T10:00:38Z\tEdit (escaped)
L2\ta2b4d6f8a0c2e4a6b\t2025-12-06T10:00:39Z\tGrep (escaped)
```

## Empty answers

A session without tool calls answers with nothing on stdout and a notice naming what was searched.

```scrut
$ cc-sessions tools d1f3 2> err.txt; echo "exit $?"; cc_test_rel < err.txt
exit 0
cc-sessions: no tool calls in <root>/projects/-tmp-sessions-fixture-scuttlerun-project-Xy12/d1f3b5d7-9e0a-4c2e-a4b6-c8d0e2f4a6b8.jsonl
```

The notice names the filters that matched nothing.

```scrut {output_stream: stderr}
$ cc-sessions tools a7c3e9f --name Nothing --since 2030-01-01 2>&1 | cc_test_rel >&2
cc-sessions: no tool calls in <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl with --name "Nothing" --since 2030-01-01
```

With `--agents` the notice says the agents' transcripts were searched too.

```scrut {output_stream: stderr}
$ cc-sessions tools a7c3e9f --agents --name Nothing 2>&1 | cc_test_rel >&2
cc-sessions: no tool calls in <root>/projects/-tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl and its agent transcripts with --name "Nothing"
```

## Usage errors

The session is required, and only one.

```scrut {output_stream: stderr}
$ cc-sessions tools; cc-sessions tools a7c3e9f b2d4; echo "exit $?" >&2
cc-sessions: tools needs a <session>; pass a session id or a prefix of 4 or more characters, a path, wf_<run-id> or current; see cc-sessions tools --help
cc-sessions: tools takes one <session>, got 2; run it once per session; see cc-sessions tools --help
exit 2
```

An unknown option names the valid ones.

```scrut {output_stream: stderr}
$ cc-sessions tools a7c3e9f --frob
cc-sessions: unknown option "--frob" for tools; valid options: --name, --input, --result, --errors, --agents, --since, --until, --full; to pass text that starts with -, put it after --; see cc-sessions tools --help
[2]
```

An option without its value, and a regex jq cannot compile, are usage errors.

```scrut {output_stream: stderr}
$ cc-sessions tools a7c3e9f --name; cc-sessions tools a7c3e9f --input '('; echo "exit $?" >&2
cc-sessions: --name needs a value; pass one after it; see cc-sessions tools --help
cc-sessions: --input "(" is not a valid regular expression; pass a jq (Oniguruma) regex, such as --input '^git '; see cc-sessions tools --help
exit 2
```

An unknown session is a usage error.

```scrut {output_stream: stderr}
$ cc-sessions tools e0a0
cc-sessions: no transcript matches "e0a0"; pass a session or agent id, a prefix of at least 4 characters, or a path; see cc-sessions tools --help
[2]
```

`--` ends options, so an operand may start with `-`.

```scrut
$ (cd "$P" && cc-sessions tools --errors -- -tmp-sessions-fixture-alpha/a7c3e9f1-2b4d-4c6e-8f0a-1b3d5f7a9c2e.jsonl | cut -f1 | paste -s -d ' ' -)
L30 L32
```

## Budget and portability

`--limit` stops after that many calls and says where to continue.

```scrut {output_stream: combined}
$ cc-sessions tools a7c3e9f --limit 2 2>&1 | cut -f1
L12
L15
cc-sessions: output stopped at --limit 2 after 2 records; 11 more left out; continue with --since L17
```

With `--agents` the calls come from several files, so the notice continues with the next call's time.

```scrut
$ cc-sessions tools a7c3e9f --agents --limit 13 2> notice.txt | tail -n 1 | cut -f1-4; cat notice.txt
> cc-sessions tools a7c3e9f --agents --since 2026-10-30T10:20:10Z | cut -f1,2
L64\tmain\t2026-10-30T10:20:02Z\tWorkflow (escaped)
cc-sessions: output stopped at --limit 13 after 13 records; 3 more left out; continue with --since 2026-10-30T10:20:10Z
L2\ta7c3e9b2d4f6a8c01 (escaped)
L2\ta0f1e2d3c4b5a6978 (escaped)
L3\ta9e8d7c6b5a4f3e21 (escaped)
```

Whether the calls come from several files is a property of the command, not of one page: a page whose calls, shown
and left out, all come from the session's own transcript continues by time too.

```scrut {output_stream: combined}
$ cc-sessions tools a7c3e9f --agents --until 2026-10-30T10:01:00Z --limit 2 2>&1 | cut -f1-3
L12\tmain\t2026-10-30T10:00:13Z (escaped)
L15\tmain\t2026-10-30T10:00:20Z (escaped)
cc-sessions: output stopped at --limit 2 after 2 records; 4 more left out; continue with --since 2026-10-30T10:00:24Z
```

With jq 1.7 first on PATH the records are the same.

```scrut
$ JQ17=$CC_TEST_TMP/jq17 && mkdir -p "$JQ17" && ln -sf /usr/bin/jq "$JQ17/jq"
> cc-sessions tools a7c3e9f --agents > new.txt && PATH="$JQ17:$PATH" cc-sessions tools a7c3e9f --agents > old.txt && cmp new.txt old.txt && wc -l < old.txt | tr -d ' '
16
```

shellcheck finds nothing in the command.

```scrut
$ cd "$CC_TEST_ROOT" && shellcheck -x -P SCRIPTDIR libexec/tools && echo clean
clean
```
