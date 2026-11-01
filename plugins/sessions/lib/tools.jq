import "sessions" as s;
import "render" as r;

# The linked agent, run and answer are looked up only when the transcript has such calls: each
# lookup is another pass over a large transcript.
def _calls:
  [s::tool_calls] as $calls
  | (if any($calls[]; .name == "Agent" or .name == "Task") then [s::agent_calls] | INDEX(.id) else {} end) as $agents
  | (if any($calls[]; .name == "Workflow") then [s::workflow_calls] | INDEX(.id) else {} end) as $runs
  | (if any($calls[]; .name == "AskUserQuestion") then
       [s::human_inputs | select(.kind == "answer" and .tool_use_id != null)] | INDEX(.tool_use_id)
     else {} end) as $answers
  | $calls[]
  | . + {agent_call: $agents[.id], workflow_call: $runs[.id], answer: $answers[.id].text};

def _matches($o):
  ($o.name == "" or (.name | test($o.name)))
  and ($o.input == "" or (r::input(0) | test($o.input)) or (.input | tojson | test($o.input))
       or (.wire_input != null and (.wire_input | tojson | test($o.input))))
  and ($o.result == "" or ((.text // "") | test($o.result)) or ((r::result(0) // "") | test($o.result)))
  and (($o.errors | not) or .status == "error");

def _records($o; $fi):
  s::memo | r::src as $src
  | [_calls | select(s::within($o.since; $o.until) and _matches($o)) | . + {src: $src, fi: $fi}];

def main($o):
  [ foreach s::transcripts as $t (-1; . + 1; . as $fi | $t | select($fi == 0 or (s::is_internal | not)) | _records($o; $fi)) ]
  | r::by_time
  | if length == 0 then ("cc-sessions: no tool calls in \($o.what)\($o.filters)\n" | stderr | empty)
    else .[] | [s::handle, .src, (.ts | s::ts), .name, r::status, r::size, r::input($o.width), r::result($o.width)] | s::tsv
    end;
