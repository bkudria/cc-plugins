import "sessions" as s;

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
  | reduce .[] as $c ({alts: [], parts: [], esc: false, class: 0, depth: 0, brace: false, fail: false};
      if .fail then .
      elif .brace then (if $c == "}" then .brace = false else . end)
      elif .esc then
        .esc = false
        | if .class > 0 or .depth > 0 then .
          elif ($c | _literal_char) then _lit($c | _literal_char)
          elif $c | test("^[dDwWsShHN]$") then _one
          elif $c | test("^[bBAzZG]$") then _any
          elif $c | test("^[A-Za-z0-9]$") then .fail = true
          else _lit($c) end
      elif $c == "\\" then .esc = true
      elif .class > 0 then
        (if $c == "]" and .class > 1 then .class = 0 | (if .depth == 0 then _one else . end) elif $c == "^" and .class == 1 then . else .class = 2 end)
      elif $c == "[" then .class = 1
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
  | ($text | s::smart_insensitive) as $ci
  | if .regex then
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
    | (.[$start:($start + $width * 4)] | gsub("\\s+"; " ")) as $piece
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

def _src($t; $multi):
  if $t.kind == "journal" then $t.run
  elif $t.agent then $t.agent
  elif $multi then $t.session
  else "main" end;

#: Per-session search: one TSV record per match in the order of $ARGS.named.opts.files ([{path, explicit}]), then a notice on stderr when nothing matched. Input: null; reads rg lines with inputs.
def within:
  $ARGS.named.opts as $o
  | s::group_lines(inputs) as $grouped
  | $o.multi as $multi
  | [ $o.files[] | . as $f
      | ($grouped[$f.path] // {} | s::from_lines($f.path; null)) as $t
      | select($f.explicit or ($t | s::is_internal | not))
      | {t: $t, hit: $f.hit} ] as $searched
  | [ $searched[] | select(.hit) | .t as $t
      | ($t | s::skipped_notice),
        ($t | matches($o.kinds; $o.match) | select(s::within($o.since; $o.until))
          | [s::handle, _src($t; $multi), (.ts | s::ts), .kind, (. as $r | $r.text | snippet($r.m; $o.width))] | s::tsv) ] as $out
  | if ($out | length) > 0 then $out[]
    else
      ("cc-sessions: no hits for \($o.text | tojson) in \($o.kinds_text) of \($searched | length) transcript\(if ($searched | length) == 1 then "" else "s" end)"
       + " (session\(if $multi then "s" else "" end) \($o.sessions_text))\(if $o.bounds != "" then " with\($o.bounds)" else "" end)\n") | stderr | empty
    end;

#: Corpus search: one "<pos>TAB<record>" line per candidate session (in $ARGS.named.candidates order) with confirmed matches in its main transcript or its non-internal agents; hits end with + when $ARGS.named.capped lists one of its files (only its first matching lines were read). Input: null; reads rg lines with inputs.
def corpus:
  $ARGS.named.opts as $o
  | ($ARGS.named.capped // "" | split("\n") | map(select(length > 0) | {key: ., value: true}) | from_entries) as $capped
  | s::candidates($ARGS.named.candidates) as $cands
  | s::group_lines(inputs) as $grouped
  | ($cands | map({key: .id, value: []}) | from_entries) as $ids
  | (reduce ($grouped | keys_unsorted[] | select(s::path_info.kind != "main")) as $path ($ids;
      ($grouped[$path] | s::from_lines($path; null)) as $t
      | if $t.session != null and has($t.session) and ($t | s::is_internal | not) then .[$t.session] += [$t] else . end)) as $agents
  | $cands[] | . as $c
  | ($grouped[$c.path] // {} | s::from_lines($c.path; {mtime: $c.mtime, bytes: $c.bytes})) as $main
  | select($o.origin == "all" or ($main | s::origin) == $o.origin)
  | select($o.cwd == null or any($main | s::cwds[]; s::under($o.cwd)))
  | [$main | matches($o.kinds; $o.match)] as $main_hits
  | [$agents[$c.id] | sort_by(.file)[] | [matches($o.kinds; $o.match)] | select(length > 0)] as $agent_hits
  | ($main_hits + ($agent_hits | add // [])) as $all
  | select(($all | length) > 0)
  | (($main_hits[0] // $agent_hits[0][0]) as $first
     | ($all | map(.kind) | unique) as $found
     | ($capped[$c.path] or any($agents[$c.id][]; $capped[.file])) as $lower
     | "\($c.pos)\t" + ([$c.id, ($c.mtime | s::ts), "\($all | length)\(if $lower then "+" else "" end)",
         ([s::content_kinds[] | select(. as $k | $found | index([$k]))] + (if ($agent_hits | length) > 0 then ["agent"] else [] end) | join(",")),
         (if $c.id == $o.current then "*" else null end), ($main | s::first_cwd),
         ($main | s::label_of.text // null | s::display($o.label_width)), ($first.text | snippet($first.m; $o.width))] | s::tsv));
