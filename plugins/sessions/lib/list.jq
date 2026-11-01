import "sessions" as s;

#: The rg regexes that find the lines a load of skill $name can leave (Skill call, its result, a re-invocation body, a Base-directory body); a slash or harness trigger is rg_skill_trigger. Matching is by the last name segment.
def rg_skill_markers($name):
  ($name | split(":") | last | s::rg_literal) as $n
  | ["Launching skill: (?:[^\"\\\\\\s]*:)?\($n)[^A-Za-z0-9_.:-]",
     "\"(?:skill|command)\":\"/?(?:[^\"\\\\]*:)?\($n)\"",
     "Skill /(?:\\S*:)?\($n) was loaded earlier",
     "Base directory for this skill: [^\"]*/\($n)/?(?:\\\\|\")"];

#: The rg regex of a slash or harness command trigger naming skill $name; the body follows it within a few lines.
def rg_skill_trigger($name): ($name | split(":") | last | s::rg_literal) as $n | "<command-name>/?(?:[^<\"\\\\]*:)?\($n)</command-name>";

#: Every title text of a transcript: custom titles, ai-titles, agent names and legacy summaries.
def titles:
  .rows[] | .e | select(.type | IN("custom-title", "ai-title", "agent-name", "summary"))
  | (.customTitle // .aiTitle // .agentName // .summary) | strings;

#: The skill field: each exact name loaded that matches $skill with how the main transcript loaded it ("-" when only agents did), plus " +<n> agents" when non-internal agents loaded it; null when nothing loaded. Input: {main, agents: [transcript...]}.
def skill_field($skill):
  def ordered: reduce .[] as $x ([]; if index([$x]) then . else . + [$x] end);
  [.main | s::skill_loads | select(.name | s::skill_match($skill))] as $main
  | [.agents[] | select(s::is_internal | not) | [s::skill_loads | select(.name | s::skill_match($skill))] | select(length > 0)] as $agents
  | ($main + ($agents | add // [])) as $loads
  | if ($loads | length) == 0 then null
    else
      ($loads | map(.name) | ordered)
      | map(. as $n | "\($n) " + ([$main[] | select(.name == $n) | .how] | ordered | if length > 0 then join(",") else "-" end)) | join("; ")
      | . + (if ($agents | length) > 0 then " +\($agents | length) agents" else "" end)
    end;

#: The listing's rows for one batch, as "<pos>TAB<record>" lines in candidate order; a session that a rule fails on is left out with a notice. Input: null; reads rg lines with inputs; $ARGS.named.opts holds {pattern, skill, cwd, origin, current, width}, $ARGS.named.candidates the batch and $ARGS.named.agents its agent files as "<main>TAB<file>" lines.
def main:
  $ARGS.named.opts as $o
  | s::candidates($ARGS.named.candidates) as $cands
  | s::group_lines(inputs) as $grouped
  | s::agent_map($ARGS.named.agents) as $agent_files
  | ($o.pattern | if . then {re: s::literal_regex, ci: s::smart_insensitive(false)} else null end) as $pat
  | $cands[]
  | . as $c
  | try (
      ($grouped[$c.path] // {} | s::from_lines($c.path; {mtime: $c.mtime, bytes: $c.bytes}) | s::memo) as $t
      | ($t | s::origin) as $origin
      | select($o.origin == "all" or $origin == $o.origin)
      | select($pat == null
          or ([$c.id, ($t | titles), ($t | s::first_input | .text? // empty)] | any(.[]; s::first_match($pat.re; $pat.ci) != null)))
      | select($o.cwd == null or any($t | s::cwds[]; s::under($o.cwd)))
      | (if $o.skill then
           {main: $t, agents: [$agent_files[$c.path][]? | select($grouped[.]) | . as $f | $grouped[$f] | s::from_lines($f; null)]}
           | skill_field($o.skill)
         else null end) as $skill
      | select($o.skill == null or $skill != null)
      | "\($c.pos)\t" + ([$c.id, ($c.mtime | s::ts), ($c.bytes | s::human_size), $origin,
           (if $c.id == $o.current then "*" else null end), ($t | s::first_cwd), ($t | s::label_of.text // null | s::display($o.width))]
           + (if $o.skill then [$skill] else [] end) | s::tsv)
    ) catch s::unreadable_notice($c.id);
