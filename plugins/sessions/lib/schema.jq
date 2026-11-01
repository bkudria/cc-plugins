import "sessions" as s;

# A tally is {t: {label: {version: n}}, k: {type: {signature: n}}, r: {tool: {signature: n}},
# f: {kind: {n, bytes}}, s: {lines, files}}. Key sets are kept as comma-joined signatures, one
# update per entry, and expanded into key counts only when the rows are printed.

def _empty: {t: {}, k: {}, r: {}, f: {}, s: {lines: 0, files: 0}};

def _signature: if type == "object" then keys_unsorted | join(",") else "(\(type))" end;

def _add_numbers($b): reduce ($b | to_entries[]) as $x (.; .[$x.key] += $x.value);

def _add_maps($b): reduce ($b | to_entries[]) as $x (.; .[$x.key] |= ((. // {}) | _add_numbers($x.value)));

def _merge($b):
  .t |= _add_maps($b.t) | .k |= _add_maps($b.k) | .r |= _add_maps($b.r) | .f |= _add_maps($b.f)
  | .s |= _add_numbers($b.s);

# An entry without a version takes the nearest earlier version in its file, else the file's first.
def _file_tally($since; $until):
  s::memo
  | . as $t
  | (s::versions[0] // "-") as $first
  | reduce (s::entries[] | select(s::within($since; $until))) as $r ({v: $first, t: {}, k: {}};
      (($r.e.version | strings) // .v) as $v
      | .v = $v
      | .t[$r.e | s::entry_type | tostring][$v] += 1
      | .k[$r.e.type // "?" | tostring][$r.e | _signature] += 1)
  | {t, k,
     r: (reduce ($t | s::tool_calls | select(.result != null and s::within($since; $until))) as $c ({};
          .[$c.name // "?" | tostring][$c.result | _signature] += 1)),
     f: {($t.kind): {n: 1, bytes: ($t.bytes // 0)}},
     s: {lines: ($t.skipped | length), files: (if ($t.skipped | length) > 0 then 1 else 0 end)}};

#: The tally of every transcript read, as one JSON object; the entries counted lie inside the bounds.
def tally($since; $until):
  reduce s::transcripts as $t (_empty; _merge($t | _file_tally($since; $until)));

def _vkey: split(".") | map(tonumber? // 0);

def _known_detail($label; $versions):
  ($versions | keys | map(select(. != "-")) | sort_by(_vkey)) as $seen
  | (if $label | s::is_known_type then "known" else "UNKNOWN" end)
    + (if $seen == [] then "" else " \($seen[0])..\($seen[-1])" end);

def _keys_detail:
  (to_entries | map(.value) | add) as $total
  | (reduce to_entries[] as $sig ({}; reduce ($sig.key | if startswith("(") then [.] else split(",") end)[] as $k (.; .[$k] += $sig.value)))
  | to_entries | sort_by(.key)
  | map(.key + (if .value < $total then "?" else "" end)) | join(",");

def _section_rank: {type: 0, system: 1, attachment: 2, keys: 3, "tool-result": 4, files: 5}[.];

def _type_of_label: if startswith("attachment:") then "attachment" elif startswith("system:") then "system" else . end;

def _rows:
  . as $m
  | ($m.t | to_entries | map({label: .key, type: (.key | _type_of_label), versions: .value, n: (.value | map(.) | add)})) as $labels
  | ($labels | group_by(.type)
      | map({section: "type", name: .[0].type, n: (map(.n) | add),
             detail: _known_detail(.[0].type; (map(.versions) | add))})[]),
    ($labels[] | select(.type != .label)
      | {section: .type, name: .label[(.type | length) + 1:], n, detail: _known_detail(.label; .versions)}),
    ($m.k | to_entries[] | {section: "keys", name: .key, n: (.value | map(.) | add), detail: (.value | _keys_detail),
       unknown: (.key | s::is_known_type | not)}),
    ($m.r | to_entries[] | {section: "tool-result", name: .key, n: (.value | map(.) | add), detail: (.value | _keys_detail)}),
    ($m.f | to_entries[] | {section: "files", name: .key, n: .value.n, detail: (.value.bytes | s::human_size)});

#: The schema records of the tallies read as inputs, merged with $extra (a tally); unknown types first. Across the corpus ($corpus true), file rows alone are an answer and unparseable lines are summed in one notice.
def report($extra; $corpus):
  reduce inputs as $p (_empty; _merge($p)) | _merge($extra)
  | . as $m
  | select($corpus or $m.t != {})
  | if $corpus and $m.s.lines > 0 then
      ("cc-sessions: skipped \($m.s.lines) unparseable line\(if $m.s.lines == 1 then "" else "s" end) in \($m.s.files) file\(if $m.s.files == 1 then "" else "s" end)\n" | stderr | empty)
    else empty end,
    ([_rows | .unknown = (if has("unknown") then .unknown else .detail | startswith("UNKNOWN") end)]
     | sort_by((if .unknown then 0 else 1 end), (.section | _section_rank), -.n, .name)[]
     | [.section, .name, .n, .detail] | s::tsv);
