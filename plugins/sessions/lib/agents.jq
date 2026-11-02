import "sessions" as s;

def _dirname: split("/") | .[:-1] | join("/");

# Only paths under the session directory are relative: it may not exist, and a path through it would
# then name nothing.
def _relpath($base): if startswith($base + "/") then .[($base | length) + 1:] else . end;

def _first_status: map(select(. != null)) | first // "unknown";

def _as_text: if . == null or type == "string" then . else tojson end;

def _subject:
  s::memo
  | {file, kind, session_dir, lines, calls: [s::agent_calls], workflows: [s::workflow_calls], forks: [s::fork_launches]};

def _agent($calls; $journals):
  s::memo
  | . as $t
  | (if .run then first($journals[.run].entries[]? | select(.agent_id == $t.agent)) // null else null end) as $j
  | {file, kind, run, meta,
     id: (.agent // (if .kind == "main" then .session else null end)),
     internal: s::is_internal,
     agent_kind: s::agent_kind,
     call: s::started_by($calls),
     journal: $j,
     label: (s::agent_label($j.label) | if . then .text else null end),
     models: (s::models | if length > 0 then join(",") else null end),
     output: (s::totals | .output),
     final_output: ([s::messages | select(.synthetic | not)] | last | .usage.output? // null),
     result: (s::agent_result | if . then .text else null end),
     end: s::end_status,
     partial: s::partial_output_versions,
     ts: (first(s::entries[] | .t | strings) // null)};

def _collect:
  reduce s::transcripts as $t (null;
    if . == null then {subject: ($t | _subject), journals: {}, records: {}, agents: []}
    elif $t.kind == "journal" then .journals[$t.run] = {file: $t.file, entries: [$t | s::journal]}
    elif $t.kind == "file" then
      ($t | s::document) as $doc
      | if ($doc | type) == "object" then
          .records[$doc.runId // ($t.file | split("/") | last | rtrimstr(".json"))] = {file: $t.file, doc: $doc}
        else . end
    else .subject.calls as $calls | .journals as $j | .agents += [$t | _agent($calls; $j)]
    end);

# A teammate's <name>@<team> names no file, so a search of the data root for one would find nothing.
def _needs:
  . as $c
  | [ ($c.subject.calls[] | select(.agent_id != null and (.agent_id | contains("@") | not)) | . as $call
        | select(all($c.agents[]; .id != $call.agent_id and .call != $call.id)) | "agent\t\(.agent_id)"),
      ($c.subject.forks[] | .agent_id as $id | select(all($c.agents[]; .id != $id)) | "agent\t\($id)"),
      ($c.subject.workflows[] | .run_id | strings | . as $run
        | select($c.journals[$run] == null and $c.records[$run] == null and all($c.agents[]; .run != $run)) | "run\t\($run)") ]
  | unique;

def _kind($call):
  if .agent_kind == "internal" then "internal"
  elif ($call.status? // "") == "teammate_spawned" then "teammate"
  else .agent_kind // "agent" end;

# Groups in order of first appearance: [{key, items}].
def _groups(f):
  reduce .[] as $x ({order: [], by: {}};
    ($x | f) as $k
    | if .by[$k] then .by[$k] += [$x] else .order += [$k] | .by[$k] = [$x] end)
  | .by as $by | [.order[] | {key: ., items: $by[.]}];

def _agent_row($a; $at):
  $at + {file: $a.file, kind: ($a // {} | _kind(null)), id: $a.id, type: $a.meta.agentType?, status: ([$a.end] | _first_status),
         model: $a.models, output: $a.output, label: $a.label, result: $a.result, partial: $a.partial};

# A call reports the usage of the agent's final message only, and the transcript can hold a lower count
# for that message: the larger one counts.
def _output($a; $call):
  if $a.output == null or $call.reported_output == null then $a.output
  else $a.output - ($a.final_output // 0) + ([$a.final_output // 0, $call.reported_output] | max) end;

# Calls that resume an agent add no row: the row stands at the first call and shows the last one's outcome.
def _call_row($calls; $a):
  $calls[0] as $first | $calls[-1] as $last
  | {linked: true, l: $first.l, ts: $first.ts, file: $a.file, kind: ($a // {} | _kind($first)), id: ($a.id // $first.agent_id),
     type: ($a.meta.agentType? // $first.subagent_type), status: ($last | s::lifecycle_status(null; $a.end)),
     model: $a.models, output: _output($a; $last), label: ($a.label // $first.description // $first.name // $first.prompt),
     result: ($last.notification.result // $a.result), partial: $a.partial};

def _run_rows($c; $run; $calls; $at):
  $c.records[$run] as $rec
  | $c.journals[$run] as $jr
  | ($calls[0] // null) as $first
  | ($calls[-1] // null) as $last
  | [$c.agents[] | select(.kind == "workflow-agent" and .run == $run)] as $files
  | ([$jr.entries[]? | . as $je | {journal: $je, agent: (first($files[] | select(.id == $je.agent_id)) // null)}]
     + [$files[] | . as $a | select(all($jr.entries[]?; .agent_id != $a.id)) | {journal: null, agent: .}]) as $items
  | ($rec.doc.status | s::lifecycle_word) as $run_status
  | ($jr.file // first($files[].file) // null | if . then _dirname else null end) as $run_dir
  | ($at + {kind: "workflow", id: $run, type: ($first.name // $rec.doc.workflowName), run_dir: $run_dir,
            status: ($last | s::lifecycle_status($rec.doc.status; null)),
            model: ($rec.doc.defaultModel // ([$files[].models | strings] | unique | join(",") | if . == "" then null else . end)),
            output: ([$files[].output | numbers] | if length > 0 then add else null end),
            label: $rec.doc.summary, file: ($run_dir // $rec.file),
            result: ($last.notification.result // ($rec.doc.result | _as_text) // $rec.doc.error),
            partial: [$files[].partial[]]}),
    ($items[] | .journal as $je | .agent as $a
      | $at + {file: $a.file, kind: (if $a.internal then "internal" else "workflow-agent" end), id: ($je.agent_id // $a.id),
               type: $a.meta.agentType?,
               status: ([(if $je.result_l != null then "completed" else null end),
                         (if $run_status == "completed" then null else $run_status end), $a.end] | _first_status),
               model: $a.models, output: $a.output, label: ($a.label // $je.label),
               result: (($je.result | _as_text) // $a.result), partial: $a.partial});

# Rows follow their call's line, each run's agents right after it, so that output cut short continues
# with --since L<next>; agents and runs that no call links come last.
def _rows:
  . as $c
  | ($c.subject.lines + 1) as $after
  | ([$c.subject.calls[] | . as $call
      | {call: $call, agent: ($call | s::started_agent($c.agents))}]
     | _groups(if .agent then "file:" + .agent.file elif .call.agent_id then "id:" + .call.agent_id else "call:" + .call.id end)) as $agent_groups
  | ($c.subject.workflows | map(select(.run_id != null)) | _groups(.run_id)) as $run_groups
  | [ ($agent_groups[] | _call_row([.items[].call]; .items[0].agent)),
      ($c.subject.workflows[] | select(.run_id == null)
        | {linked: true, l, ts, kind: "workflow", type: .name, status: s::lifecycle_status(null; null), result: .notification.result}),
      ($run_groups[] | .items as $calls | _run_rows($c; .key; $calls; {linked: true, l: $calls[0].l, ts: $calls[0].ts})),
      ($c.subject.forks[] | . as $f | first($c.agents[] | select(.id == $f.agent_id)) // null
        | if . then _agent_row(.; {linked: true, l: $f.l, ts: $f.ts}) | .kind |= (if . == "internal" then . else "fork" end)
          else {linked: true, l: $f.l, ts: $f.ts, kind: "fork", id: $f.agent_id, status: "unknown"} end) ] as $linked
  | ([$linked[] | .file, .run_dir | strings]) as $used
  | ([$c.subject.workflows[].run_id | strings]) as $linked_runs
  | (([$c.journals | keys[]] + [$c.records | keys[]] + [$c.agents[] | select(.kind == "workflow-agent") | .run | strings])
     | unique | map(select(. as $r | $linked_runs | index([$r]) | not))) as $loose_runs
  | [ ($loose_runs[] | . as $run
        | ($c.records[$run].doc.timestamp // first($c.agents[] | select(.run == $run) | .ts) // null) as $ts
        | [_run_rows($c; $run; []; {linked: false, l: $after, ts: $ts})]
        | {internal: false, path: (.[0].file // ""), rows: .}),
      ($c.agents[] | select(.kind != "workflow-agent" and (.file as $f | $used | index([$f]) | not))
        | {internal, path: .file, rows: [_agent_row(.; {linked: false, l: $after, ts: .ts})]}) ]
  | sort_by(.internal, .path) | map(.rows[]) as $loose
  | ($linked | sort_by(.l)) + $loose;

def main($since; $until; $label_width; $result_width; $final):
  _collect as $c
  | ($c | _needs) as $needs
  | if ($final | not) and ($needs | length) > 0 then $needs[] | "need\t\(.)"
    else
      $c.subject.session_dir as $dir
      | [$c | _rows[] | select(s::within($since; $until))]
      | if length == 0 then empty
        else ([.[].partial[]?] | s::lower_bound_notice | "\(.)\n" | stderr | empty),
          (["dir", $dir] | s::tsv),
          (.[] | [(if .linked then s::handle else null end), .kind, .id, .type, .status, .model, .output,
                  (.label | s::trunc($label_width)), (.file | if . and $dir then _relpath($dir) else . end),
                  (.result | s::trunc($result_width))] | s::tsv)
        end
    end;
