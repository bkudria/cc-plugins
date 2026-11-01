import "sessions" as s;

def _text:
  if .kind == "denied" then [.tool, .text] | map(select(. != null and . != "")) | join(": ")
  else .text end;

# Outputs sit right after their command in file order, so sorting by line keeps each one behind it.
def records:
  s::memo
  | [(s::human_events | {l, ts, kind, text: _text}), (s::outputs | {l, ts, kind, text})]
  | sort_by(.l) | .[];

def main($since; $until; $width):
  records
  | select(s::within($since; $until))
  | [s::handle, (.ts | s::ts), .kind, (.text | s::trunc($width))]
  | s::tsv;
