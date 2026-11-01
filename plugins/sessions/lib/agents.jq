import "sessions" as s;

def _dirname: split("/") | .[:-1] | join("/");

# Only paths under the session directory are relative: it may not exist, and a path through it would
# then name nothing.
def _relpath($base): if startswith($base + "/") then .[($base | length) + 1:] else . end;

def _status:
  if type != "string" then null
  else ascii_downcase
    | if . == "completed" or . == "success" then "completed"
      elif . == "failed" or . == "error" then "failed"
      elif . == "killed" or . == "cancelled" or . == "canceled" or . == "stopped" then "killed"
      elif . == "running" or . == "denied" then .
      else null end
  end;

def _first_status: map(select(. != null)) | first // "unknown";

def _as_text: if . == null or type == "string" then . else tojson end;

# Before 2.1.300 stop_reason is often null on every entry, so a last message without a pending tool call
# also counts as finished.
def end_status:
  ([s::entries[] | select(.e.type == "user" or .e.type == "assistant")] | last) as $last
  | ($last.e.message.stop_reason? // null) as $stop
  | if $last == null or $last.e.type != "assistant" then null
    elif $last.e.isApiErrorMessage == true then "failed"
    elif $stop == "end_turn" or $stop == "stop_sequence" then "completed"
    elif $stop == null and ([$last.e.message.content | arrays | .[] | select(.type == "tool_use")] | length) == 0 then "completed"
    else null end;

def _subject:
  s::memo
  | {file, kind, session_dir, lines, calls: [s::agent_calls], workflows: [s::workflow_calls], forks: [s::fork_launches]};

def _agent($calls; $journals):
  s::memo
  | . as $t
  | (if .run then first($journals[.run].entries[]? | select(.agent_id == $t.agent)) // null else null end) as $j
  | {file, kind, agent, run, meta,
     internal: s::is_internal,
     agent_kind: s::agent_kind,
     call: (if .kind == "workflow-agent" then null else s::matching_call($calls) | if . then .id else null end end),
     journal: $j,
     label: (s::agent_label($j.label) | if . then .text else null end),
     models: (s::models | if length > 0 then join(",") else null end),
     output: (s::totals | .output),
     result: (s::agent_result | if . then .text else null end),
     end: end_status,
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

def _needs:
  . as $c
  | [ ($c.subject.calls[] | select(.agent_id != null) | . as $call
        | select(all($c.agents[]; .agent != $call.agent_id and .call != $call.id)) | "agent\t\(.agent_id)"),
      ($c.subject.forks[] | .agent_id as $id | select(all($c.agents[]; .agent != $id)) | "agent\t\($id)"),
      ($c.subject.workflows[] | .run_id | strings | . as $run
        | select($c.journals[$run] == null and $c.records[$run] == null and all($c.agents[]; .run != $run)) | "run\t\($run)") ]
  | unique;

def _kind($call):
  if .agent_kind == "internal" then "internal"
  elif ($call.status? // "") == "teammate_spawned" then "teammate"
  else .agent_kind // "agent" end;

def _agent_row($a; $at):
  $at + {file: $a.file, kind: ($a // {} | _kind(null)), id: $a.agent, type: $a.meta.agentType?, status: ([$a.end] | _first_status),
         model: $a.models, output: $a.output, label: $a.label, result: $a.result};

def _call_row($c; $a):
  {linked: true, l: $c.l, ts: $c.ts, file: $a.file, kind: ($a // {} | _kind($c)), id: ($c.agent_id // $a.agent),
   type: ($a.meta.agentType? // $c.subagent_type), status: ([($c.notification.status | _status), ($c.status | _status), $a.end] | _first_status),
   model: $a.models, output: $a.output, label: ($a.label // $c.description // $c.name // $c.prompt),
   result: ($c.notification.result // $a.result)};

def _run_rows($c; $run; $w; $at):
  $c.records[$run] as $rec
  | $c.journals[$run] as $jr
  | [$c.agents[] | select(.kind == "workflow-agent" and .run == $run)] as $files
  | ([$jr.entries[]? | . as $je | {journal: $je, agent: (first($files[] | select(.agent == $je.agent_id)) // null)}]
     + [$files[] | . as $a | select(all($jr.entries[]?; .agent_id != $a.agent)) | {journal: null, agent: .}]) as $items
  | ($rec.doc.status | _status) as $run_status
  | ($jr.file // first($files[].file) // null | if . then _dirname else null end) as $run_dir
  | ($at + {kind: "workflow", id: $run, type: ($w.name // $rec.doc.workflowName), run_dir: $run_dir,
            status: ([$run_status, ($w.notification.status | _status), ($w.status | _status)] | _first_status),
            model: ($rec.doc.defaultModel // ([$files[].models | strings] | unique | join(",") | if . == "" then null else . end)),
            output: ([$files[].output | numbers] | if length > 0 then add else null end),
            label: $rec.doc.summary, file: ($run_dir // $rec.file),
            result: ($w.notification.result // ($rec.doc.result | _as_text) // $rec.doc.error)}),
    ($items[] | .journal as $je | .agent as $a
      | $at + {file: $a.file, kind: (if $a.internal then "internal" else "workflow-agent" end), id: ($je.agent_id // $a.agent),
               type: $a.meta.agentType?,
               status: ([(if $je.result_l != null then "completed" else null end),
                         (if $run_status == "completed" then null else $run_status end), $a.end] | _first_status),
               model: $a.models, output: $a.output, label: ($a.label // $je.label),
               result: (($je.result | _as_text) // $a.result)});

def _rows:
  . as $c
  | ($c.subject.lines + 1) as $after
  | [ ($c.subject.calls[] | . as $call
        | (first($c.agents[] | select(.call == $call.id)) // first($c.agents[] | select($call.agent_id != null and .agent == $call.agent_id)) // null) as $a
        | _call_row($call; $a)),
      ($c.subject.workflows[] | select(.run_id == null) | {linked: true, l, ts, kind: "workflow", type: .name,
        status: ([(.notification.status | _status), (.status | _status)] | _first_status), result: .notification.result}),
      ($c.subject.workflows[] | . as $w | .run_id | strings | _run_rows($c; .; $w; {linked: true, l: $w.l, ts: $w.ts})),
      ($c.subject.forks[] | . as $f | first($c.agents[] | select(.agent == $f.agent_id)) // null
        | if . then _agent_row(.; {linked: true, l: $f.l, ts: $f.ts}) | .kind |= (if . == "internal" then . else "fork" end)
          else {linked: true, l: $f.l, ts: $f.ts, kind: "fork", id: $f.agent_id, status: "unknown"} end) ] as $linked
  | ([$linked[] | .file, .run_dir | strings]) as $used
  | ([$c.subject.workflows[].run_id | strings]) as $linked_runs
  | (([$c.journals | keys[]] + [$c.records | keys[]] + [$c.agents[] | select(.kind == "workflow-agent") | .run | strings])
     | unique | map(select(. as $r | $linked_runs | index([$r]) | not))) as $loose_runs
  | [ ($loose_runs[] | . as $run
        | ($c.records[$run].doc.timestamp // first($c.agents[] | select(.run == $run) | .ts) // null) as $ts
        | [_run_rows($c; $run; null; {linked: false, l: $after, ts: $ts})]
        | {internal: false, path: (.[0].file // ""), rows: .}),
      ($c.agents[] | select(.kind != "workflow-agent" and (.file as $f | $used | index([$f]) | not))
        | {internal, path: .file, rows: [_agent_row(.; {linked: false, l: $after, ts: .ts})]}) ]
  | sort_by(.internal, .path) | map(.rows[]) as $loose
  | $linked + $loose;

def main($since; $until; $label_width; $result_width; $final):
  _collect as $c
  | ($c | _needs) as $needs
  | if ($final | not) and ($needs | length) > 0 then $needs[] | "need\t\(.)"
    else
      $c.subject.session_dir as $dir
      | [$c | _rows[] | select(s::within($since; $until))]
      | if length == 0 then empty
        else (["dir", $dir] | s::tsv),
          (.[] | [(if .linked then s::handle else null end), .kind, .id, .type, .status, .model, .output,
                  (.label | s::trunc($label_width)), (.file | if . and $dir then _relpath($dir) else . end),
                  (.result | s::trunc($result_width))] | s::tsv)
        end
    end;
