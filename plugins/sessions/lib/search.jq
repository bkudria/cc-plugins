import "sessions" as s;
import "render" as r;

# Text found by rg is confirmed here on decoded content: rg reads JSON lines, where quotes, backslashes
# and control characters are escaped, so its patterns are only a permissive first pass.

def _literal_char: if . == "n" then "\n" elif . == "t" then "\t" elif . == "r" then "\r" elif . == "f" then "\f" else null end;

def _put($part): .parts += [$part];
def _lit($c): if (.parts | length) > 0 and .parts[-1].lit then .parts[-1].lit += $c else _put({lit: $c}) end;
def _one: _put({chars: 1});
def _any: _put({any: true});
def _optional_last:
  if (.parts | length) > 0 and .parts[-1].lit then
    (if (.parts[-1].lit | length) > 1 then .parts[-1].lit |= .[:-1] else .parts |= .[:-1] end)
  elif (.parts | length) > 0 then .parts |= .[:-1]
  else . end
  | _any;
def _end_alternative: .alts += [.parts] | .parts = [];

#: What a match of the regex is made of, per top-level alternative: an array of parts in order, each {lit: text}, {chars: 1} (one character of any kind) or {any: true} (anything, maybe nothing); null when the regex uses escapes this cannot read.
def regex_parts:
  [explode[] | [.] | implode]
  # In a bracket expression only a POSIX class ([:alpha:]) holds brackets of its own; any other [ is a
  # literal, as jq's regex syntax has no nested classes. Right after the opening bracket (fresh), a ] is
  # a literal and a first ^ negates.
  | reduce .[] as $c ({alts: [], parts: [], esc: false, class: 0, fresh: false, negated: false, open: false, posix: false, colon: false,
                       depth: 0, brace: false, fail: false};
      if .fail then .
      elif .brace then (if $c == "}" then .brace = false else . end)
      elif .esc then
        .esc = false
        | if .class > 0 then .fresh = false | .open = false
          elif .depth > 0 then .
          elif ($c | _literal_char) then _lit($c | _literal_char)
          elif $c | test("^[dDwWsShHN]$") then _one
          elif $c | test("^[bBAzZG]$") then _any
          elif $c | test("^[A-Za-z0-9]$") then .fail = true
          else _lit($c) end
      elif .posix then (if .colon and $c == "]" then .posix = false else . end) | .colon = ($c == ":")
      elif $c == "\\" then .esc = true
      elif .class > 0 then
        .open as $open
        | .open = false
        | if $open and $c == ":" then .posix = true | .colon = false
          elif $c == "[" then .open = true | .fresh = false
          elif $c == "]" and (.fresh | not) then .class = 0 | (if .depth == 0 then _one else . end)
          elif $c == "^" and .fresh and (.negated | not) then .negated = true
          else .fresh = false end
      elif $c == "[" then .class = 1 | .fresh = true | .negated = false
      elif $c == "(" then .depth += 1
      elif $c == ")" then (if .depth == 0 then .fail = true else .depth -= 1 | (if .depth == 0 then _any else . end) end)
      elif .depth > 0 then .
      elif $c == "|" then _end_alternative
      elif $c == "?" or $c == "*" then _optional_last
      elif $c == "{" then .brace = true | _optional_last
      elif $c == "+" then _any
      elif $c | IN("^", "$") then _any
      elif $c == "." then _one
      else _lit($c) end)
  | if .fail or .esc or .class > 0 or .depth > 0 then null else _end_alternative | .alts end;

#: An rg regex that every JSON line holding a match of these parts matches, or null when the parts hold no literal text: literal text in its encoded form, one character as 1 to 12 encoded bytes, anything as .*.
def rg_parts:
  if any(.[]; .lit) | not then null
  else
    (map(select(.lit)) | first) as $first
    | (to_entries | map(select(.value.lit)) | [first.key, last.key]) as [$a, $b]
    | .[$a:($b + 1)]
    | reduce .[] as $p ({out: "", gap: 0, any: false};
        if $p.lit then
          (if .any then ".*" elif .gap > 0 then ".{\(.gap),\(.gap * 12)}" else "" end) as $sep
          | .out += $sep + ($p.lit | s::rg_literal) | .gap = 0 | .any = false
        elif $p.any then .any = true
        else .gap += 1 end)
    | .out
  end;

#: How the search text is matched: {re (Oniguruma, for the decoded text), ci, rg (the rg regexes of a line that can hold a match), rg_ci}. Input: {text, regex}.
def matcher:
  .text as $text
  | .regex as $regex
  | ($text | s::smart_insensitive($regex)) as $ci
  | if $regex then
      ([$text | regex_parts | .[]? | rg_parts]) as $rg
      | {re: $text, ci: $ci, rg: (if ($rg | length) > 0 and all($rg[]; . != null) then $rg else ["."] end), rg_ci: ($ci or ($text | contains("(?")))}
    else {re: ($text | s::literal_regex), ci: $ci, rg: [$text | s::rg_literal], rg_ci: $ci}
    end;

#: The rg regexes of lines that never hold content (state entries, request copies, progress copies, attachments and system entries outside the content kinds); $prefix is matched before the JSON, as in rg's "<path>TAB<line>TAB" output.
def noise_patterns($prefix):
  def alt: map(gsub("(?<c>[.+*?()|\\[\\]{}^$#&~\\\\-])"; "\\\(.c)")) | join("|");
  ([s::known_entry_types[] | select(IN("user", "assistant", "attachment", "system", "queue-operation", "result", "progress") | not)] | alt) as $types
  | ([s::known_attachment_types[] | select(. as $a | s::content_attachment_types | index([$a]) | not)] | alt) as $attachments
  | ([s::known_system_subtypes[] | select(. as $x | s::content_system_subtypes | index([$x]) | not)] | alt) as $subtypes
  | "\($prefix)\\{\"type\":\"(?:\($types))\"",
    "\"type\":\"progress\",\"data\":\\{",
    "\"attachment\":\\{\"type\":\"(?:\($attachments))\"",
    "\"type\":\"system\",\"subtype\":\"(?:\($subtypes))\"";

#: The text around a match for display: whitespace runs as one space, at most $width characters, about a third of them before the match, cut ends marked with …; $width 0 keeps the whole text. Input: a string; $m: {offset, length}.
def snippet($m; $width):
  if $width <= 0 then .
  elif length <= $width then s::display($width)
  else
    length as $n
    | ([$m.offset - ((($width - $m.length) / 3) | floor), 0] | max) as $start
    | (.[$start:($start + $width * 4)] | s::one_space) as $piece
    | ((if $start > 0 then "…" + ($piece | sub("^ "; "")) else ($piece | sub("^ "; "")) end)) as $text
    | if ($text | length) > $width or $start + $width * 4 < $n then $text[:($width - 1)] + "…" | sub(" …$"; "…")
      else $text end
  end;

#: The transcript's content records of the given kinds whose decoded text matches: {l, kind, text, ts, m}, m being the first match.
def matches($kinds; $match):
  s::content($kinds) | . as $r | (.text | s::first_match($match.re; $match.ci)) as $m | select($m != null) | $r + {m: $m};

#: The kinds argument (all, a comma-separated list, or empty for the default) as an array of kinds, or an error naming the first unknown one.
def kinds_of($spec):
  if $spec == "" then s::default_kinds
  elif $spec == "all" then s::content_kinds
  else ($spec | split(",") | map(select(length > 0))) as $asked
    | (first($asked[] | select(. as $k | s::content_kinds | index([$k]) | not)) // null) as $bad
    | if $bad then error("--kind \"\($bad)\" is not a content kind; pass all or a comma-separated list of: \(s::content_kinds | join(", "))")
      else $asked end
  end;

def _src($t; $multi; $explicit):
  if $t.kind == "journal" then $t.run
  elif $t.agent then $t.agent
  elif $multi or ($explicit | not) then $t.session
  else "main" end;

#: Per-session search: one TSV record per match, the files of $ARGS.named.files ("<explicit>TAB<path>" lines, explicit being true for a named session) merged by time, then a notice on stderr when nothing matched; $ARGS.named.hits lists the files that can hold a match, and $ARGS.named.sessions the sessions named, for the notice. Input: null; reads rg lines with inputs.
def within:
  $ARGS.named.opts as $o
  | s::group_lines(inputs) as $grouped
  | $o.multi as $multi
  | ($ARGS.named.hits | split("\n") | map(select(length > 0) | {key: ., value: true}) | from_entries) as $hits
  | [ $ARGS.named.files | split("\n")[] | select(length > 0) | split("\t") | {explicit: (.[0] == "true"), path: (.[1:] | join("\t"))}
      | . as $f
      | ($grouped[$f.path] // {} | s::from_lines($f.path; null)) as $t
      | select($f.explicit or ($t | s::is_internal | not))
      | {t: $t, hit: ($hits[$f.path] // false), explicit: $f.explicit} ] as $searched
  | ($searched | map(select(.hit))) as $hit
  | ($hit[] | .t | s::skipped_notice),
    ([ range(0; $hit | length) as $fi | $hit[$fi] as $h | $h.t as $t
       | [ $t | matches($o.kinds; $o.match) | select(s::within($o.since; $o.until)) | . + {fi: $fi, src: _src($t; $multi; $h.explicit)} ] ]
     | r::by_time) as $out
  | if ($out | length) > 0 then
      $out[] | [s::handle, .src, (.ts | s::ts), .kind, (. as $r | $r.text | snippet($r.m; $o.width))] | s::tsv
    else
      ("cc-sessions: no hits for \($o.text | tojson) in \($o.kinds_text) of \($searched | length) transcript\(if ($searched | length) == 1 then "" else "s" end)"
       + " (session\(if $multi then "s" else "" end) \($ARGS.named.sessions | split("\n") | map(select(length > 0)) | join(", ")))"
       + "\(if $o.bounds != "" then " with\($o.bounds)" else "" end)\n") | stderr | empty
    end;

# rg lines grouped by file as s::group_lines does, but of the file named $hits only the first $cap lines
# of each transcript are kept: {lines, over}, over naming the transcripts that had more.
def _capped_lines($hits; $cap):
  reduce (inputs | select(length > 0)) as $raw ({lines: {}, kept: {}, over: {}};
    ($raw | split("\t")) as $p
    | if ($p | length) < 3 then .
      elif input_filename != $hits then .lines[$p[0]][$p[1]] = ($p | s::line_json)
      elif (.kept[$p[0]] // 0) < $cap then .kept[$p[0]] += 1 | .lines[$p[0]][$p[1]] = ($p | s::line_json)
      else .over[$p[0]] = true end);

#: Corpus search: one "<pos>TAB<record>" line per candidate session (in $ARGS.named.candidates order) with confirmed matches in its main transcript or its non-internal agents, which $ARGS.named.agents lists as "<main>TAB<file>" lines. The file $ARGS.named.hits holds the matching lines, of which $ARGS.named.opts.line_cap per transcript are read; hits end with + when a file had more, or $ARGS.named.capped lists it (rg read only its first ones). A session that a rule fails on is left out with a notice. Input: null; reads rg lines with inputs.
def corpus:
  $ARGS.named.opts as $o
  | _capped_lines($ARGS.named.hits; $o.line_cap) as $read
  | (($ARGS.named.capped // "" | split("\n") | map(select(length > 0) | {key: ., value: true}) | from_entries) + $read.over) as $capped
  | s::candidates($ARGS.named.candidates) as $cands
  | $read.lines as $grouped
  | s::agent_map($ARGS.named.agents) as $agent_files
  | $cands[] | . as $c
  | try (
      ($grouped[$c.path] // {} | s::from_lines($c.path; {mtime: $c.mtime, bytes: $c.bytes}) | s::memo) as $main
      | select($o.origin == "all" or ($main | s::origin) == $o.origin)
      | select($o.cwd == null or any($main | s::cwds[]; s::under($o.cwd)))
      | [$agent_files[$c.path][]? | select($grouped[.]) | . as $f | $grouped[$f] | s::from_lines($f; null) | select(s::is_internal | not)] as $agents
      | [$main | matches($o.kinds; $o.match)] as $main_hits
      | [$agents[] | [matches($o.kinds; $o.match)] | select(length > 0)] as $agent_hits
      | ($main_hits + ($agent_hits | add // [])) as $all
      | select(($all | length) > 0)
      | ($main_hits[0] // $agent_hits[0][0]) as $first
      | ($all | map(.kind) | unique) as $found
      | ($capped[$c.path] or any($agents[]; $capped[.file])) as $lower
      | "\($c.pos)\t" + ([$c.id, ($c.mtime | s::ts), "\($all | length)\(if $lower then "+" else "" end)",
          ([s::content_kinds[] | select(. as $k | $found | index([$k]))] + (if ($agent_hits | length) > 0 then ["agent"] else [] end) | join(",")),
          (if $c.id == $o.current then "*" else null end), ($main | s::first_cwd),
          ($main | s::label_of.text // null | s::display($o.label_width)), ($first.text | snippet($first.m; $o.width))] | s::tsv)
    ) catch s::unreadable_notice($c.id);
