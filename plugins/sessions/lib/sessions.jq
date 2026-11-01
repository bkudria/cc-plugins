def _dash: if . == "-" or . == "" then null else . end;

def _context_lines:
  ($ARGS.named.__ctx // "") | split("\n") | map(select(length > 0) | split("\t"));

def _sizes:
  ($ARGS.named.__sizes // "") | split("\n")
  | map(select(length > 0) | split("\t") | {key: (.[1:] | join("\t")), value: (.[0] | tonumber)})
  | from_entries;

def _stats:
  ($ARGS.named.__stats // "") | split("\n")
  | map(select(length > 0) | split("\t") | {key: (.[2:] | join("\t")), value: {bytes: (.[0] | tonumber), mtime: (.[1] | tonumber)}})
  | from_entries;

# cc_jq_program sends every file as one text, each file followed by a newline and the line of
# lib/file-separator: the pieces are each file's lines, the files first, then the meta files.
def _pieces:
  ($ARGS.named.__bundle // "") | split("\n") as $lines
  | [foreach ($lines | indices("\u001ecc-sessions next file\u001e"))[] as $end ({start: 0};
      {start: ($end + 1), piece: $lines[.start:$end]}; .piece)]
  | map(if length > 0 and .[-1] == "" then .[:-1] else . end);

def _handles_text:
  (.[:5] | map("L\(.)") | join(", ")) + (if length > 5 then " and \(length - 5) more" else "" end);

#: Prints the notice of a transcript object's unparseable lines on stderr ("cc-sessions: skipped <n> unparseable lines in <file>: L…"); emits nothing.
def skipped_notice:
  if (.skipped | length) > 0 then
    ("cc-sessions: skipped \(.skipped | length) unparseable line\(if (.skipped | length) == 1 then "" else "s" end)"
      + " in \(.file): \(.skipped | _handles_text)\n") | stderr | empty
  else empty end;

#: One transcript object per operand, in operand order: {file, kind, session, agent, run, session_dir, project_dir, meta, bytes, mtime, lines, rows: [{l, e}], skipped: [line...], sizes}.
def transcripts:
  _sizes as $sizes
  | _stats as $stats
  | _pieces as $pieces
  | _context_lines as $context
  | ($context | map(select(.[0] != "-")) | length) as $files
  | if ($pieces | length) != $files + ($context | map(select((.[8] // "-") != "-")) | length) then
      error("a file changed or vanished while it was read")
    else . end
  | $context[] as $c
  | (if $c[0] == "-" then [inputs] else $pieces[$c[0] | tonumber] end) as $lines
  | (reduce range(0; $lines | length) as $i ({rows: [], skipped: []};
      (try ($lines[$i] | fromjson) catch null) as $e
      | if ($e | type) == "object" then .rows += [{l: ($i + 1), e: $e}]
        elif ($lines[$i] | test("\\S")) then .skipped += [$i + 1]
        else . end)) as $parsed
  | {
      file: $c[1],
      kind: $c[2],
      session: ($c[3] // "-" | _dash),
      agent: ($c[4] // "-" | _dash),
      run: ($c[5] // "-" | _dash),
      session_dir: ($c[6] // "-" | _dash),
      project_dir: ($c[7] // "-" | _dash),
      bytes: ($stats[$c[1]].bytes // null),
      mtime: ($stats[$c[1]].mtime // null),
      meta: ($c[8] // "-" | _dash | if . then (try ($pieces[$files + (.[1:] | tonumber)] | join("\n") | fromjson) catch null) else null end),
      lines: ($lines | length),
      rows: $parsed.rows,
      skipped: $parsed.skipped,
      sizes: $sizes
    }
  | skipped_notice, .;

# Cross-session reading: rg prints selected lines as "<path>TAB<line>TAB<json>", and these functions turn
# them back into transcript objects holding only those rows, so s:: rules run on them without parsing
# whole files.

#: The cc_path_info fields of an absolute transcript path: {file, kind, session, agent, run, session_dir, project_dir}; a flat agent's session is null (it is its sessionId).
def path_info:
  . as $file
  | ($file | sub("/[^/]*$"; "")) as $dir
  | ($file | sub("^.*/"; "")) as $base
  | (if $file | test("/subagents/workflows/[^/]+/journal\\.jsonl$") then
       {kind: "journal", run: ($dir | sub("^.*/"; "")), session_dir: ($dir | sub("/subagents/workflows/[^/]+$"; ""))}
     elif $file | test("/subagents/workflows/[^/]+/agent-[^/]*\\.jsonl$") then
       {kind: "workflow-agent", run: ($dir | sub("^.*/"; "")), session_dir: ($dir | sub("/subagents/workflows/[^/]+$"; ""))}
     elif $file | test("/subagents/agent-[^/]*\\.jsonl$") then {kind: "subagent", session_dir: ($dir | sub("/subagents$"; ""))}
     elif $base | test("^agent-.*\\.jsonl$") then {kind: "flat", project_dir: $dir}
     elif $base | endswith(".jsonl") then {kind: "main", session_dir: ($file | sub("\\.jsonl$"; ""))}
     else {kind: "file"} end) as $i
  | {file: $file, kind: $i.kind, session: null, agent: null, run: ($i.run // null), session_dir: ($i.session_dir // null),
     project_dir: ($i.project_dir // null)}
  | if .session_dir then .session = (.session_dir | sub("^.*/"; "")) | .project_dir = (.session_dir | sub("/[^/]*$"; "")) else . end
  | if .kind | IN("subagent", "workflow-agent", "flat") then .agent = ($base | ltrimstr("agent-") | sub("\\.jsonl$"; "")) else . end;

#: rg output lines grouped by file: {<path>: {<line>: <raw json>}}; a line seen twice is kept once. Input: a stream of "<path>TAB<line>TAB<json>" strings.
def group_lines(lines):
  reduce (lines | select(length > 0) | split("\t") | select(length >= 3)) as $p ({};
    .[$p[0]][$p[1]] = ($p[2:] | join("\t")));

#: A transcript object of one file's selected lines, like s::transcripts but lines is null and sizes empty; $stat is {mtime, bytes} or null. Input: {<line>: <raw json>}.
def from_lines($path; $stat):
  (to_entries | map({l: (.key | tonumber), raw: .value}) | sort_by(.l)) as $lines
  | (reduce $lines[] as $x ({rows: [], skipped: []};
      (try ($x.raw | fromjson) catch null) as $e
      | if ($e | type) == "object" then .rows += [{l: $x.l, e: $e}] else .skipped += [$x.l] end)) as $parsed
  | ($path | path_info)
  | if .kind == "flat" then .session = first($parsed.rows[] | .e.sessionId | strings) // null else . end
  | . + {meta: null, bytes: ($stat.bytes // null), mtime: ($stat.mtime // null), lines: null,
         rows: $parsed.rows, skipped: $parsed.skipped, sizes: {}};

def _dedupe:
  reduce .rows[] as $r ({seen: {}, out: [], t: null};
    ($r.e.uuid // null) as $u
    | if ($u | type) == "string" and .seen[$u] then .
      else
        (if ($u | type) == "string" then .seen[$u] = true else . end)
        | (if ($r.e.timestamp | type) == "string" then .t = $r.e.timestamp else . end)
        | .out += [$r + {t: .t}]
      end)
  | .out;

#: The rows with the first row of each uuid kept, in file order, as an array of {l, e, t}; t is the entry's timestamp or the nearest earlier one (null before any).
def entries: if ._entries then ._entries else _dedupe end;

# Functions that read the rows several times run on a copy carrying them, computed once.
def _memo: if ._entries then . else ._entries = _dedupe end;

#: Rows that s::entries drops because they repeat an earlier uuid: {l, uuid, first}, first being the line kept.
def duplicates:
  reduce .rows[] as $r ({first: {}, out: []};
    ($r.e.uuid // null) as $u
    | if ($u | type) != "string" then .
      elif .first[$u] then .out += [{l: $r.l, uuid: $u, first: .first[$u]}]
      else .first[$u] = $r.l end)
  | .out[];

def _hex_digit: if . < 10 then 48 + . else 87 + . end;

def _control_escape:
  if . == 13 then 92, 114
  elif . < 32 or . == 127 then 92, 117, 48, 48, (. / 16 | floor | _hex_digit), (. % 16 | _hex_digit)
  else . end;

#: One TSV field: "-" for null or "", otherwise the string (other values as JSON) with backslash, TAB, newline and CR written \\, \t, \n and \r, and every other control character and DEL as \u00XX.
def field:
  if . == null or . == "" then "-"
  # split and join, because gsub takes time quadratic in the number of matches
  else (if type == "string" then . else tojson end) | split("\\") | join("\\\\") | split("\t") | join("\\t") | split("\n") | join("\\n")
    | if test("[\\x00-\\x1f\\x7f]") then explode | map(_control_escape) | implode else . end
  end;

#: An array of values as one TSV record (each through s::field).
def tsv: map(field) | join("\t");

#: The string cut to at most $n characters, ending with "…" when cut; $n of 0 (or less) keeps it whole; non-strings pass through.
def trunc($n): if type == "string" and $n > 0 and length > $n then .[:($n - 1)] + "…" else . end;

# jq's global regex functions (gsub, match "g") take time quadratic in the number of matches, so
# long text is cut before any of them runs.

#: Display text: whitespace runs as one space, cut to $width characters (ending with …); $width 0 keeps the text exactly.
def display($width):
  if type != "string" then .
  elif $width > 0 then
    (length > $width * 8) as $long
    | .[:($width * 8)] | gsub("\\s+"; " ") | sub("^ "; "") | sub(" $"; "")
    | if $long and length < $width then . + "…" else trunc($width) end
    | if $long and (endswith("…") | not) then .[:($width - 1)] + "…" else . end
    | sub(" …$"; "…")
  else . end;

#: True when the query text holds no capital letter, so it matches case-insensitively (smart case); backslash escapes of a regex do not count.
def smart_insensitive: gsub("\\\\."; "") | test("\\p{Lu}") | not;

#: The literal text as an Oniguruma regex.
def literal_regex: gsub("(?<c>[.*+?^${}()|\\[\\]\\\\/#-])"; "\\\(.c)");

def _hex4: [(. / 4096 | floor) % 16, (. / 256 | floor) % 16, (. / 16 | floor) % 16, . % 16] | map("0123456789abcdef"[.:(. + 1)]) | join("");

def _rg_char:
  if . == 34 then "\\\\\""
  elif . == 92 then "\\\\\\\\"
  elif . == 10 then "\\\\n"
  elif . == 9 then "\\\\t"
  elif . == 13 then "\\\\r"
  elif . == 8 then "(?:\\\\b|\\\\u0008)"
  elif . == 12 then "(?:\\\\f|\\\\u000c)"
  elif . < 32 then "\\\\u\(_hex4)"
  elif . < 128 then [.] | implode | if test("[.+*?()|\\[\\]{}^$#&~\\\\-]") then "\\" + . else . end
  elif . < 65536 then "(?:\([.] | implode)|(?i:\\\\u\(_hex4)))"
  else (. - 65536) as $c | "(?:\([.] | implode)|(?i:\\\\u\(55296 + ($c / 1024 | floor) | _hex4)\\\\u\(56320 + ($c % 1024) | _hex4)))"
  end;

#: A Rust regex (for rg) that matches the literal text inside a JSON line: quotes, backslashes, control characters and \uXXXX escapes are matched in their encoded forms.
def rg_literal: explode | map(_rg_char) | join("");

#: The rg regex of a cwd equal to the input path or under it, inside a JSON line.
def rg_cwd: if . == "/" then "\"cwd\":\"/" else "\"cwd\":\"" + rg_literal + "(?:/|\")" end;

#: True when the input cwd is $path or lies under it at a path boundary.
def under($path): type == "string" and (. == $path or ($path == "/" and startswith("/")) or startswith($path + "/"));

#: The first match of $re in the input string as {offset, length, string}, else null.
def first_match($re; $ci): if type == "string" then first(match($re; if $ci then "i" else "" end)) // null else null end;

#: Candidate sessions as cc_sessions_by_mtime lists them ("<pos>TAB<mtime>TAB<bytes>TAB<path>" lines) as records {pos, mtime, bytes, path, id}.
def candidates($text):
  $text | split("\n") | map(select(length > 0) | split("\t")
    | {pos: (.[0] | tonumber), mtime: (.[1] | tonumber), bytes: (.[2] | tonumber), path: (.[3:] | join("\t"))}
    | .id = (.path | sub("^.*/"; "") | sub("\\.jsonl$"; "")));

#: A timestamp as YYYY-MM-DDTHH:MM:SSZ (UTC, milliseconds dropped); takes an ISO string or epoch seconds or milliseconds; null stays null.
def ts:
  if type == "number" then (if . > 100000000000 then . / 1000 else . end) | floor | todate
  elif type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}") then .[0:19] + "Z"
  elif type == "string" then .
  else null end;

#: A byte count as 512B, 2.4K, 12K, 3.4M or 1.2G.
def human_size:
  if type != "number" then null
  elif . < 1024 then "\(.)B"
  else
    . as $n
    | [["K", 1024], ["M", 1048576], ["G", 1073741824], ["T", 1099511627776]] as $units
    | ([range(0; $units | length) | select($n >= $units[.][1])] | last) as $i
    | (if ($n / $units[$i][1] | round) >= 1024 and $i < 3 then $i + 1 else $i end) as $j
    | ($n / $units[$j][1]) as $v
    | if $v < 9.95 then ($v * 10 | round) as $t | "\($t / 10 | floor).\($t % 10)\($units[$j][0])"
      else "\($v | round)\($units[$j][0])" end
  end;

#: The handle "L<line>" of a row or record.
def handle: "L\(.l)";

#: The line number in a handle "L<line>", or null.
def line_of: if type == "string" and test("^L[0-9]+$") then .[1:] | tonumber else null end;

def _epoch: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;

def _bound_error($spec):
  error("--since/--until takes a handle (L120), a timestamp (2026-10-30T10:00:04Z, 2026-10-30T10:00Z, 2026-10-30) or an age (90s, 30m, 2h, 7d, 1w), got \($spec | tojson)");

#: A --since/--until value as {line} for a handle, or {from, to} epoch seconds spanning a timestamp's precision or the instant an age before $now; anything else is an error.
def bound($spec; $now):
  if ($spec | type) != "string" then _bound_error($spec)
  elif $spec | test("^L[0-9]+$") then {line: ($spec[1:] | tonumber)}
  elif $spec | test("^[0-9]+[smhdw]$") then
    (($spec[:-1] | tonumber) * ({s: 1, m: 60, h: 3600, d: 86400, w: 604800}[$spec[-1:]])) as $age
    | ($now - $age | floor) as $at | {from: $at, to: $at}
  else
    # fromdateiso8601 rolls an impossible date or time over (2026-02-30 is 2 March), so the time is
    # printed back and must be the one written.
    (try (
      if $spec | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$") then {from: ($spec + "T00:00:00Z" | fromdateiso8601), digits: 10, span: 86399}
      elif $spec | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$") then {from: ($spec[:16] + ":00Z" | fromdateiso8601), digits: 16, span: 59}
      elif $spec | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$") then {from: ($spec | _epoch | floor), digits: 19, span: 0}
      else null end
    ) catch null) as $b
    | if $b and ($b.from | todate)[:$b.digits] == $spec[:$b.digits] then {from: $b.from, to: ($b.from + $b.span)}
      else _bound_error($spec) end
  end;

#: s::bound($spec; now).
def bound($spec): bound($spec; now);

def _time_of:
  (.t // .ts // .e.timestamp // null)
  | if type == "string" then (try (_epoch | floor) catch null) else null end;

#: True when a row or record (.l, and .t, .ts or .e.timestamp) lies inside both bounds from s::bound (null for none), inclusive; time is compared to the second.
def within($since; $until):
  .l as $l | _time_of as $t
  | ($since == null or (if $since | has("line") then $l >= $since.line else $t != null and $t >= $since.from end))
    and ($until == null or (if $until | has("line") then $l <= $until.line else $t != null and $t <= $until.to end));

def _uniq: reduce .[] as $x ([]; if any(.[]; . == $x) then . else . + [$x] end);

def _text:
  if type == "string" then .
  elif type == "array" then map(if .type == "text" then .text elif .type == "image" then "[image]" else empty end) | join("\n")
  else "" end;

def _plain_text:
  if type == "string" then .
  elif type == "array" then map(select(.type == "text") | .text) | join("\n")
  else "" end;

#: A raw message.usage object as {input, cache_creation, cache_read, output}; absent counts are 0. Input: a usage object.
def usage:
  {input: (.input_tokens // 0), cache_creation: (.cache_creation_input_tokens // 0),
   cache_read: (.cache_read_input_tokens // 0), output: (.output_tokens // 0)};

#: API messages in order of first appearance, entries sharing message.id merged across the file: {id, model, synthetic, l, lines, ts, blocks: [{l, block}], usage (the last entry's), context, stop_reason}.
def messages:
  reduce (entries[] | select(.e.type == "assistant")) as $r ({order: [], by: {}};
    ($r.e.message.id // $r.e.uuid // "L\($r.l)") as $id
    | (if .by[$id] then . else .order += [$id] | .by[$id] = {id: $id, model: null, l: $r.l, lines: [], ts: $r.t, blocks: []} end)
    | .by[$id].model //= $r.e.message.model
    | .by[$id].lines += [$r.l]
    | .by[$id].blocks += [$r.e.message.content // [] | if type == "array" then .[] else {type: "text", text: .} end | {l: $r.l, block: .}]
    | .by[$id].last = $r.e.message)
  | .by as $by
  | .order[] | $by[.]
  | (.last.usage // {} | usage) as $u
  | {id, model, synthetic: (.model == "<synthetic>"), l, lines, ts, blocks, usage: $u,
     context: ($u.input + $u.cache_creation + $u.cache_read), stop_reason: .last.stop_reason};

#: Token totals of the transcript's messages: {messages, synthetic, input, cache_creation, cache_read, output, peak_context, peak_l}.
def totals:
  reduce messages as $m ({messages: 0, synthetic: 0, input: 0, cache_creation: 0, cache_read: 0, output: 0, peak_context: 0, peak_l: null};
    .messages += 1
    | .synthetic += (if $m.synthetic then 1 else 0 end)
    | .input += $m.usage.input | .cache_creation += $m.usage.cache_creation
    | .cache_read += $m.usage.cache_read | .output += $m.usage.output
    | if $m.context > .peak_context then .peak_context = $m.context | .peak_l = $m.l else . end);

#: The models of the transcript's messages in first-use order, without <synthetic>.
def models: [messages | select(.synthetic | not) | .model | select(. != null)] | _uniq;

def _version_key: [scan("[0-9]+")][:3] | map(tonumber);

#: True for a Claude Code version from 2.0.50 through 2.1.56: these often wrote a message's last entry before its output was counted, so that its output_tokens are a lower bound. Input: a version string.
def partial_output_version:
  type == "string" and (_version_key as $v | ($v | length) == 3 and $v >= [2, 0, 50] and $v <= [2, 1, 56]);

#: The versions among the transcript's assistant entries that s::partial_output_version names, in first-use order.
def partial_output_versions: [entries[] | select(.e.type == "assistant") | .e.version | select(partial_output_version)] | _uniq;

#: The notice, without a newline, that output tokens are lower bounds for messages written by the versions in the input array (each once, in version order); nothing for an empty array.
def lower_bound_notice:
  map(strings) | unique_by(_version_key)
  | if length == 0 then empty
    else "cc-sessions: output tokens are lower bounds for messages written by Claude Code \(join(", ")): versions 2.0.50 through 2.1.56 often did not record a message's final output count"
    end;

#: True for an internal agent id (acompact-…, aprompt_suggestion-…). Input: an agent id string.
def internal_agent_id: type == "string" and (startswith("acompact-") or startswith("aprompt_suggestion-"));

#: Why an agent transcript is internal: compaction, prompt-suggestion, warmup (first prompt "Warmup") or transcripts-fork (first prompt carries [cc-sessions:transcripts-fork]); null otherwise and for main transcripts.
def internal_reason:
  if .kind == "main" then null
  elif (.agent // "") | startswith("acompact-") then "compaction"
  elif (.agent // "") | startswith("aprompt_suggestion-") then "prompt-suggestion"
  else
    (first(.rows[] | select(.e.type == "user") | .e.message.content | _text) // "") as $first
    | if $first == "Warmup" then "warmup"
      elif $first | contains("[cc-sessions:transcripts-fork]") then "transcripts-fork"
      else null end
  end;

#: True when s::internal_reason is not null.
def is_internal: internal_reason != null;

#: Token totals over an array of transcripts, internal ones skipped and each message.id counted once: {agents, messages, input, cache_creation, cache_read, output}. Input: an array of transcript objects.
def rollup:
  map(select(is_internal | not)) as $kept
  | reduce ($kept[] | messages) as $m ({seen: {}, agents: ($kept | length), messages: 0, input: 0, cache_creation: 0, cache_read: 0, output: 0};
      if .seen[$m.id] then .
      else .seen[$m.id] = true | .messages += 1 | .input += $m.usage.input | .cache_creation += $m.usage.cache_creation
        | .cache_read += $m.usage.cache_read | .output += $m.usage.output end)
  | del(.seen);

#: Text of message content: a string as is; text blocks joined by newlines, each image as [image]. Input: message.content.
def content_text: _text;

def _starts_any($prefixes): . as $text | any($prefixes[]; . as $p | $text | startswith($p));

# A command entry starts with its <command-name> element, which a <command-message> element can
# precede; typed text that only mentions the tag is not one.
def _command_head: "^\\s*(?:<command-message>[\\s\\S]*?</command-message>\\s*)?<command-name>";

def _is_command: test(_command_head);

def _is_slash_command: test(_command_head + "/");

def _is_output: _starts_any(["<local-command-stdout>", "<local-command-stderr>", "<bash-stdout>", "<bash-stderr>"]);

def _local_command(f): .e.type == "system" and .e.subtype == "local_command" and ((.e.content // "") | type == "string" and f);

def _tool_results_only:
  (.message.content | type) == "array" and (.message.content | length) > 0 and all(.message.content[]; .type == "tool_result");

def _user_class($agent; $first):
  .e as $e
  | ($e.message.content | _text) as $text
  | ($e.origin.kind // null) as $origin
  | if $e.isCompactSummary then "summary"
    elif $e | _tool_results_only then "tool-result"
    elif $agent and $first then "from-parent"
    elif $origin == "task-notification" or ($text | _starts_any(["<task-notification>", "<bash-notification>", "<agent-notification>"])) then "notification"
    elif $origin == "peer" or ($text | _starts_any(["Another Claude session sent a message", "<teammate-message", "<agent-message"])) then
      (if $agent and ($text | startswith("<teammate-message")) then "from-parent" else "peer" end)
    elif $text | startswith("[Request interrupted by user") then "interrupt"
    elif $text | _is_output then "output"
    elif $e.isMeta or $e.isVisibleInTranscriptOnly then "injected"
    elif $origin != null and $origin != "human" then "injected"
    elif $text | _starts_any(["[Usage limit", "<local-command-caveat>", "Caveat:"]) then "injected"
    elif ($text | _is_command) and ($text | _is_slash_command | not) then "injected"
    elif $agent then "from-parent"
    else "human" end;

def _human_kind:
  (.e.message.content | _text) as $text
  | if $text | _is_slash_command then "slash"
    elif $text | startswith("<bash-input>") then "bash"
    elif .e.promptSource == "sdk" or .e.promptSource == "system" then "sdk"
    else "prompt" end;

def _user_rows:
  (.kind == "subagent" or .kind == "workflow-agent" or .kind == "flat") as $agent
  | [entries[] | select(.e.type == "user")]
  | to_entries[]
  | .key as $i | .value
  | _user_class($agent; $i == 0) as $class
  | . + {class: $class, kind: (if $class == "human" then _human_kind else null end), text: (.e.message.content | _text)};

#: Every user entry after de-duplication with its class: human (with kind prompt, slash, bash or sdk), tool-result, injected, summary, notification, peer, from-parent, interrupt or output: {l, t, e, class, kind, text}.
def user_entries: if ._users then ._users[] else _user_rows end;

def _memo_users: _memo | if ._users then . else ._users = [_user_rows] end;

#: The transcript carrying its de-duplicated entries and user classes, so that later s:: calls on it compute them once; answers are unchanged.
def memo: _memo_users;

def _slash_name: [capture("<command-name>(?<n>[^<]*)</command-name>")][0].n // null;

def _slash_text:
  _slash_name as $name
  | ([capture("<command-args>(?<a>[\\s\\S]*?)</command-args>")][0].a // "") as $args
  | ($name | if startswith("/") then . else "/" + . end) + (if ($args | length) > 0 then " " + $args else "" end);

def _strip_ansi: gsub("\u001b\\[[0-9;?]*[A-Za-z]"; "");

def _output_text:
  [scan("<(?:local-command|bash)-std(?:out|err)>([\\s\\S]*?)</(?:local-command|bash)-std(?:out|err)>") | .[0] | select(length > 0)]
  | join("\n") | _strip_ansi;

def _record($r; $kind; $text):
  {l: $r.l, kind: $kind, text: $text, ts: $r.t, uuid: ($r.e.uuid // null), also: [], outputs: [], tool: null, tool_use_id: null, decision: null};

def _tool_uses:
  reduce (entries[] | select(.e.type == "assistant") | {l, t} as $at | .e.message.content | arrays | .[] | select(.type == "tool_use") | . + $at) as $u
    ({}; .[$u.id] = $u);

def _result_text: .content | _text;

def _rejected: (_result_text | startswith("The user doesn't want to proceed with this tool use"));

def _feedback: (_result_text | [capture("the user said:\n(?<f>[\\s\\S]*)$")][0].f // "") | sub("\\s+$"; "");

def _answer_text($result):
  if ($result | type) == "object" and ($result.answers | type) == "object" then
    $result.answers | to_entries | map("\(.key) → \(.value | if type == "array" then join(", ") else tostring end)") | join("\n")
  else
    [_result_text | scan("\"([^\"]+)\"=\"([^\"]*)\"") | "\(.[0]) → \(.[1])"] | join("\n")
  end;

def _approved: _result_text | startswith("User has approved");

# Denials and plan approvals are read from the result alone, as their call can sit in an earlier
# session; only a rejection needs its call to be told apart as a plan decision.
def _tool_decisions:
  _tool_uses as $uses
  | entries[] | select(.e.type == "user" and (.e | _tool_results_only)) | . as $r
  | .e.message.content[] | select(.type == "tool_result") | . as $block
  | ($uses[$block.tool_use_id] // null) as $use
  | {tool: ($use.name // null), tool_use_id: $block.tool_use_id} as $call
  | if $block | _approved then
      ($use.input.plan? // $r.e.toolUseResult.plan? // "") as $plan
      | _record($r; "plan"; (if $plan != "" then "approved: \($plan)" else "approved" end)) + $call + {decision: "approved"}
    elif $block | _rejected then
      ($block | _feedback) as $feedback
      | if $use.name == "ExitPlanMode" then
          _record($r; "plan"; (if $feedback != "" then "rejected: \($feedback)" else "rejected" end)) + $call + {decision: "rejected"}
        else _record($r; "denied"; $feedback) + $call end
    elif $use.name == "AskUserQuestion" and ($block.is_error | not) then
      _record($r; "answer"; ($block | _answer_text($r.e.toolUseResult))) + $call
    else empty end;

def _trimmed: sub("^\\s+"; "") | sub("\\s+$"; "");

def _runs_later($slashes): . as $q | ($q.text | _trimmed) as $text | any($slashes[]; .l > $q.l and .text == $text);

# The next queue operation that holds the enqueue's text is a popAll: the text went back to the
# prompt, and what the user then sent is recorded where it appears.
def _withdrawn($ops):
  . as $q | (first($ops[] | select(.l > $q.l and .text == $q.text and (.op == "enqueue" or .op == "popAll"))) | .op == "popAll") // false;

def _attach_outputs($outputs):
  reduce $outputs[] as $o (.;
    (map(select((.kind == "slash" or .kind == "bash") and .l < $o.l)) | last | .l) as $owner
    | if $owner == null then . else map(if .l == $owner then .outputs += [{l: $o.l, text: $o.text}] else . end) end);

#: Output events of slash and ! commands, from user entries and system local_command entries: {l, kind: "output", text, ts, of}, of being the line of the command it belongs to (null if none).
def outputs:
  _memo_users
  | [user_entries] as $users
  | ([ $users[] | select(.class == "human" and (.kind == "slash" or .kind == "bash")) | .l ]
     + [ entries[] | select(_local_command(_is_command)) | .l ] | sort) as $commands
  | [ ($users[] | select(.class == "output") | {l, text, t}),
      (entries[] | select(_local_command(_is_output)) | {l, text: .e.content, t}) ]
  | sort_by(.l)[]
  | . as $o
  | {l, kind: "output", text: (.text | _output_text), ts: .t, of: ($commands | map(select(. < $o.l)) | last)};

#: Human input in file order: {l, kind, text, ts, uuid, also, outputs, tool, tool_use_id, decision}; kind is prompt, slash, bash, sdk, queued, answer, denied or plan; also lists merged duplicate lines; outputs lists a command's outputs as {l, text}.
def human_inputs:
  _memo_users
  | . as $t
  | [user_entries] as $users
  | ([$users[] | .e.message.content | _plain_text]) as $user_texts
  | ($users | map(select(.class == "human"))) as $human
  | ($users | map(select((.e.isMeta or .e.isCompactSummary or .e.isVisibleInTranscriptOnly) | not))) as $visible
  | ([$human[] | select(.kind == "slash") | {l, text: (.text | _slash_text)}]
     + [$t | entries[] | select(_local_command(_is_command)) | {l, text: (.e.content | _slash_text)}]) as $slashes
  | [
      ( $human[] | . as $u
        | if .kind == "slash" then _record($u; "slash"; (.text | _slash_text))
            + {also: [$visible | map(select(.l < $u.l)) | last | select(. != null and .kind == "prompt" and (.text | test("^/")) and ((.text | capture("^/(?<n>[^\\s]+)").n) == ($u.text | _slash_name | ltrimstr("/")))) | .l]}
          elif .kind == "bash" then _record($u; "bash"; ([.text | capture("<bash-input>(?<c>[\\s\\S]*?)</bash-input>")][0].c // .text))
          else _record($u; .kind; .text) end ),
      ( $t | entries[] | select(_local_command(_is_command)) | _record(.; "slash"; (.e.content | _slash_text)) ),
      ( $t | entries[] | select(.e.type == "attachment" and .e.attachment.type == "queued_command" and .e.attachment.commandMode == "prompt"
            and ((.e.attachment.origin.kind // "human") == "human"))
        | (.e.attachment.prompt | _plain_text) as $plain
        | select(($plain | startswith("<agent-message") | not) and ($user_texts | index([$plain]) | not)
            and ({l, text: $plain} | _runs_later($slashes) | not))
        | _record(.; "queued"; (.e.attachment.prompt | _text)) ),
      ( $t | ([entries[] | select(.e.type == "attachment" and .e.attachment.type == "queued_command") | .e.attachment.prompt | _plain_text]) as $queued
        | [entries[] | select(.e.type == "queue-operation") | {l, op: .e.operation, text: .e.content}] as $ops
        | entries[] | select(.e.type == "queue-operation" and .e.operation == "enqueue" and (.e.content | type) == "string")
        | .e.content as $text
        | select(($text | test("\\S")) and ($text | startswith("<") | not) and ((try ($text | fromjson | type) catch "text") | IN("object", "array") | not)
            and ($user_texts | index([$text]) | not) and ($queued | index([$text]) | not)
            and ({l, text: $text} | (_runs_later($slashes) or _withdrawn($ops)) | not))
        | _record(.; "queued"; $text) ),
      ( $t | _tool_decisions )
    ]
  | (map(.also[]) ) as $merged
  | map(select(.l as $l | $merged | index([$l]) | not))
  | sort_by(.l)
  | _attach_outputs([$t | outputs])
  | .[];

#: The first human input the user typed or queued (kind prompt, slash, bash, sdk or queued), not an answer, denial or plan decision; null if none.
def first_input: first(human_inputs | select(.kind | IN("prompt", "slash", "bash", "sdk", "queued"))) // null;

#: Interrupt events ([Request interrupted by user…]): {l, kind: "interrupt", text, ts, uuid, interrupted}, interrupted being the interrupted message id when recorded.
def interrupts:
  _memo_users | user_entries | select(.class == "interrupt")
  | {l, kind: "interrupt", text, ts: .t, uuid: (.e.uuid // null), interrupted: (.e.interruptedMessageId // null)};

#: s::human_inputs and s::interrupts together in file order.
def human_events: _memo_users | [human_inputs, interrupts] | sort_by(.l) | .[];

def _tool_results:
  reduce (entries[] | select(.e.type == "user" and (.e | _tool_results_only)) | . as $r
      | .e.message.content[] | select(.type == "tool_result") | {id: .tool_use_id, l: $r.l, block: ., result: ($r.e.toolUseResult // null)}) as $x
    ({}; .[$x.id] = {l: $x.l, block: $x.block, result: $x.result});

def _skill_dir_name: [capture("^Base directory for this skill: (?<d>[^\n]*)")][0].d // "" | sub("/+$"; "") | split("/") | last;

def _skill_event($r; $event; $name; $how): {l: $r.l, event: $event, name: $name, how: $how, ts: $r.t, tool_use_id: null, result_l: null, body_l: null};

#: Skill events in file order: {l, event, name, how, ts, tool_use_id, result_l, body_l}; event is load, failed, re-invoked or restore; how is tool, skill, bundled or orphan (null for restores).
def skill_events:
  _memo_users
  | . as $t
  | [user_entries] as $users
  | _tool_uses as $uses
  | _tool_results as $results
  | ([$uses[] | select(.name == "Skill") | .id]) as $skill_calls
  | ($users | map(select(.e.isMeta and (.e.sourceToolUseID | type) == "string")) | INDEX(.e.sourceToolUseID)) as $tool_bodies
  | [ range(0; $users | length) as $i | $users[$i] as $u
      | select((($u.class == "human" and $u.kind == "slash") or ($u.text | test("<command-name>[^/<][^<]*</command-name>[\\s\\S]*<skill-format>"))))
      | $users[$i + 1] as $next
      | select($next != null and $next.e.isMeta and (($next.e.sourceToolUseID // null) == null)
          and ($next.text | startswith("<local-command-caveat>") | not))
      | {trigger: $u, body: $next} ] as $slash
  | ([$slash[].body.l] + [$skill_calls[] as $id | $tool_bodies[$id].l // empty]) as $claimed
  | [
      ( $uses[] | select(.name == "Skill") | . as $use
        | $results[$use.id] as $res
        | $tool_bodies[$use.id] as $body
        | _skill_event($use; "load"; ($use.input.skill // $use.input.command // null); "tool")
          + {tool_use_id: $use.id, result_l: ($res.l // null), body_l: ($body.l // null)}
        | if $res == null or $res.block.is_error == true or ($res.block | _result_text | startswith("Launching skill:") | not) then
            .event = "failed" | .body_l = null
          elif $body != null and ($body.text | test("^Skill /\\S+ was loaded earlier")) then .event = "re-invoked"
          else . end ),
      ( $slash[] | _skill_event(.trigger; "load"; (.trigger.text | _slash_name | ltrimstr("/"));
            (if .body.text | startswith("Base directory for this skill:") then "skill" else "bundled" end))
          + {body_l: .body.l} ),
      ( $users[] | select(.e.isMeta and (.text | startswith("Base directory for this skill:")) and (.l as $l | $claimed | index([$l]) | not))
        | _skill_event(.; "load"; (.text | _skill_dir_name); "orphan") + {body_l: .l} ),
      ( $t | entries[] | select(.e.type == "attachment" and .e.attachment.type == "invoked_skills") | . as $r
        | .e.attachment.skills[]? | _skill_event($r; "restore"; .name; null) )
    ]
  | sort_by(.l) | .[];

#: The skill load events of s::skill_events.
def skill_loads: skill_events | select(.event == "load");

#: Assistant entries carrying attributionSkill, the skill active while they were written (never a load): {l, skill}.
def attributions: entries[] | select(.e.type == "assistant" and (.e.attributionSkill | type) == "string") | {l, skill: .e.attributionSkill};

#: True when the input skill name and $q name the same skill: bare and namespaced names match by their last segment. Input: a skill name.
def skill_match($q): (tostring | split(":") | last) == ($q | tostring | split(":") | last);

#: The persisted-output marker of a tool result, parsed only when the text starts with it: {stated_size, stated_path, preview_size}, else null. Input: a result text.
def persisted_marker:
  if type == "string" and startswith("<persisted-output>\nOutput too large (") then
    [capture("^<persisted-output>\nOutput too large \\((?<size>[0-9.]+(?:B|KB|MB))\\)\\. Full output saved to: (?<path>[^\n]+)\n\nPreview \\(first (?<preview>[0-9.]+(?:B|KB|MB))\\):\n")][0]
    | if . then {stated_size: .size, stated_path: .path, preview_size: .preview} else null end
  else null end;

def _persisted($t):
  persisted_marker as $m
  | if $m == null then null
    else
      (if $t.session_dir then "\($t.session_dir)/tool-results/\($m.stated_path | split("/") | last)" else null end) as $fallback
      | (if $t.sizes[$m.stated_path] != null then $m.stated_path
         elif $fallback != null and $t.sizes[$fallback] != null then $fallback
         else null end) as $path
      | $m + {path: $path, bytes: (if $path then $t.sizes[$path] else null end)}
    end;

#: Tool calls paired with their results, in file order: {l, id, name, input, wire_input, message_id, ts, result_l, text, chars, is_error, status (ok, error, denied, none), feedback, persisted, result}; text shows each image as [image], chars counts the text blocks only; persisted is {stated_size, stated_path, preview_size, path, bytes}, path and bytes from the saved file (null when it is missing); result is toolUseResult.
def tool_calls:
  _memo
  | . as $t
  | _tool_results as $results
  | entries[] | select(.e.type == "assistant") | . as $r
  | .e.message.content | arrays | .[] | select(.type == "tool_use") | . as $use
  | $results[$use.id] as $res
  | (if $res then $res.block | _result_text else null end) as $text
  | ($res != null and ($res.block | _rejected)) as $rejected
  | {
      l: $r.l, id: $use.id, name: $use.name, input: $use.input,
      wire_input: ($r.e.wireToolInputs[$use.id]? // null), message_id: ($r.e.message.id // null), ts: $r.t,
      result_l: ($res.l // null), text: $text, chars: (if $res then $res.block.content | _plain_text | length else null end),
      is_error: (if $res and ($res.block | has("is_error")) then $res.block.is_error else null end),
      status: (if $res == null then "none" elif $rejected then "denied" elif $res.block.is_error == true then "error" else "ok" end),
      feedback: (if $rejected then ($res.block | _feedback | if . == "" then null else . end) else null end),
      persisted: (if $text then $text | _persisted($t) else null end),
      result: ($res.result // null)
    };

#: Every content kind search can match, default kinds first.
def content_kinds:
  ["prompt", "assistant", "tool-input", "tool-result", "from-parent", "agent-result", "plan", "file", "hook", "recap",
   "thinking", "injected", "summary", "notification", "peer"];

#: The content kinds searched by default.
def default_kinds: content_kinds[:10];

def _strings: [.. | strings];

def _attachment_content:
  (.type // "") as $type
  | if $type == "structured_output" then {kind: "agent-result", text: (.data | if type == "string" then . else tojson end)}
    elif $type == "plan_file_reference" then {kind: "plan", text: (.planContent // "")}
    elif $type == "file" then {kind: "file", text: ([.content.file.content?, (.content | strings)] | map(strings) | join("\n"))}
    elif $type == "edited_text_file" then {kind: "file", text: ([.snippet, .content] | map(strings) | join("\n"))}
    elif $type == "queued_command" and .commandMode == "task-notification" then {kind: "notification", text: (.prompt | _text)}
    elif ($type | startswith("hook_")) or $type == "async_hook_response" then
      {kind: "hook", text: ([.stdout, .content, .stderr] | map(strings | select(length > 0)) | _uniq | join("\n"))}
    else empty end;

#: Searchable content in file order, one record per piece: {l, kind, text, ts}; kinds as in s::content_kinds. Everything else (api-request*, progress, queue-operation, titles, state markers, other attachments) is never content.
def content:
  _memo_users
  | . as $t
  | [
      (human_inputs | {l, kind: "prompt", text, ts}),
      (user_entries | select(.class | IN("from-parent", "injected", "summary", "notification", "peer")) | {l, kind: .class, text, ts: .t}),
      (user_entries | select(.class == "tool-result") | . as $u
        | .e.message.content[] | select(.type == "tool_result") | {l: $u.l, kind: "tool-result", text: _result_text, ts: $u.t}),
      (entries[] | select(.e.type == "assistant") | . as $r | .e.message.content | arrays | .[]
        | if .type == "text" and ((.text // "") | length) > 0 then {l: $r.l, kind: "assistant", text, ts: $r.t}
          elif .type == "thinking" and ((.thinking // "") | length) > 0 then {l: $r.l, kind: "thinking", text: .thinking, ts: $r.t}
          elif .type == "tool_use" then
            {l: $r.l, kind: "tool-input", ts: $r.t,
             text: ((.input | _strings) + ($r.e.wireToolInputs[.id]? // null | _strings) | _uniq | join("\n"))}
          else empty end),
      (entries[] | select(.e.type == "attachment") | . as $r
        | .e.attachment | _attachment_content | select(.text != "") | {l: $r.l, kind, text, ts: $r.t}),
      (entries[] | select(.e.type == "system" and .e.subtype == "away_summary") | {l, kind: "recap", text: (.e.content // ""), ts: .t}),
      (if $t.kind == "journal" then
         entries[] | select(.e.type == "result") | {l, kind: "agent-result", text: (.e.result | if type == "string" then . else tojson end), ts: .t}
       else empty end)
    ]
  | sort_by(.l) | .[];

#: s::content restricted to the kinds in the array $kinds.
def content($kinds): content | select(.kind as $k | $kinds | any(.[]; . == $k));

#: Entry types that are content or known state (titles, mode markers, request copies, journal records, ...).
def known_entry_types:
  ["user", "assistant", "attachment", "system", "summary", "ai-title", "custom-title", "agent-name", "last-prompt",
   "permission-mode", "mode", "atis-latch", "api-request", "api-request-blob", "api-request-shape", "cost-state",
   "queue-operation", "progress", "relocated", "fork-context-ref", "pr-link", "tools-used", "file-history-snapshot",
   "file-history-delta", "worktree-state", "agent-setting", "bridge-session", "launched", "started", "result"];

#: Attachment types that are content or known state; any hook_* type is also known (as content).
def known_attachment_types:
  ["queued_command", "structured_output", "plan_file_reference", "file", "edited_text_file", "async_hook_response",
   "skill_listing", "invoked_skills", "instructions", "nested_memory", "deferred_tools_delta", "deferred_tools_record",
   "agent_listing_delta", "mcp_instructions_delta", "command_permissions", "budget_usd", "total_tokens_reminder",
   "task_reminder", "batching_reminder_sent", "bash_output_audience_note", "silent_turn_reminder", "date", "date_change",
   "model", "environment", "session_context", "auto_mode", "auto_mode_exit", "plan_mode", "plan_mode_exit",
   "plan_mode_reentry", "ultra_effort_enter", "ultra_effort_exit", "credential_org", "remote_session_change",
   "workflow_keyword_request", "compact_file_reference", "read_truncation_notice", "thinking_drop", "output_style",
   "max_turns_reached", "team_context", "agent_mention", "diagnostics", "prompt_snapshot"];

#: System subtypes that are content or known state; any model_*_fallback subtype is also known.
def known_system_subtypes:
  ["compact_boundary", "microcompact_boundary", "local_command", "informational", "away_summary", "stop_hook_summary",
   "turn_duration", "api_error", "scheduled_task_fire", "agents_killed"];

#: Attachment types that can hold content (any hook_* type too); every other attachment type is state.
def content_attachment_types: ["queued_command", "structured_output", "plan_file_reference", "file", "edited_text_file", "async_hook_response"];

#: System subtypes that can hold content; every other subtype is state.
def content_system_subtypes: ["local_command", "away_summary"];

#: An entry's type label: its type, or attachment:<type> / system:<subtype>. Input: an entry.
def entry_type:
  (.type // "?") as $type
  | if $type == "attachment" then "attachment:\(.attachment.type // "?")"
    elif $type == "system" then "system:\(.subtype // "?")"
    else $type end;

#: True when a type label from s::entry_type is in the content or state lists. Input: a label.
def is_known_type:
  . as $label
  | if startswith("attachment:") then .[11:] as $a | ($a | startswith("hook_")) or any(known_attachment_types[]; . == $a)
    elif startswith("system:") then .[7:] as $s | ($s | test("^model_.*_fallback$")) or any(known_system_subtypes[]; . == $s)
    else any(known_entry_types[]; . == $label) end;

#: Type labels in the transcript that no rule knows: {type, l (first line), count}.
def unknown_types:
  [entries[] | {l, type: (.e | entry_type)} | select(.type | is_known_type | not)]
  | group_by(.type) | map({type: .[0].type, l: (map(.l) | min), count: length}) | sort_by(.l) | .[];

def _tag($name): [capture("<\($name)>(?<v>[\\s\\S]*?)</\($name)>")][0].v // null;

def _object: if type == "object" then . else {} end;

def _queued_notification: .e.type == "attachment" and .e.attachment.type == "queued_command" and .e.attachment.commandMode == "task-notification";

#: Background completions (<task-notification> user entries, or queued_command attachments of commandMode task-notification): {l, tool_use_id, task_id, status, summary, result, output_file, ts, text}; output_file paths are ephemeral and never followed.
def notifications:
  _memo_users
  | [ (user_entries | select(.class == "notification") | {l, t, text}),
      (entries[] | select(_queued_notification) | {l, t, text: (.e.attachment.prompt | _text)}) ]
  | sort_by(.l)[] | .text as $x
  | {l, tool_use_id: ($x | _tag("tool-use-id")), task_id: ($x | _tag("task-id")), status: ($x | _tag("status")),
     summary: ($x | _tag("summary")), result: ($x | _tag("result")), output_file: ($x | _tag("output-file")), ts: .t, text: $x};

def _completion_blocks:
  [scan("<(?:task|agent)-notification>[\\s\\S]*?</(?:task|agent)-notification>")] as $blocks
  | if ($blocks | length) > 0 then $blocks[] else . end;

def _notification_enqueue:
  .e.type == "queue-operation" and .e.operation == "enqueue" and (.e.content | type) == "string"
  and (.e.content | test("^\\s*<(?:task|agent)-notification>"));

#: Background completions, one per <task-notification> or <agent-notification> block (2.0.x names the agent of the latter by <agent-id>, read as task_id): those of notification user entries and queued_command attachments in file order, then those that exist only as a queue-operation enqueue: {l, tool_use_id, task_id, status, summary, result, ts}.
def completions:
  _memo_users
  | ([ (user_entries | select(.class == "notification") | {l, t, text}),
       (entries[] | select(_queued_notification) | {l, t, text: (.e.attachment.prompt | _text)}) ] | sort_by(.l)) as $handed
  | ($handed | map(.text)) as $handed_texts
  | $handed + [entries[] | select(_notification_enqueue and (.e.content as $c | $handed_texts | index([$c]) | not)) | {l, t, text: .e.content}]
  | .[] | . as $r | .text | _completion_blocks
  | {l: $r.l, tool_use_id: _tag("tool-use-id"), task_id: (_tag("task-id") // _tag("agent-id")), status: _tag("status"),
     summary: _tag("summary"), result: _tag("result"), ts: $r.t};

# A completion without a tool-use id names its task or agent, which a resumed agent shares with every
# call that resumes it: only a completion after the call can be its own.
def _completion_for($notes; $call; $key):
  first($notes[] | select(.tool_use_id == $call.id))
  // (if $key then first($notes[] | select(.tool_use_id == null and .task_id == $key and .l > $call.l)) else null end)
  // null;

#: Agent and Task calls: {l, id, tool, description, subagent_type, name, prompt, background, agent_id, team_name, teammate_name, status, interrupted, reported_output, result_l, ts, notification}; agent_id comes from toolUseResult.agentId or agent_id, else the result text; team_name and teammate_name are a spawned teammate's; interrupted is true when the user interrupted the call; reported_output is the output_tokens that a finished call's result reports, which are those of the agent's final message; notification is the s::completions record with the call's tool-use id, else the first after the call with its agent id.
def agent_calls:
  _memo_users
  | [completions] as $notes
  | tool_calls | select(.name == "Agent" or .name == "Task") | . as $call
  | (.result | _object) as $r
  | ($r.agentId // $r.agent_id // ([(.text // "") | capture("agent_?[iI]d: (?<id>[A-Za-z0-9_-]+)")][0].id) // null) as $agent
  | {l, id, tool: .name, description: .input.description, subagent_type: .input.subagent_type, name: .input.name,
     prompt: .input.prompt, background: (.input.run_in_background | . == true or . == "true"), agent_id: $agent,
     team_name: ($r.team_name // null), teammate_name: (if $r.team_name then $r.name // .input.name else null end),
     status: ($r.status // .status), interrupted: ((.text // "") | startswith("[Request interrupted by user")),
     reported_output: (if $r.status == "completed" then $r.usage.output_tokens? // null else null end),
     result_l, ts, notification: _completion_for($notes; $call; $agent)};

#: Workflow calls: {l, id, name, run_id, task_id, transcript_dir, script_path, status, result_l, ts, notification}; stored paths are hints (find the run with cc_run_dir); notification is the s::completions record with the call's tool-use id, else the first after the call with its task id.
def workflow_calls:
  _memo_users
  | [completions] as $notes
  | tool_calls | select(.name == "Workflow") | . as $call
  | (.result | _object) as $r
  | (.text // "") as $text
  | ($r.runId // ([$text | capture("Run ID: (?<v>wf_[A-Za-z0-9_-]+)")][0].v) // null) as $run
  | ($r.taskId // ([$text | capture("Task ID: (?<v>[A-Za-z0-9_-]+)")][0].v) // null) as $task
  | {l, id, name: ($r.workflowName // .input.name // null), run_id: $run, task_id: $task,
     transcript_dir: ($r.transcriptDir // ([$text | capture("Transcript dir: (?<v>[^\n]+)")][0].v) // null),
     script_path: ($r.scriptPath // ([$text | capture("Script file: (?<v>[^\n]+)")][0].v) // null),
     status: ($r.status // .status), result_l, ts, notification: _completion_for($notes; $call; $task)};

#: A status word as completed, failed, killed, running or denied: completed and success; failed and error; killed, cancelled, canceled and stopped; running; denied; null for anything else.
def lifecycle_word:
  if type != "string" then null
  else ascii_downcase
    | if . == "completed" or . == "success" then "completed"
      elif . == "failed" or . == "error" then "failed"
      elif . == "killed" or . == "cancelled" or . == "canceled" or . == "stopped" then "killed"
      elif . == "running" or . == "denied" then .
      else null end
  end;

#: The status of the agent or workflow run that a call started, the first that applies: $run_status (its run record's status), the call's notification, the call's own outcome (killed when the user interrupted it, else its result's status: completed for a finished call, failed for an error, denied for a rejection), $end (s::end_status of the agent's transcript), else unknown. Input: a record of s::agent_calls or s::workflow_calls, or null when no call started it.
def lifecycle_status($run_status; $end):
  [($run_status | lifecycle_word), (.notification.status? | lifecycle_word),
   (if . == null then null elif .interrupted == true then "killed" else .status | lifecycle_word end), ($end | lifecycle_word)]
  | map(select(. != null)) | first // "unknown";

#: How a transcript ended: completed when its last user or assistant entry is an assistant message that stopped (end_turn or stop_sequence; before 2.1.300, when stop_reason is often null on every entry, also no stop_reason and no tool call), failed on an API error message, else null.
def end_status:
  ([entries[] | select(.e.type == "user" or .e.type == "assistant")] | last) as $last
  | ($last.e.message.stop_reason? // null) as $stop
  | if $last == null or $last.e.type != "assistant" then null
    elif $last.e.isApiErrorMessage == true then "failed"
    elif $stop == "end_turn" or $stop == "stop_sequence" then "completed"
    elif $stop == null and ([$last.e.message.content | arrays | .[] | select(.type == "tool_use")] | length) == 0 then "completed"
    else null end;

#: Fork agents launched from this transcript (system entries with launchedAgentId): {l, agent_id, ts}.
def fork_launches: entries[] | select(.e.type == "system" and (.e.launchedAgentId | type) == "string") | {l, agent_id: .e.launchedAgentId, ts: .t};

#: A fork agent's fork-context-ref line: {l, parent_session, parent_last_uuid}, else null.
def fork_ref:
  first(.rows[] | select(.e.type == "fork-context-ref") | {l, parent_session: .e.parentSessionId, parent_last_uuid: .e.parentLastUuid}) // null;

#: Each agent of a workflow run's journal.jsonl: {agent_id, key, label, phase, started_l, result_l, result}. Input: the journal's transcript object.
def journal:
  [entries[] | select(.e.type == "started" or .e.type == "result")] as $rows
  | ($rows | map(.e.agentId | strings) | _uniq)[] as $agent
  | (first($rows[] | select(.e.agentId == $agent and .e.type == "started")) // null) as $s
  | ([$rows[] | select(.e.agentId == $agent and .e.type == "result")] | last) as $r
  | {agent_id: $agent, key: ($s.e.key // $r.e.key // null), label: ($s.e.label // null), phase: ($s.e.phase // null),
     started_l: ($s.l // null), result_l: ($r.l // null), result: ($r.e.result // null)};

#: A teammate's team and name, {team, name}: its meta's teamName and name, else the teamName and agentName that its user and assistant entries carry (a split-pane teammate's own session); null otherwise.
def teammate:
  if (.meta.teamName? | type) == "string" and (.meta.name? | type) == "string" then {team: .meta.teamName, name: .meta.name}
  else
    first(entries[] | .e | select((.type == "user" or .type == "assistant") and (.teamName | type) == "string" and (.agentName | type) == "string")
      | {team: .teamName, name: .agentName}) // null
  end;

#: An agent transcript's kind, the first that applies: internal, teammate (meta taskKind names a teammate, or a split-pane teammate's own session), fork (meta isFork or a fork-context-ref), flat, workflow-agent, agent; null for other transcripts.
def agent_kind:
  if .kind == "main" then (if teammate != null then "teammate" else null end)
  elif (.kind | IN("subagent", "workflow-agent", "flat")) | not then null
  elif is_internal then "internal"
  elif (.meta.taskKind? // "") | tostring | test("teammate") then "teammate"
  elif .meta.isFork? == true or fork_ref != null then "fork"
  elif .kind == "flat" then "flat"
  elif .kind == "workflow-agent" then "workflow-agent"
  else "agent" end;

#: An agent transcript's delegation prompt (its first from-parent entry): {l, text, ts}, else null.
def delegation: first(user_entries | select(.class == "from-parent") | {l, text, ts: .t}) // null;

#: An agent transcript's result: the last structured_output (data, and text as JSON), else the last assistant text: {l, text, data, ts}, else null.
def agent_result:
  ([entries[] | select(.e.type == "attachment" and .e.attachment.type == "structured_output")] | last) as $so
  | if $so then {l: $so.l, text: ($so.e.attachment.data | if type == "string" then . else tojson end), data: $so.e.attachment.data, ts: $so.t}
    else [entries[] | select(.e.type == "assistant") | . as $r | .e.message.content | arrays | .[]
          | select(.type == "text" and ((.text // "") | length) > 0) | {l: $r.l, text, data: null, ts: $r.t}] | last
    end;

#: The record in $calls (from s::agent_calls) that started this agent transcript: by agent id, by the meta's toolUseId, by a teammate's team and name (s::teammate), else by delegation prompt text; null if none.
def matching_call($calls):
  . as $t
  | (delegation.text // null) as $prompt
  | (if any($calls[]; .team_name != null) then teammate else null end) as $teammate
  | first(
      ($calls[] | select($t.agent != null and .agent_id == $t.agent)),
      ($calls[] | select(($t.meta.toolUseId? // null) != null and .id == $t.meta.toolUseId)),
      ($calls[] | select($teammate != null and .team_name == $teammate.team and .teammate_name == $teammate.name)),
      ($calls[] | select($prompt != null and .prompt == $prompt))
    ) // null;

def _last_entry(f): [entries[] | select(f)] | last;

#: An agent transcript's label: {text, source, l}: its meta description or name (source meta), else $journal_label (journal), else its delegation prompt (prompt); null if none.
def agent_label($journal_label):
  _memo_users
  | if (.meta.description? // "") != "" then {text: .meta.description, source: "meta", l: null}
  elif (.meta.name? // "") != "" then {text: .meta.name, source: "meta", l: null}
  elif ($journal_label // "") != "" then {text: $journal_label, source: "journal", l: null}
  else delegation | if . then {text, source: "prompt", l} else null end
  end;

#: The label {text, source, l}: for a session the last custom-title, else the last ai-title containing a space, else agent-name, else a legacy summary, else s::first_input (source prompt; untruncated); for an agent s::agent_label(null).
def label_of:
  _memo_users
  | if .kind == "subagent" or .kind == "workflow-agent" or .kind == "flat" then agent_label(null)
  else
    _last_entry(.e.type == "custom-title" and ((.e.customTitle // "") | length) > 0) as $custom
    | _last_entry(.e.type == "ai-title" and ((.e.aiTitle // "") | test(" "))) as $ai
    | _last_entry(.e.type == "agent-name" and ((.e.agentName // "") | length) > 0) as $name
    | _last_entry(.e.type == "summary" and ((.e.summary // "") | length) > 0) as $summary
    | if $custom then {text: $custom.e.customTitle, source: "custom-title", l: $custom.l}
      elif $ai then {text: $ai.e.aiTitle, source: "ai-title", l: $ai.l}
      elif $name then {text: $name.e.agentName, source: "agent-name", l: $name.l}
      elif $summary then {text: $summary.e.summary, source: "summary", l: $summary.l}
      else first_input | if . then {text, source: "prompt", l} else null end
      end
  end;

#: Where the session came from: sdk when an entrypoint starts with sdk or a prompt's promptSource is sdk, else the first entrypoint, else cli.
def origin:
  [entries[] | .e.entrypoint | strings] as $entrypoints
  | if any($entrypoints[]; startswith("sdk")) or any(entries[]; .e.type == "user" and .e.promptSource == "sdk") then "sdk"
    elif ($entrypoints | length) > 0 then $entrypoints[0]
    else "cli" end;

#: True when the transcript has no user or assistant entry (listings leave stubs out).
def is_stub: any(entries[]; .e.type == "user" or .e.type == "assistant") | not;

#: The distinct cwd values in first-use order.
def cwds: [entries[] | .e.cwd | strings] | _uniq;

#: The first cwd value in file order (line 1 often has none), else null.
def first_cwd: first(entries[] | .e.cwd | strings) // null;

#: The distinct sessionId values in first-use order (a resumed copy holds two).
def session_ids: [entries[] | .e.sessionId | strings] | _uniq;

#: The distinct Claude Code versions in first-use order.
def versions: [entries[] | .e.version | strings] | _uniq;

#: The earliest and latest timestamps, whatever the file order: {first, last}.
def span: [entries[] | .e.timestamp | strings] | {first: min, last: max};

#: Compact boundaries: {l, trigger, pre_tokens, post_tokens, dropped, duration_ms, summary_l, logical_parent, ts}; summary_l is the compaction summary entry that follows.
def compactions:
  [entries[]] as $rows
  | range(0; $rows | length) as $i
  | $rows[$i] | select(.e.type == "system" and .e.subtype == "compact_boundary")
  | (first($rows[($i + 1):][] | select((.e.type == "system" and .e.subtype == "compact_boundary") or (.e.type == "user" and .e.isCompactSummary)))
     | select(.e.type == "user")) as $summary
  | .e.compactMetadata as $m
  | {l, trigger: $m.trigger, pre_tokens: $m.preTokens, post_tokens: $m.postTokens, dropped: $m.cumulativeDroppedTokens,
     duration_ms: $m.durationMs, summary_l: ($summary.l // null), logical_parent: (.e.logicalParentUuid // null), ts: .t};

#: Rows matching $ref: a handle L<line> (any line, repeats included), a uuid, a toolu_… id (the assistant entry of the call and the user entry of its result; copies in request entries are neither) or a message id.
def lookup($ref):
  if $ref | test("^L[0-9]+$") then ($ref | line_of) as $n | .rows[] | select(.l == $n)
  elif $ref | startswith("toolu_") then
    entries[]
    | select((.e.type == "assistant" and any(.e.message.content? | arrays | .[]; .type == "tool_use" and .id == $ref))
        or (.e.type == "user" and any(.e.message.content? | arrays | .[]; .type == "tool_result" and .tool_use_id == $ref)))
  else entries[] | select(.e.uuid == $ref or .e.message.id? == $ref) end;

#: The rows above $row, nearest first, following parentUuid (or logicalParentUuid where parentUuid is null, as after a compaction).
def ancestors($row):
  (reduce entries[] as $r ({}; if ($r.e.uuid | type) == "string" then .[$r.e.uuid] = $r else . end)) as $by
  | [limit(100000; $row | recurse((.e.parentUuid // .e.logicalParentUuid // null) as $p | if $p then $by[$p] // empty else empty end))]
  | .[1:][];

#: The rows whose parentUuid is $uuid.
def children($uuid): entries[] | select(.e.parentUuid == $uuid);

#: API errors: assistant entries marked isApiErrorMessage and system api_error entries: {l, status, text, ts}.
def api_errors:
  entries[]
  | select((.e.type == "assistant" and .e.isApiErrorMessage == true) or (.e.type == "system" and .e.subtype == "api_error"))
  | {l, status: (.e.apiErrorStatus // .e.error.status? // null),
     text: (if .e.type == "assistant" then .e.message.content | _text else (.e.content // .e.error // "" | if type == "string" then . else tojson end) end),
     ts: .t};

#: The JSON object of a one-line JSON file, such as a workflow run record (workflows/<run-id>.json) or an agent's .meta.json; null otherwise.
def document: if (.rows | length) == 1 then .rows[0].e else null end;

#: cost-state entries, each covering one process run: {l, total_cost_usd, models (modelUsage by model), duration_ms, start_time}.
def cost_states:
  entries[] | select(.e.type == "cost-state")
  | {l, total_cost_usd: (.e.totalCostUSD // null), models: (.e.modelUsage // {}), duration_ms: (.e.totalDuration // null), start_time: (.e.startTime // null)};
