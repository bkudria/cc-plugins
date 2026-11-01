import "sessions" as s;

# One-line descriptions of a tool call, shared by tools and conversation so both describe a call the
# same way. Input: a record of s::tool_calls, optionally with agent_call (from s::agent_calls),
# workflow_call (from s::workflow_calls) and answer (the s::human_inputs answer text). A width of 0
# keeps text whole.

def _fit($w; $tail):
  (if $w > 0 then s::trunc([$w - ($tail | length), 1] | max) else . end) + $tail;

def _flags: map(select(. != null) | " [\(.)]") | join("");

def _ms:
  if type != "number" then tostring
  elif . % 60000 == 0 then "\(. / 60000)m"
  elif . % 1000 == 0 then "\(. / 1000)s"
  else "\(.)ms" end;

def _chars: if type == "string" then length else 0 end;

def _first_line: tostring | split("\n") | map(select(test("\\S"))) | first // "";

def _compact: if type == "string" then (try (fromjson | tojson) catch .) else tojson end;

def _bash:
  (.command | tostring | sub("\\s+$"; "") | split("\n")) as $lines
  | {main: $lines[0],
     tail: ([(if ($lines | length) > 1 then "+\(($lines | length) - 1) lines" else null end),
             (if .run_in_background == true then "bg" else null end),
             (if .timeout != null then "timeout=\(.timeout | _ms)" else null end)] | _flags)};

def _read:
  {main: .file_path,
   tail: ([[(if .offset != null then "offset=\(.offset)" else empty end),
            (if .limit != null then "limit=\(.limit)" else empty end),
            (if .pages != null then "pages=\(.pages)" else empty end)] | join(" ") | select(length > 0)] | _flags)};

def _edit:
  {main: .file_path,
   tail: (["\(.old_string | _chars)→\(.new_string | _chars) chars", (if .replace_all == true then "all" else null end)] | _flags)};

def _notebook:
  {main: .notebook_path,
   tail: (["\(.edit_mode // "replace")\(if .cell_id then " \(.cell_id)" else "" end)", "\(.new_source | _chars) chars"] | _flags)};

def _search:
  {main: ((.pattern | tostring) + (if (.path // "") != "" then " in \(.path)" else "" end)),
   tail: ([(if .glob then "glob=\(.glob)" else null end), (if .type then "type=\(.type)" else null end)] | _flags)};

def _questions:
  {main: ([.questions[]? | "\(.question)\(if (.options | length? // 0) > 0 then " [\(.options | map(.label) | join(" | "))]" else "" end)"] | join(" / ")),
   tail: ""};

def _agent:
  {main: ([(.subagent_type // empty), (.description | strings | "\"\(.)\"")] | join(" ")),
   tail: ([(if .name then "name=\(.name)" else null end), (if .model then "model=\(.model)" else null end),
           (if .resume then "resume=\(.resume)" else null end), (if .run_in_background == true then "bg" else null end)] | _flags)};

def _workflow:
  {main: ([(.name // .scriptPath), (if .args != null then .args | _compact else empty end)] | join(" ")), tail: ""};

def _message:
  {main: ([(.to // .recipient | tostring),
           ((.summary // (.message | strings | _first_line) // null) | select(. != null and . != "") | "\"\(.)\"")] | join(" ")),
   tail: ""};

def _parts($name):
  if type != "object" then null
  elif $name == "Bash" and (.command | type) == "string" then _bash
  elif ($name == "Read") and (.file_path | type) == "string" then _read
  elif $name == "Write" and (.file_path | type) == "string" then {main: .file_path, tail: (["\(.content | _chars) chars"] | _flags)}
  elif $name == "Edit" and (.file_path | type) == "string" then _edit
  elif $name == "MultiEdit" and (.file_path | type) == "string" then {main: .file_path, tail: (["\(.edits | length? // 0) edits"] | _flags)}
  elif $name == "NotebookEdit" and (.notebook_path | type) == "string" then _notebook
  elif ($name == "Grep" or $name == "Glob") and .pattern != null then _search
  elif $name == "AskUserQuestion" and (.questions | type) == "array" then _questions
  elif ($name == "Agent" or $name == "Task") and (.description != null or .subagent_type != null) then _agent
  elif $name == "Workflow" and (.name != null or .scriptPath != null) then _workflow
  elif $name == "Skill" and (.skill // .command) != null then {main: ([.skill // .command, (.args | strings | select(length > 0))] | join(" ")), tail: ""}
  elif $name == "WebFetch" and .url != null then {main: .url, tail: ""}
  elif ($name == "WebSearch" or $name == "ToolSearch") and .query != null then {main: .query, tail: ""}
  elif $name == "SendMessage" and (.to // .recipient) != null then _message
  elif ($name | IN("TaskStop", "KillShell", "TaskOutput", "BashOutput")) and (.task_id // .shell_id // .bash_id) != null then
    {main: (.task_id // .shell_id // .bash_id | tostring), tail: ""}
  else null end;

# Only the variable part is cut to fit $w, so flags such as [bg] survive.
def input($w):
  .name as $name
  | (.input | _parts($name)) as $p
  | if $p then ($p.main | tostring) | _fit($w; $p.tail)
    else .input | tojson | s::trunc($w) end;

def status: if .status == "ok" and .persisted != null then "persisted" else .status end;

# A persisted output whose saved file is gone falls back to the size its marker states.
def size:
  if .persisted != null then (if .persisted.bytes != null then "\(.persisted.bytes)B" else .persisted.stated_size end)
  else .chars end;

def result($w):
  if .status == "none" then null
  elif .name == "AskUserQuestion" and .answer != null then .answer | s::trunc($w)
  elif (.name == "Agent" or .name == "Task") and .agent_call.agent_id != null then
    "\(.agent_call.agent_id) \(.agent_call.notification.status // .agent_call.status // "unknown")"
  elif .name == "Workflow" and .workflow_call.run_id != null then
    "\(.workflow_call.run_id) \(.workflow_call.notification.status // .workflow_call.status // "unknown")"
  elif .status == "denied" and .feedback != null then .feedback | s::trunc($w)
  elif .persisted != null then .persisted.path // .persisted.stated_path
  else .text | s::trunc($w) end;

def call($w):
  (" → \(status)" + (size | if . != null then " \(.)" else "" end)) as $tail
  | "\(.name) " as $head
  | $head + input(if $w > 0 then [$w - ($head | length) - ($tail | length), 20] | max else 0 end) + $tail;

# Record plumbing that tools and conversation share. This module is imported, so nothing in it may
# call an s:: function that calls another one (see cc_module_program in common.sh).

def src: .agent // "main";

# Merges per-file record arrays by time. Each record sorts by the latest timestamp its file has shown
# so far, since timestamps can run backwards, so every file keeps its own order.
def by_time:
  if length == 1 then .[0]
  else
    [ .[] | (first(.[] | .ts | strings) // "") as $start
      | foreach .[] as $r ($start; if ($r.ts | type) == "string" and $r.ts > . then $r.ts else . end; $r + {_key: .}) ]
    | sort_by([._key, .fi]) | map(del(._key))
  end;
