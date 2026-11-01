import "sessions" as s;

def _notice($text): "cc-sessions: \($text)\n" | stderr | empty;

def _clip($width):
  if $width > 0 then
    walk(if type == "string" and length > $width then .[:$width] + "…[+\(length - $width) chars]" else . end)
  else . end;

def _line($label): [$label, s::handle, (.e.uuid // null), (.e | s::entry_type), (.e.timestamp | s::ts)] | s::tsv;

# A row found by handle can be a repeated line, which s::entries leaves out; it takes the time of the
# nearest earlier entry, as every other line does.
def _timed($t): if has("t") then . else .l as $l | . + {t: ([$t | s::entries[] | select(.l <= $l) | .t] | last)} end;

def _parents($t; $row; $max):
  [$t | s::ancestors($row)] as $up
  | ($up[:$max][] | _line("parent")),
    (if ($up | length) > $max then
       _notice("the parent chain shows \($max) of \($up | length) ancestors; continue with cc-sessions entry \($t.file) \($up[$max - 1] | s::handle)")
     else empty end);

def _nothing($t; $ref; $bounds):
  ($ref | s::line_of) as $n
  | if $n != null and ($t.skipped | index([$n])) != null then
      _notice("L\($n) of \($t.file) is an unparseable line, so it has no entry")
    else
      _notice("no entry matches \($ref) in \($t.file)"
        + (if $n != null and $n > $t.lines then ", which has \($t.lines) lines" else "" end)
        + (if $bounds != "" then " with\($bounds)" else "" end))
    end;

#: The entries of the transcript that $ref names, each as a summary line and its JSON, then the parent chain of the first.
def entry($ref; $since; $until; $width; $bounds):
  s::transcripts
  | s::memo
  | . as $t
  | [s::lookup($ref) | _timed($t) | select(s::within($since; $until))] as $rows
  | ([$t | s::duplicates | {key: "\(.l)", value: .first}] | from_entries) as $repeats
  | if $rows == [] then _nothing($t; $ref; $bounds)
    else
      ($rows[] | . as $row | _line("entry"), (.e | _clip($width)),
        ($repeats["\(.l)"] | select(. != null) | _notice("L\($row.l) repeats the uuid of L\(.); other commands read L\(.)"))),
      _parents($t; $rows[0]; 20)
    end;
