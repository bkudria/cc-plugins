import "sessions" as s;
import "render" as r;

# $ARGS.named.__ends holds cc_agent_ends and cc_run_records lines. Each agent transcript becomes a
# transcript object of its first user line and its last lines, enough to link it to a call as agents
# does and to tell how it ended; each run record gives its run's status.
def _ends:
  ($ARGS.named.__ends // "") | split("\n")
  | map(select(length > 0) | split("\t") | select(length >= 3) | {path: .[0], what: .[1], json: (.[2:] | join("\t"))})
  | group_by(.path)
  | map((.[0].path | s::path_info)
      + {meta: ([.[] | select(.what == "meta") | .json] | if length > 0 then join(" ") | try fromjson catch null else null end),
         record: ([.[] | select(.what == "record") | .json] | if length > 0 then join(" ") | try fromjson catch null else null end),
         rows: ([(.[] | select(.what == "first")), (.[] | select(.what == "line")) | .json | try fromjson catch empty]
                | to_entries | map({l: (.key + 1), e: .value}))})
  | {agents: [.[] | select(.kind != "file") | s::memo | . + {id: (.agent // .session), end: s::end_status}],
     runs: ([.[] | select(.record != null)
             | {key: (.record.runId // (.file | sub("^.*/"; "") | sub("\\.json$"; ""))), value: .record.status}] | from_entries)};

# $agents: the ends' agents, each with the id of its call among this transcript's (s::started_by).
def _started_agent($agents):
  . as $call
  | s::started_agent($agents) as $file
  | ($file.id // $call.agent_id) as $id
  | if $id == null then null else {id: $id, status: ($call | s::lifecycle_status(null; $file.end))} end;

def _started_run($ends):
  if .run_id == null then null else {id: .run_id, status: s::lifecycle_status($ends.runs[.run_id]; null)} end;

# The linked agent, run and answer are looked up only when the transcript has such calls: each
# lookup is another pass over a large transcript.
def _calls($ends):
  [s::tool_calls] as $calls
  | (if any($calls[]; .name == "Agent" or .name == "Task") then [s::agent_calls] else [] end) as $agent_calls
  | ($agent_calls | INDEX(.id)) as $agents
  | (if ($agent_calls | length) > 0 then [$ends.agents[] | . + {call: s::started_by($agent_calls)}] else [] end) as $linkable
  | (if any($calls[]; .name == "Workflow") then [s::workflow_calls] | INDEX(.id) else {} end) as $runs
  | (if any($calls[]; .name == "AskUserQuestion") then
       [s::human_inputs | select(.kind == "answer" and .tool_use_id != null)] | INDEX(.tool_use_id)
     else {} end) as $answers
  | $calls[]
  | . + {started: (if .name == "Agent" or .name == "Task" then $agents[.id] | if . then _started_agent($linkable) else null end
                   elif .name == "Workflow" then $runs[.id] | if . then _started_run($ends) else null end
                   else null end),
         answer: $answers[.id].text};

def _matches($o):
  ($o.name == "" or (.name | test($o.name)))
  and ($o.input == "" or (r::input(0) | test($o.input)) or (.input | tojson | test($o.input))
       or (.wire_input != null and (.wire_input | tojson | test($o.input))))
  and ($o.result == "" or ((.text // "") | test($o.result)) or ((r::result(0) // "") | test($o.result)))
  and (($o.errors | not) or .status == "error");

def _records($o; $fi; $ends):
  s::memo | r::src($fi) as $src
  | [_calls($ends) | select(s::within($o.since; $o.until) and _matches($o)) | . + {src: $src, fi: $fi}];

def main($o):
  _ends as $ends
  | [ foreach s::transcripts as $t (-1; . + 1; . as $fi | $t | select($fi == 0 or (s::is_internal | not)) | _records($o; $fi; $ends)) ]
  | r::by_time
  | if length == 0 then ("cc-sessions: no tool calls in \($o.what)\($o.filters)\n" | stderr | empty)
    else .[] | [s::handle, .src, (.ts | s::ts), .name, r::status, r::size, r::input($o.width), r::result($o.width)] | s::tsv
    end;
