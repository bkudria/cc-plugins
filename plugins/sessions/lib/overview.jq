import "sessions" as s;
import "render" as r;

def _no_window($since; $until): $since == null and $until == null;

# User classes are computed over the whole file before the window cuts it, so the first user entry
# inside a window is not taken for an agent's delegation prompt.
def _windowed($since; $until):
  if _no_window($since; $until) then .
  else ._entries |= map(select(s::within($since; $until))) | ._users |= map(select(s::within($since; $until))) end;

# Lines that s::entries leaves out (repeats, unparseable lines) carry the time of the nearest earlier
# entry, so a time bound places them like any other line.
def _timed_lines($lines):
  ([s::entries[] | {l, t}] + ($lines | map({l: ., gap: true})))
  | sort_by(.l)
  | reduce .[] as $r ({t: null, out: []}; if $r.gap then .out += [{l: $r.l, t: .t}] else .t = $r.t end)
  | .out;

def _count_in($lines; $since; $until):
  if _no_window($since; $until) then $lines | length
  else [_timed_lines($lines)[] | select(s::within($since; $until))] | length end;

def _two: tostring | if length < 2 then "0" + . else . end;

def _duration:
  (. / 86400 | floor) as $d | (. % 86400 / 3600 | floor) as $h | (. % 3600 / 60 | floor) as $m | (. % 60) as $sec
  | if $d > 0 then "\($d)d\($h | _two)h\($m | _two)m\($sec | _two)s"
    elif $h > 0 then "\($h)h\($m | _two)m\($sec | _two)s"
    elif $m > 0 then "\($m)m\($sec | _two)s"
    else "\($sec)s" end;

def _handle_of: if . == null then null else "L\(.)" end;

# kind=count fields for the names in $order, then any other names, skipping zero counts.
def _counts($order):
  . as $c
  | ($order + ((keys_unsorted - $order) | sort))
  | map(select(($c[.] // 0) > 0) | "\(.)=\($c[.])");

def _tally(f): reduce .[] as $x ({}; .[$x | f] += 1);

def _tokens: [.input, .cache_creation, .cache_read, .output];

def _first_uses(f):
  reduce (s::entries[] | {l, v: (.e | f)} | select(.v | type == "string")) as $x ({seen: {}, out: []};
    if .seen[$x.v] then . else .seen[$x.v] = true | .out += [$x] end)
  | .out[];

def _resumed_from:
  .session as $own
  | s::session_ids[] as $id
  | select($id != $own)
  | [s::entries[] | select(.e.sessionId == $id) | .l]
  | ["resumed_from", $id, (min | _handle_of), (max | _handle_of)];

def _identity:
  ["path", .file],
  ["id", (.agent // .session)],
  ["kind", .kind],
  (if .kind != "main" then ["parent", .session] + (if .run then [.run] else [] end) else empty end),
  (s::internal_reason | select(. != null) | ["internal", .]),
  _resumed_from,
  ["project", ((.project_dir // "") | split("/") | last)];

def _label($width):
  (s::label_of | select(. != null) | ["label", (.text | s::display($width)), .source, (.l | _handle_of)]),
  ["origin", s::origin];

def _span:
  s::span as $span
  | select($span.first != null)
  | ["start", ($span.first | s::ts), (first(s::entries[] | select(.e.timestamp == $span.first) | .l) | _handle_of)],
    ["end", ($span.last | s::ts), (first(s::entries[] | select(.e.timestamp == $span.last) | .l) | _handle_of)],
    ["duration", (($span.last | s::ts | fromdateiso8601) - ($span.first | s::ts | fromdateiso8601) | _duration)];

def _cost:
  s::cost_states
  | ["cost", (.l | _handle_of), .total_cost_usd]
    + [.models | to_entries[]
       | "\(.key)=\(.value.inputTokens // 0)/\(.value.cacheCreationInputTokens // 0)/\(.value.cacheReadInputTokens // 0)/\(.value.outputTokens // 0)"];

def _tools($calls):
  ($calls | group_by(.name)
    | map({name: .[0].name, calls: length, chars: (map(.chars // 0) | add),
           errors: (map(select(.status == "error")) | length)})
    | sort_by(-.calls, .name)[]
    | ["tool", .name, .calls, .chars, .errors]),
  ($calls | map(select(.result_l != null)) | sort_by(-(.persisted.bytes // .chars // 0), .result_l)[:5][]
    | ["largest", (.result_l | _handle_of), .name, r::size, (.persisted | if . then .path // .stated_path else null end)]);

# The agent transcripts read with a main transcript, each with its kind; when they are windowed or
# their tokens are needed, they carry their entries computed once.
def _agent_set($rest; $since; $until; $with_agents):
  [$rest[] | select(.kind != "journal")
   | if $with_agents or (_no_window($since; $until) | not) then s::memo | _windowed($since; $until) else . end
   | select(_no_window($since; $until) or (s::entries | length) > 0)
   | {t: ., kind: s::agent_kind}];

# Journal labels name workflow agents; agent calls give agents without a meta file a type.
def _journal_labels($rest): [$rest[] | select(.kind == "journal") | s::journal | {key: .agent_id, value: .label}] | from_entries;

# A split-pane teammate's transcript is a session of its own: its id is the session's, and its call
# gives it a type and a label.
def _agent_line($agent_calls; $journal; $width):
  select(.kind != "internal")
  | .kind as $kind
  | .t
  | s::matching_call($agent_calls) as $call
  | ["agent", (.agent // .session), $kind, (.meta.agentType? // $call.subagent_type)]
    + (s::totals | _tokens)
    + [s::agent_label($journal[.agent // ""]) // ($call | if . then {text: .description} else null end) | if . then .text | s::display($width) else null end];

#: The overview records of the first transcript; the others are its agent transcripts and journals.
def overview($since; $until; $width; $with_agents):
  [s::transcripts] as $all
  | ($all[0] | s::memo) as $whole
  | ($whole | _windowed($since; $until)) as $t
  | select(_no_window($since; $until) or ($t | s::entries | length) > 0)
  | ($t | s::totals) as $totals
  | [$t | s::tool_calls] as $calls
  | (if $whole.kind == "main" then _agent_set($all[1:]; $since; $until; $with_agents) else null end) as $agents
  | ($whole | _identity),
    ($t | _first_uses(.cwd) | ["cwd", .v, (.l | _handle_of)]),
    ($whole | _label($width)),
    ($t | s::versions | select(length > 0) | ["versions"] + .),
    ($t | s::models | select(length > 0) | ["models"] + .),
    ($t | _span),
    ([$t | s::human_inputs] | ["prompts", length] + (_tally(.kind) | _counts(["prompt", "slash", "bash", "sdk", "queued", "answer", "denied", "plan"]))),
    ["messages", $totals.messages, "synthetic=\($totals.synthetic)"],
    ["tokens"] + ($totals | _tokens),
    (if $with_agents and $agents != null then ["tokens_with_agents"] + ([$t] + ($agents | map(.t)) | s::rollup | _tokens) else empty end),
    (if $totals.messages > 0 then ["peak_context", $totals.peak_context, ($totals.peak_l | _handle_of)] else empty end),
    ($t | _cost),
    _tools($calls),
    ($t | s::compactions | ["compaction", (.l | _handle_of), .trigger, .pre_tokens, .post_tokens]),
    ($t | s::skill_loads | ["skill", (.l | _handle_of), .name, .how]),
    (if $agents != null then
       ["agents", ($agents | map(select(.kind != "internal")) | length)]
         + ($agents | _tally(.kind) | _counts(["agent", "teammate", "fork", "workflow-agent", "flat", "internal"])),
       (if $with_agents then
          [$whole | s::agent_calls] as $agent_calls | _journal_labels($all[1:]) as $journal
          | $agents[] | _agent_line($agent_calls; $journal; $width)
        else empty end)
     else empty end),
    ["workflows", ([$t | s::workflow_calls | .run_id // .id] | unique | length)],
    ["errors", ($calls | map(select(.status == "error")) | length)],
    ["api_errors", ([$t | s::api_errors] | length)],
    ["persisted", ($calls | map(select(.persisted != null)) | length)],
    ["skipped_lines", ($whole | _count_in($whole.skipped; $since; $until))],
    ["duplicate_entries", ($whole | _count_in([s::duplicates | .l]; $since; $until))]
  | s::tsv;
