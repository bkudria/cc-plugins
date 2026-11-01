import "sessions" as s;
import "render" as r;

def _first_line: tostring | split("\n") | map(select(test("\\S"))) | first // "";

def _record($l; $o; $ts; $role; $text): {l: $l, o: $o, ts: $ts, role: $role, text: $text};

def _notification_marker:
  ([.text | capture("^<(?<k>[a-z]+)-notification>").k][0] // "task") as $kind
  | "[\($kind) notification: \(.summary // .status // (.text | _first_line) | s::trunc(120))]";

def _marker($bodies; $triggers):
  .text as $x
  | if .class == "injected" then
      $bodies["\(.l)"] as $b | $triggers["\(.l)"] as $g
      | if $b and $b.event == "re-invoked" then "[skill re-invoked: \($b.name)]"
        elif $b and $b.how == "bundled" then "[skill body: \($b.name) (bundled)]"
        elif $b then "[skill body: \($b.name)]"
        elif $g then "[harness command: \($g.name)]"
        else "[injected \($x | length) chars: \($x | _first_line | s::trunc(60))]" end
    elif .class == "summary" then "[compaction summary \($x | length) chars]"
    else $x end;

def _messages($o; $time):
  select(.synthetic | not)
  | [.blocks[] | select(.block.type == "text" and ((.block.text // "") | length) > 0)] as $texts
  | (if $o.thinking then
       .blocks[] | select(.block.type == "thinking" and ((.block.thinking // "") | length) > 0)
       | _record(.l; 0; $time["\(.l)"]; "thinking"; .block.thinking)
     else empty end),
    (if ($texts | length) > 0 or $o.tokens then
       ($texts[0].l // .l) as $l
       | _record($l; 1; $time["\($l)"]; "assistant"; ($texts | map(.block.text) | join("\n")))
         + {tokens: [.usage.input, .usage.cache_read, .usage.cache_creation, .usage.output, .context]}
     else empty end);

def _seconds: (. / 100 | round) / 10;

def _system_event:
  (.subtype // "") as $st
  | if $st == "turn_duration" then
      "turn took \(.durationMs | _seconds)s\(if .messageCount then ", \(.messageCount) messages" else "" end)"
    elif $st == "stop_hook_summary" then
      ((.hookErrors // []) | length) as $errors
      | "stop hooks: \(.hookCount // 0) ran"
        + (if $errors > 0 then ", \($errors) error\(if $errors == 1 then "" else "s" end)" else "" end)
        + (if .preventedContinuation == true then ", stopped: \(.stopReason // "")" else "" end)
    elif $st == "microcompact_boundary" then
      .microcompactMetadata as $m
      | "microcompaction \($m.trigger // "-"): \($m.preTokens // "?") tokens, \($m.tokensSaved // "?") saved"
    elif $st == "away_summary" then "recap: \(.content // "")"
    elif $st == "informational" then "info: \(.content // "")"
    elif $st == "scheduled_task_fire" then "scheduled task: \(.content // "")"
    elif $st == "agents_killed" then "agents killed"
    elif $st | test("^model_.*_fallback$") then "model fallback: \(.originalModel // "-") → \(.fallbackModel // "-")"
    else empty end;

def _attachment_event:
  (.type // "") as $type
  | if $type | startswith("hook_") then
      ([.stdout, .content, .stderr] | map(strings | select(test("\\S"))) | first // "" | _first_line) as $said
      | "hook \(.hookName // .hookEvent // "-") \($type[5:])" + (if $said != "" then ": \($said)" else "" end)
    elif $type == "ultra_effort_enter" then "ultra effort on"
    elif $type == "ultra_effort_exit" then "ultra effort off"
    else empty end;

def _events:
  (reduce (s::messages | select((.synthetic | not) and .model != null)) as $m ({model: null, out: []};
     if $m.model != .model then .model = $m.model | .out += [_record($m.l; -1; $m.ts; "event"; "model: \($m.model)")] else . end)
   | .out[]),
  ([s::api_errors] as $errors
   | ($errors[] | _record(.l; 0; .ts; "event"; "api error \(.status // "-"): \(.text | _first_line)")),
     (($errors | map(.l)) as $lines
      | s::messages | select(.synthetic) | select(.l as $l | $lines | index([$l]) | not)
      | _record(.l; 1; .ts; "event"; "synthetic: \([.blocks[].block | select(.type == "text") | .text] | join(" ") | _first_line)"))),
  (s::compactions | _record(.l; 0; .ts; "event"; "compaction \(.trigger // "-"): \(.pre_tokens // "?") → \(.post_tokens // "?") tokens")),
  (reduce (s::entries[] | select(.e.type == "permission-mode" or .e.type == "mode")) as $r ({out: []};
     (if $r.e.type == "mode" then "mode" else "permission mode" end) as $k
     | ($r.e.permissionMode // $r.e.mode) as $v
     | if .[$k] != $v then .[$k] = $v | .out += [_record($r.l; 0; $r.t; "event"; "\($k): \($v)")] else . end)
   | .out[]),
  (s::entries[] | . as $r
   | (if .e.type == "system" then .e | _system_event
      elif .e.type == "attachment" then .e.attachment | _attachment_event
      elif .e.type == "relocated" then "cwd: \(.e.relocatedCwd // "-")"
      else empty end)
   | _record($r.l; 0; $r.t; "event"; .));

def _records($o; $fi):
  s::memo
  | r::src as $src
  | .lines as $lines
  | (reduce s::entries[] as $r ({}; .["\($r.l)"] = $r.t)) as $time
  | [s::skill_events] as $skills
  | ($skills | map(select(.body_l != null)) | INDEX(.body_l)) as $bodies
  | ($skills | map(select(.event == "load" and .body_l != null and .body_l != .l)) | INDEX(.l)) as $triggers
  | [ (s::human_inputs | _record(.l; 0; .ts; .kind; .text)),
      (s::interrupts | _record(.l; 0; .ts; "interrupt"; .text)),
      (s::outputs | _record(.l; 0; .ts; "output"; .text)),
      (s::user_entries | select(.class | IN("injected", "summary", "peer", "from-parent"))
        | _record(.l; 0; .t; .class; _marker($bodies; $triggers))),
      (s::notifications | _record(.l; 0; .ts; "notification"; _notification_marker)),
      (s::messages | _messages($o; $time)),
      (s::tool_calls | _record(.l; 2; .ts; "tool"; r::call($o.width))),
      (if $o.events then _events else empty end) ]
  | map(select(s::within($o.since; $o.until)) + {src: $src, fi: $fi})
  | {lines: $lines, records: sort_by([.l, .o])};

def _around($o):
  if $o.around == null then .
  else
    . as $all
    | ([range(0; length) | select($all[.].fi == 0 and $all[.].l <= $o.around.line)] | last
       // ([range(0; length) | select($all[.].fi == 0)] | first) // 0) as $at
    | .[([$at - $o.around.count, 0] | max):($at + $o.around.count + 1)]
  end;

def _row($o):
  (if .role == "assistant" then $o.assistant_width else $o.width end) as $w
  | [s::handle, .src, (.ts | s::ts), .role, (.text | s::trunc($w))]
  + (if $o.tokens then (.tokens // [null, null, null, null, null]) else [] end)
  | s::tsv;

def main($o):
  [ foreach s::transcripts as $t (-1; . + 1; . as $fi | $t | select($fi == 0 or (s::is_internal | not)) | _records($o; $fi)) ]
  | if $o.around != null and $o.around.line > .[0].lines then
      ("cc-sessions: --around L\($o.around.line) is past the end of \($o.file) (\(.[0].lines) lines); pass a handle of that file; see cc-sessions conversation --help\n"
       | halt_error(2))
    else . end
  | map(.records) | r::by_time | _around($o)
  | if length == 0 then ("cc-sessions: no conversation records in \($o.what)\($o.filters)\n" | stderr | empty)
    else .[] | _row($o) end;
