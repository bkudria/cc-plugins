# shellcheck shell=bash
# shellcheck disable=SC2034 # the CC_* variables set here are read by the commands that source this file
# Shared code for bin/cc-sessions and libexec/* commands. Source it; besides functions it sets only
# CC_SESSIONS_LIB and CC_SESSIONS_ROOT.

CC_SESSIONS_LIB=$(cd "${BASH_SOURCE[0]%/*}" && pwd -P)
CC_SESSIONS_ROOT=${CC_SESSIONS_LIB%/lib}

cc_notice() {
  printf 'cc-sessions: %s\n' "$*" >&2
}

cc_help_hint() {
  if [ -n "${CC_SESSIONS_COMMAND-}" ]; then
    printf 'see cc-sessions %s --help' "$CC_SESSIONS_COMMAND"
  else
    printf 'see cc-sessions --help'
  fi
}

# cc_error <exit-code> <problem> <fix>
cc_error() {
  local code=$1
  cc_notice "$2; $3; $(cc_help_hint)"
  exit "$code"
}

cc_usage_error() {
  cc_error 2 "$1" "$2"
}

cc_fail() {
  cc_error 1 "$1" "$2"
}

# cc_jq_status and cc_rg_status print one dependency's status and return 0 when it is usable.
cc_jq_status() {
  local path version
  path=$(command -v jq) || { printf 'jq missing (need 1.7 or later)\n'; return 1; }
  version=$("$path" --version 2>/dev/null < /dev/null)
  version=${version#jq-}
  if [[ $version =~ ^([0-9]+)\.([0-9]+) ]] &&
    { [ "${BASH_REMATCH[1]}" -gt 1 ] || { [ "${BASH_REMATCH[1]}" -eq 1 ] && [ "${BASH_REMATCH[2]}" -ge 7 ]; }; }; then
    printf 'jq %s ok\n' "$version"
    return 0
  fi
  printf 'jq %s too old (need 1.7 or later)\n' "${version:-of unknown version}"
  return 1
}

cc_rg_status() {
  local path version
  path=$(command -v rg) || { printf 'rg missing\n'; return 1; }
  version=$("$path" --version 2>/dev/null < /dev/null)
  version=${version%%$'\n'*}
  version=${version#ripgrep }
  printf 'rg %s ok\n' "${version%% *}"
}

# cc_need <jq|rg>...: exits 1 unless each dependency is usable. The dispatcher checks jq before every
# command and exports its path as CC_SESSIONS_JQ.
cc_need() {
  local dep status
  for dep in "$@"; do
    case $dep in
      jq)
        if ! status=$(cc_jq_status); then
          status=${status/ missing/ is missing}
          cc_fail "${status/ too old/ is too old}" "install jq 1.7 or later and put it on PATH"
        fi
        CC_SESSIONS_JQ=$(command -v jq)
        export CC_SESSIONS_JQ
        ;;
      rg)
        cc_rg_status > /dev/null || cc_fail "rg (ripgrep) is missing" "install ripgrep and put it on PATH"
        ;;
    esac
  done
}

# cc_lines <text>: sets the array CC_LINES to the non-empty lines of the text, unglobbed. Command
# substitution reads in blocks, while read on a pipe takes one byte per system call: slow for long lists.
cc_lines() {
  local IFS=$'\n'
  set -f
  # shellcheck disable=SC2206 # splitting on newlines is the point
  CC_LINES=($1)
  set +f
}

# cc_rg <rg-option>... -- <file>...: rg over the files, a thousand per run so that long file lists stay
# under the argument limit; finding nothing is not an error, and without files nothing runs.
cc_rg() {
  local options=() i
  while [ $# -gt 0 ] && [ "$1" != -- ]; do
    options+=("$1")
    shift
  done
  shift
  for ((i = 1; i <= $#; i += 1000)); do
    rg --no-config --text --no-messages --color=never "${options[@]}" -- "${@:i:1000}" 2> /dev/null < /dev/null
  done
  return 0
}

# cc_abs_path <path>: the path made absolute, with a leading ~/ expanded and . and .. segments and extra
# slashes removed; links are not resolved.
cc_abs_path() {
  local path=$1 part out=() IFS=/
  case $path in \~/*) path=$HOME/${path#\~/} ;; \~) path=$HOME ;; esac
  case $path in /*) ;; *) path=$PWD/$path ;; esac
  set -f
  for part in $path; do
    case $part in
      '' | .) ;;
      ..) [ ${#out[@]} -gt 0 ] && unset "out[$((${#out[@]} - 1))]" ;;
      *) out+=("$part") ;;
    esac
  done
  set +f
  if [ ${#out[@]} -eq 0 ]; then
    printf '/\n'
  else
    printf '/%s' "${out[@]}"
    printf '\n'
  fi
}

# cc_need_value "$@": inside an option loop, exits 2 unless the option in $1 has a value after it.
cc_need_value() {
  [ $# -ge 2 ] || cc_usage_error "$1 needs a value" "pass one after it"
}

# cc_one_session <count>: exits 2 unless a command that reads one <session> got exactly one.
cc_one_session() {
  [ "$1" -eq 1 ] && return 0
  [ "$1" -eq 0 ] && cc_usage_error "${CC_SESSIONS_COMMAND:-this command} needs a <session>" \
    "pass a session id or a prefix of 4 or more characters, a path, wf_<run-id> or current"
  cc_usage_error "${CC_SESSIONS_COMMAND:-this command} takes one <session>, got $1" "run it once per session"
}

# cc_count <flag> <value>: prints the value as a whole number, or exits 2.
cc_count() {
  [[ $2 =~ ^[0-9]+$ ]] || cc_usage_error "$1 needs a whole number of 0 or more, got \"$2\"" "pass, for example, $1 20"
  printf '%s\n' "$((10#$2))"
}

# cc_unknown_option <option> <valid-option>...: exits 2 naming the command's valid options.
cc_unknown_option() {
  local option=$1 valid
  shift
  valid=$(printf '%s, ' "$@")
  cc_usage_error "unknown option \"$option\" for ${CC_SESSIONS_COMMAND:-cc-sessions}" \
    "valid options: ${valid%, }; to pass text that starts with -, put it after --"
}

# The data root, absolute: jq and rg get absolute paths, and find would read a relative root that
# starts with - as an option. Every find over it takes -H, so that a projects/ that is a symbolic link
# is followed.
cc_data_root() {
  cc_abs_path "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"
}

cc_require_data_root() {
  local root
  root=$(cc_data_root)
  [ -d "$root" ] || cc_fail "no transcripts directory at $root" "set CLAUDE_CONFIG_DIR to the directory that holds projects/"
  printf '%s\n' "$root"
}

# The first sessionId in a flat-layout agent transcript: the session that spawned it.
cc_flat_session_id() {
  local id
  id=$(grep -m 1 -o -e '"sessionId":"[^"]*"' -- "$1" 2> /dev/null < /dev/null)
  id=${id#\"sessionId\":\"}
  printf '%s\n' "${id%\"}"
}

# Sets CC_FILE, CC_KIND (main|subagent|workflow-agent|flat|journal|file), CC_SESSION_ID (the owning
# top-level session), CC_AGENT_ID, CC_RUN_ID, CC_SESSION_DIR, CC_PROJECT_DIR and CC_META_FILE from an
# absolute transcript path. Only the flat layout needs to read the file: its owner is its sessionId.
cc_path_info() {
  local file=$1 dir base
  base=${file##*/}
  dir=${file%/*}
  CC_FILE=$file CC_KIND=file CC_SESSION_ID='' CC_AGENT_ID='' CC_RUN_ID='' CC_SESSION_DIR='' CC_PROJECT_DIR='' CC_META_FILE=''
  case $file in
    */subagents/workflows/*/journal.jsonl)
      CC_KIND=journal CC_RUN_ID=${dir##*/} CC_SESSION_DIR=${dir%/subagents/workflows/*}
      ;;
    */subagents/workflows/*/agent-*.jsonl)
      CC_KIND=workflow-agent CC_RUN_ID=${dir##*/} CC_SESSION_DIR=${dir%/subagents/workflows/*}
      ;;
    */subagents/agent-*.jsonl)
      CC_KIND=subagent CC_SESSION_DIR=${dir%/subagents}
      ;;
    */agent-*.jsonl)
      CC_KIND=flat CC_PROJECT_DIR=$dir
      CC_SESSION_ID=$(cc_flat_session_id "$file")
      [ -n "$CC_SESSION_ID" ] && CC_SESSION_DIR=$dir/$CC_SESSION_ID
      ;;
    *.jsonl)
      CC_KIND=main CC_SESSION_DIR=${file%.jsonl}
      ;;
  esac
  case $CC_KIND in
    workflow-agent | subagent | flat)
      CC_AGENT_ID=${base#agent-}
      CC_AGENT_ID=${CC_AGENT_ID%.jsonl}
      [ -f "${file%.jsonl}.meta.json" ] && CC_META_FILE=${file%.jsonl}.meta.json
      ;;
  esac
  if [ -n "$CC_SESSION_DIR" ] && [ "$CC_KIND" != flat ]; then
    CC_SESSION_ID=${CC_SESSION_DIR##*/}
    CC_PROJECT_DIR=${CC_SESSION_DIR%/*}
  fi
}

cc_reference_error() {
  cc_usage_error "\"$1\" is not a session reference" "pass current, a path, wf_<run-id>, or an id or prefix of at least 4 characters from [A-Za-z0-9_-]"
}

cc_candidate_line() {
  cc_path_info "$1"
  local id=${CC_AGENT_ID:-$CC_SESSION_ID} parent=-
  [ "$CC_KIND" != main ] && parent=${CC_SESSION_ID:--}
  printf 'cc-sessions:   %s\t%s\t%s\t%s\n' "$id" "$CC_KIND" "$parent" "$1" >&2
}

# cc_pick <reference> <match>... : resolves when exactly one match, else exits 2 listing the candidates.
cc_pick() {
  local ref=$1 shown=0 path
  shift
  if [ $# -eq 0 ]; then
    cc_usage_error "no transcript matches \"$ref\"" "pass a session or agent id, a prefix of at least 4 characters, or a path"
  fi
  if [ $# -eq 1 ]; then
    cc_path_info "$1"
    return 0
  fi
  cc_notice "\"$ref\" matches $# transcripts; pass a longer prefix or one of these paths; $(cc_help_hint)"
  for path in "$@"; do
    if [ $shown -eq 20 ]; then
      cc_notice "  … and $(($# - shown)) more"
      break
    fi
    cc_candidate_line "$path"
    shown=$((shown + 1))
  done
  exit 2
}

cc_find_lines() {
  local line
  CC_FOUND=()
  while IFS= read -r line; do
    CC_FOUND+=("$line")
  done
}

cc_resolve_id() {
  local ref=$1 root
  [[ $ref =~ ^[A-Za-z0-9_-]{4,}$ ]] || cc_reference_error "$ref"
  root=$(cc_require_data_root) || exit
  cc_find_lines < <(find -H "$root" -type f \( -name "$ref*.jsonl" -o -name "agent-$ref*.jsonl" -o -name "agent-a$ref*.jsonl" \) \
    ! -name journal.jsonl ! -path '*/memory/*' ! -path '*/tool-results/*' 2> /dev/null < /dev/null | LC_ALL=C sort)
  cc_pick "$ref" ${CC_FOUND[@]+"${CC_FOUND[@]}"}
}

# The main transcript of the session whose directory is $1; sidecars of a relocated session can sit in
# another project directory than the transcript, so the session id is looked up under the data root.
cc_resolve_session_dir() {
  local dir=$1 root
  if [ -f "$dir.jsonl" ]; then
    cc_path_info "$dir.jsonl"
    return 0
  fi
  root=$(cc_require_data_root) || exit
  cc_find_lines < <(find -H "$root" -mindepth 2 -maxdepth 2 -type f -name "${dir##*/}.jsonl" 2> /dev/null < /dev/null | LC_ALL=C sort)
  cc_pick "${dir##*/}" ${CC_FOUND[@]+"${CC_FOUND[@]}"}
}

cc_resolve_run() {
  local ref=$1 root path dirs=() dir seen
  [[ $ref =~ ^wf_[A-Za-z0-9_-]+$ ]] || cc_reference_error "$ref"
  root=$(cc_require_data_root) || exit
  while IFS= read -r path; do
    case $path in
      */subagents/workflows/*) dir=${path%/subagents/workflows/*} ;;
      *) dir=${path%/workflows/*} ;;
    esac
    for seen in ${dirs[@]+"${dirs[@]}"}; do [ "$seen" = "$dir" ] && continue 2; done
    dirs+=("$dir")
  done < <(find -H "$root" \( -type d -path '*/subagents/workflows/*' -name "$ref*" \) -o \
    \( -type f -path '*/workflows/*' -name "$ref*.json" \) 2> /dev/null < /dev/null | LC_ALL=C sort)
  if [ ${#dirs[@]} -ne 1 ]; then
    cc_pick "$ref" ${dirs[@]+"${dirs[@]/%/.jsonl}"}
  fi
  cc_resolve_session_dir "${dirs[0]}"
  CC_RUN_ID=$ref
}

cc_resolve_path() {
  local ref=$1 path=$1 dir name
  case $path in \~/*) path=$HOME/${path#\~/} ;; esac
  case $path in /*) ;; *) path=$PWD/$path ;; esac
  while [ "${#path}" -gt 1 ] && [ "${path%/}" != "$path" ]; do path=${path%/}; done
  if [ -f "$path" ] && [[ $path == *.jsonl ]] && [[ $path != */journal.jsonl ]] && [[ $path != */tool-results/* ]]; then
    cc_path_info "$path"
    return 0
  fi
  if [ -e "$path" ]; then
    if [ -f "$path" ] && [[ $path == *.meta.json ]] && [ -f "${path%.meta.json}.jsonl" ]; then
      cc_path_info "${path%.meta.json}.jsonl"
      return 0
    fi
    dir=$path
    while [ -n "$dir" ]; do
      if [ -f "$dir.jsonl" ]; then
        cc_path_info "$dir.jsonl"
        case $path in "$dir"/subagents/workflows/*)
          name=${path#"$dir"/subagents/workflows/}
          CC_RUN_ID=${name%%/*}
          ;;
        esac
        return 0
      fi
      dir=${dir%/*}
    done
    [ -d "$path" ] && cc_resolve_session_dir "$path" && return 0
    cc_usage_error "\"$ref\" is not a transcript and not inside a session directory" "pass a .jsonl file, a session directory, or a file under tool-results/"
  fi
  name=${path##*/}
  cc_resolve_id "${name%%.*}"
}

# cc_resolve <session-reference>: sets the CC_* variables of cc_path_info, or exits 2 (1 when the data
# root is missing).
cc_resolve() {
  local ref=$1 root
  case $ref in
    current)
      [ -n "${CLAUDE_CODE_SESSION_ID-}" ] ||
        cc_usage_error "\"current\" needs CLAUDE_CODE_SESSION_ID, which is not set" "pass a session id or a path instead"
      root=$(cc_require_data_root) || exit
      cc_find_lines < <(find -H "$root" -mindepth 2 -maxdepth 2 -type f -name "$CLAUDE_CODE_SESSION_ID.jsonl" 2> /dev/null < /dev/null)
      cc_pick "$CLAUDE_CODE_SESSION_ID" ${CC_FOUND[@]+"${CC_FOUND[@]}"}
      ;;
    */* | *.jsonl) cc_resolve_path "$ref" ;;
    wf_*) cc_resolve_run "$ref" ;;
    *) cc_resolve_id "$ref" ;;
  esac
}

# cc_run_dir <session-dir> <run-id>: the workflow run's directory: in that session's directory, else
# anywhere under the data root (a resumed session keeps using the original's directory); returns 1 when
# there is none.
cc_run_dir() {
  local dir=$1 run=$2 path root
  [ -d "$dir/subagents/workflows/$run" ] && printf '%s\n' "$dir/subagents/workflows/$run" && return 0
  root=$(cc_data_root)
  [ -d "$root" ] || return 1
  path=$(find -H "$root" -type d -name "$run" -path '*/subagents/workflows/*' 2> /dev/null < /dev/null | LC_ALL=C sort | head -n 1)
  [ -n "$path" ] && printf '%s\n' "$path" && return 0
  return 1
}

# cc_run_record <session-dir> <run-id>: the run's workflows/<run-id>.json, found like cc_run_dir.
cc_run_record() {
  local dir=$1 run=$2 path root
  [ -f "$dir/workflows/$run.json" ] && printf '%s\n' "$dir/workflows/$run.json" && return 0
  root=$(cc_data_root)
  [ -d "$root" ] || return 1
  path=$(find -H "$root" -type f -name "$run.json" -path '*/workflows/*' 2> /dev/null < /dev/null | LC_ALL=C sort | head -n 1)
  [ -n "$path" ] && printf '%s\n' "$path" && return 0
  return 1
}

# cc_flat_agent_files <project-dir> <session-id>: the flat-layout agent transcripts in the directory whose
# first sessionId is the session. One grep reads them all, as a project directory can hold thousands.
cc_flat_agent_files() {
  find "$1" -mindepth 1 -maxdepth 1 -type f -name 'agent-*.jsonl' \
    -exec grep -m 1 -o -H -e '"sessionId":"[^"]*"' -- {} + 2> /dev/null < /dev/null |
    awk -v want="\"sessionId\":\"$2\"" '{
      k = index($0, ":\"sessionId\":\"")
      if (k == 0) next
      path = substr($0, 1, k - 1)
      if (path in seen) next
      seen[path] = 1
      if (substr($0, k + 1) == want) print path
    }'
}

# cc_agent_files <main-transcript>: the session's agent transcripts, sorted: nested ones under its
# directory and flat-layout ones beside it whose sessionId is the session.
cc_agent_files() {
  local main=$1 dir=${1%.jsonl}
  {
    [ -d "$dir/subagents" ] && find "$dir/subagents" -type f -name 'agent-*.jsonl' 2> /dev/null < /dev/null
    cc_flat_agent_files "${main%/*}" "${dir##*/}"
  } | LC_ALL=C sort
}

# cc_agent_transcripts <session-dir> <agent-id>...: each agent's transcript, found like cc_run_dir, with
# one find over the data root for those not in the session directory; ids found nowhere print nothing.
cc_agent_transcripts() {
  local dir=$1 id path root missing=() names=()
  shift
  for id in "$@"; do
    for path in "$dir/subagents/agent-$id.jsonl" "$dir"/subagents/workflows/*/"agent-$id.jsonl"; do
      [ -f "$path" ] && printf '%s\n' "$path" && continue 2
    done
    missing+=("$id")
  done
  root=$(cc_data_root)
  [ ${#missing[@]} -gt 0 ] && [ -d "$root" ] || return 0
  for id in "${missing[@]}"; do
    [ ${#names[@]} -gt 0 ] && names+=(-o)
    names+=(-name "agent-$id.jsonl")
  done
  find -H "$root" -type f \( "${names[@]}" \) 2> /dev/null < /dev/null | LC_ALL=C sort | awk -F / '!seen[$NF]++'
}

# cc_teammate_sessions <main-transcript>: the sessions of the split-pane teammates that the session
# spawned, sorted: the other main transcripts in its project directory whose entries carry the teamName
# and agentName of a spawn result's agent_id <name>@<team>. An in-process teammate's file is a sub-agent
# transcript, never one of these. rg reads the transcript, as grep is slow on its long lines; without
# rg nothing is found.
cc_teammate_sessions() {
  local main=$1 project=${1%/*} ids id path teams=() candidates=()
  ids=$(cc_rg -o -N --no-filename -e '"agent_id":"[^"@\\ ]+@[^"\\ ]+"' -- "$main" |
    sed -E 's/^"agent_id":"//; s/"$//' | LC_ALL=C sort -u)
  [ -n "$ids" ] || return 0
  cc_lines "$ids"
  for id in "${CC_LINES[@]}"; do
    teams+=(-e "\"teamName\":\"${id#*@}\"")
  done
  cc_lines "$(find "$project" -mindepth 1 -maxdepth 1 -type f -name '*.jsonl' ! -name 'agent-*' 2> /dev/null < /dev/null)"
  cc_lines "$(cc_rg -l -F "${teams[@]}" -- ${CC_LINES[@]+"${CC_LINES[@]}"} | LC_ALL=C sort)"
  for path in ${CC_LINES[@]+"${CC_LINES[@]}"}; do
    [ "$path" = "$main" ] || candidates+=("$path")
  done
  [ ${#candidates[@]} -gt 0 ] || return 0
  awk -v ids="$(printf '%s' "$ids" | tr '\n' ' ')" '
    BEGIN { n = split(ids, list, " "); for (i = 1; i <= n; i++) wanted[list[i]] = 1 }
    /"teamName":"/ && /"agentName":"/ && /"type":"(user|assistant)"/ {
      team = $0; sub(/.*"teamName":"/, "", team); sub(/".*/, "", team)
      name = $0; sub(/.*"agentName":"/, "", name); sub(/".*/, "", name)
      if ((name "@" team) in wanted) print FILENAME
      nextfile
    }' "${candidates[@]}" 2> /dev/null < /dev/null
}

# cc_session_agent_files <main-transcript> [--journals]: a session's agents as every command reads them:
# cc_agent_files, cc_session_elsewhere_files, then cc_teammate_sessions. --journals adds each workflow
# run's journal.jsonl.
cc_session_agent_files() {
  local main=$1 journals=${2-} dir=${1%.jsonl}
  {
    cc_agent_files "$main"
    if [ "$journals" = --journals ] && [ -d "$dir/subagents/workflows" ]; then
      find "$dir/subagents/workflows" -mindepth 2 -maxdepth 2 -type f -name journal.jsonl 2> /dev/null < /dev/null
    fi
  } | LC_ALL=C sort
  cc_session_elsewhere_files "$main" "$journals"
  cc_teammate_sessions "$main"
}

# cc_session_elsewhere_files <main-transcript> [--journals]: the agent transcripts that the session's Agent
# and Workflow calls name but that sit elsewhere under the data root, as a resumed session's agents stay
# with the original session; --journals adds those runs' journal.jsonl.
cc_session_elsewhere_files() {
  local main=$1 journals=${2-} dir=${1%.jsonl} key id path found missing=() confirmed='' names=()
  while IFS=: read -r key id; do
    found=0
    if [ "$key" = run ]; then
      [ -d "$dir/subagents/workflows/$id" ] && found=1
    else
      for path in "$dir/subagents/agent-$id.jsonl" "${main%/*}/agent-$id.jsonl" "$dir"/subagents/workflows/*/"agent-$id.jsonl"; do
        [ -f "$path" ] && found=1 && break
      done
    fi
    [ $found -eq 1 ] || missing+=("$key:$id")
  done < <(grep -o -h -E '"(agentId|agent_id|runId)":"[A-Za-z0-9_-]+"' -- "$main" 2> /dev/null < /dev/null |
    sed -E 's/^"(agentId|agent_id)":"/agent:/; s/^"runId":"/run:/; s/"$//' | LC_ALL=C sort -u)
  [ ${#missing[@]} -gt 0 ] || return 0
  # Only ids that the calls themselves name count, not ids quoted in some text of the transcript.
  # shellcheck disable=SC2016 # jq program text
  confirmed=$(cc_jq_program 'import "sessions" as s; s::transcripts | s::memo
    | (s::agent_calls | .agent_id // empty | "agent:\(.)"), (s::workflow_calls | .run_id // empty | "run:\(.)")' \
    -r -- "$main" 2> /dev/null)
  for key in "${missing[@]}"; do
    case $'\n'$confirmed$'\n' in *$'\n'$key$'\n'*) ;; *) continue ;; esac
    id=${key#*:}
    if [ "${key%%:*}" = run ]; then
      names+=(-o \( -type d -path '*/subagents/workflows/*' -name "$id" \))
    else
      names+=(-o \( -type f -name "agent-$id.jsonl" \))
    fi
  done
  [ ${#names[@]} -gt 0 ] || return 0
  find -H "$(cc_data_root)" \( -false "${names[@]}" \) -print 2> /dev/null < /dev/null | LC_ALL=C sort |
    while IFS= read -r path; do
      if [ -d "$path" ]; then
        for found in "$path"/agent-*.jsonl; do [ -f "$found" ] && printf '%s\n' "$found"; done
        [ "$journals" = --journals ] && [ -f "$path/journal.jsonl" ] && printf '%s\n' "$path/journal.jsonl"
      else
        printf '%s\n' "$path"
      fi
    done | awk -F/ '!seen[$NF]++ || $NF == "journal.jsonl"'
}

# cc_resolve_all <session-reference>...: resolves each one (exiting like cc_resolve) into the array
# CC_FILES, in order, each file once. The references move to an array first: bash copies the caller's
# arguments at every function call, which over thousands of them would take time growing with their
# square.
cc_resolve_all() {
  local ref refs=("$@")
  set --
  CC_FILES=()
  for ref in "${refs[@]}"; do
    cc_resolve "$ref"
    CC_FILES+=("$CC_FILE")
  done
  [ ${#CC_FILES[@]} -gt 1 ] || return 0
  cc_lines "$(printf '%s\n' "${CC_FILES[@]}" | awk '!seen[$0]++')"
  CC_FILES=("${CC_LINES[@]}")
}

cc_jq_binary() {
  printf '%s\n' "${CC_SESSIONS_JQ:-jq}"
}

# cc_bound <flag> <value>: prints a --since/--until value as the JSON bound of s::bound (for
# --argjson), or exits 2 naming the accepted forms.
cc_bound() {
  local out
  # shellcheck disable=SC2016 # $v is a jq variable
  if out=$("$(cc_jq_binary)" -n -c -L "$CC_SESSIONS_LIB" --arg v "$2" 'import "sessions" as s; s::bound($v)' 2>&1 < /dev/null); then
    printf '%s\n' "$out"
    return 0
  fi
  cc_usage_error "$1 ${out#*--since/--until }" "pass one of those forms"
}

# cc_mtime_bound <flag> <value> [<other fix>]: a --since/--until value as "<from> <to>" epoch seconds,
# for a command that compares modified times; a handle is a usage error there.
cc_mtime_bound() {
  local json
  json=$(cc_bound "$1" "$2") || exit
  case $json in *'"line"'*)
    cc_usage_error "$1 $2 is a handle, which only per-session records have" \
      "pass a timestamp (2026-10-30T10:00:04Z, 2026-10-30) or an age (7d) to compare modified times${3:+, $3}"
    ;;
  esac
  [[ $json =~ \"from\":(-?[0-9]+).*\"to\":(-?[0-9]+) ]]
  printf '%s %s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
}

# cc_find_utf8_locale: sets CC_UTF8_LOCALE to a UTF-8 locale this system has, so that ${#text} under it
# counts characters whatever the caller's locale; empty when there is none.
cc_find_utf8_locale() {
  local LC_ALL candidate text=$'\303\251'
  CC_UTF8_LOCALE=''
  for candidate in C.UTF-8 en_US.UTF-8 UTF-8; do
    { LC_ALL=$candidate; } 2> /dev/null
    if [ ${#text} -eq 1 ]; then
      CC_UTF8_LOCALE=$candidate
      return 0
    fi
  done
}

# cc_print_line <text>: prints one line of output. When the reader has closed stdout, the command ends
# at once with SIGPIPE's status, quietly: bash reports the failed write when a trap is set, and any
# later output of its own would carry the unwritten bytes.
cc_print_line() {
  printf '%s\n' "$1" 2> /dev/null || exit 141
}

# Paging for the cross-session commands, which apply the budget themselves so that reading stops with
# it. cc_page_start <limit> <max-chars> resets the state; cc_page_take reads "<pos>TAB<row>" lines, newest
# first, whose row has its modified time in field 2, prints the rows that fit and sets CC_PAGE_STOP when
# the budget is reached; cc_page_end prints the rows still held and the notice. A page never ends inside
# the rows that share one modified second, since --until <that second> would then repeat some of them
# and could never reach those past the limit: it ends before them, or holds them all when they are the
# whole page. The page continues with --until <modified of the next row>, which no row shown shares.
# Rows go to fd 3, which the dispatcher opens on its own stdout past its budget filter, as such a page
# can hold more rows than --limit.
cc_page_start() {
  CC_PAGE_LIMIT=$1 CC_PAGE_MAX=$2 CC_PAGE_SHOWN=0 CC_PAGE_USED=0 CC_PAGE_STOP='' CC_PAGE_NEXT='' CC_PAGE_NEXT_SIZE=0
  CC_PAGE_HELD=() CC_PAGE_HELD_SIZE=0 CC_PAGE_GROUP='' CC_PAGE_WHOLE=''
  { true >&3; } 2> /dev/null || exec 3>&1
  cc_find_utf8_locale
}

# cc_page_over <size>: true, naming the budget in CC_PAGE_OVER, when one more row of that size does not fit.
cc_page_over() {
  local count=$((CC_PAGE_SHOWN + ${#CC_PAGE_HELD[@]} + 1))
  CC_PAGE_OVER=''
  if [ "$CC_PAGE_LIMIT" -gt 0 ] && [ $count -gt "$CC_PAGE_LIMIT" ]; then
    CC_PAGE_OVER="--limit $CC_PAGE_LIMIT"
  elif [ "$CC_PAGE_MAX" -gt 0 ] && [ $((CC_PAGE_USED + CC_PAGE_HELD_SIZE + $1)) -gt "$CC_PAGE_MAX" ]; then
    CC_PAGE_OVER="--max-chars $CC_PAGE_MAX"
  fi
  [ -n "$CC_PAGE_OVER" ]
}

cc_page_flush() {
  local row
  for row in ${CC_PAGE_HELD[@]+"${CC_PAGE_HELD[@]}"}; do
    cc_print_line "$row" >&3
  done
  CC_PAGE_SHOWN=$((CC_PAGE_SHOWN + ${#CC_PAGE_HELD[@]})) CC_PAGE_USED=$((CC_PAGE_USED + CC_PAGE_HELD_SIZE))
  CC_PAGE_HELD=() CC_PAGE_HELD_SIZE=0
}

cc_page_take() {
  local pos row modified size
  [ -z "$CC_UTF8_LOCALE" ] || local LC_ALL=$CC_UTF8_LOCALE
  while IFS=$'\t' read -r pos row; do
    [ -n "$pos" ] && [ -z "$CC_PAGE_STOP" ] || continue
    modified=${row#*$'\t'}
    modified=${modified%%$'\t'*}
    size=$((${#row} + 1))
    if [ ${#CC_PAGE_HELD[@]} -gt 0 ] && [ "$modified" = "$CC_PAGE_GROUP" ]; then
      if [ -z "$CC_PAGE_WHOLE" ] && cc_page_over "$size"; then
        if [ "$CC_PAGE_SHOWN" -gt 0 ]; then
          CC_PAGE_STOP=$CC_PAGE_OVER CC_PAGE_NEXT=$modified CC_PAGE_HELD=() CC_PAGE_HELD_SIZE=0
          continue
        fi
        CC_PAGE_WHOLE=$CC_PAGE_OVER
      fi
    else
      if [ -n "$CC_PAGE_WHOLE" ]; then
        cc_page_flush
        CC_PAGE_STOP=$CC_PAGE_WHOLE CC_PAGE_NEXT=$modified
        continue
      fi
      cc_page_flush
      if cc_page_over "$size"; then
        CC_PAGE_STOP=$CC_PAGE_OVER CC_PAGE_NEXT=$modified CC_PAGE_NEXT_SIZE=$size
        continue
      fi
      CC_PAGE_GROUP=$modified
    fi
    CC_PAGE_HELD+=("$row")
    CC_PAGE_HELD_SIZE=$((CC_PAGE_HELD_SIZE + size))
  done
}

cc_page_end() {
  local s=s shared=''
  [ -n "$CC_PAGE_STOP" ] || cc_page_flush
  [ -n "$CC_PAGE_STOP" ] || return 0
  if [ "$CC_PAGE_SHOWN" -eq 0 ]; then
    cc_notice "output stopped at $CC_PAGE_STOP after 0 sessions; the next record is $CC_PAGE_NEXT_SIZE characters; continue with --max-chars $CC_PAGE_NEXT_SIZE"
    return 0
  fi
  [ "$CC_PAGE_SHOWN" -eq 1 ] && s=''
  [ -n "$CC_PAGE_WHOLE" ] && shared=', which share one modified time'
  cc_notice "output stopped at $CC_PAGE_STOP after $CC_PAGE_SHOWN session$s$shared; older sessions were not all examined; continue with --until $CC_PAGE_NEXT"
}

# cc_sessions_by_mtime <from> <to>: the main transcripts under the data root modified inside the bounds
# (epoch seconds; empty for none), newest first, as "<pos>TAB<mtime>TAB<bytes>TAB<path>" lines.
cc_sessions_by_mtime() {
  find -H "$(cc_data_root)" -mindepth 2 -maxdepth 2 -type f -name '*.jsonl' ! -name 'agent-*' \
    -exec stat -f '%m%t%z%t%N' {} + 2> /dev/null < /dev/null |
    LC_ALL=C sort -t $'\t' -k1,1nr -k3,3 |
    awk -F '\t' -v lo="${1:-x}" -v hi="${2:-x}" '(lo == "x" || $1 >= lo + 0) && (hi == "x" || $1 <= hi + 0) { print n++ "\t" $0 }'
}

# cc_corpus_agent_map [--journals]: every agent transcript under the data root (with --journals, every run
# journal too) with the main transcript it belongs to, as "<main>TAB<file>" lines: nested ones by their
# session directory, flat ones by their first sessionId.
cc_corpus_agent_map() {
  local root names=(-name 'agent-*.jsonl')
  root=$(cc_data_root)
  [ "${1-}" = --journals ] && names=(\( -name 'agent-*.jsonl' -o -name journal.jsonl \))
  find -H "$root" -mindepth 3 -path '*/subagents/*' -type f "${names[@]}" 2> /dev/null < /dev/null |
    awk '{ main = $0; sub(/\/subagents\/.*$/, ".jsonl", main); print main "\t" $0 }'
  cc_lines "$(find -H "$root" -mindepth 2 -maxdepth 2 -type f -name 'agent-*.jsonl' 2> /dev/null < /dev/null)"
  cc_rg -m 1 -o --no-heading --with-filename --field-match-separator=$'\t' -e '"sessionId":"[^"]*"' -- ${CC_LINES[@]+"${CC_LINES[@]}"} |
    awk -F '\t' '{ id = $2; gsub(/"sessionId":"|"/, "", id); dir = $1; sub(/\/[^\/]*$/, "", dir); print dir "/" id ".jsonl\t" $1 }'
}

# cc_readable <file>...: exits 1 unless each file is a readable regular file.
cc_readable() {
  local file
  for file in "$@"; do
    [ -r "$file" ] && [ -f "$file" ] || cc_fail "cannot read $file" "check the path and its permissions"
  done
}

# cc_jq_failed <status> <what>: after a failed cc_jq_program. Status 1 and 2 were reported already (an
# unreadable file, a usage error found by the program); 141 is jq ended by SIGPIPE, as the reader of
# stdout went away, which ends the command quietly; any other status is jq failing on the input, said
# in a sentence instead of jq's own words.
cc_jq_failed() {
  case $1 in 1 | 2 | 141) exit "$1" ;; esac
  cc_fail "could not read $2" "check that it is a Claude Code transcript"
}

# cc_jq_program <program> [<jq-option>...] -- <file|->...
# Runs jq with lib/ on the library path. Each file reaches the program through s::transcripts as one
# transcript object. What jq reads (the files and their agents' meta files, joined by the line in
# lib/file-separator; each file's facts; stat results; the sizes of saved outputs) comes through
# --rawfile of process substitutions rather than the argument list, so any number of files fits and
# no step runs once per file. stdin stays closed unless "-" is a file.
cc_jq_program() {
  local program=$1 file entry meta stdin=0 last_dir='' input=/dev/null
  local options=() operands=() files=() metas=() entries=() dirs=()
  shift
  while [ $# -gt 0 ] && [ "$1" != -- ]; do
    options+=("$1")
    shift
  done
  [ $# -gt 0 ] && shift
  # As in cc_resolve_all, the operands leave the argument list before any function is called.
  operands=("$@")
  set --
  for file in ${operands[@]+"${operands[@]}"}; do
    if [ "$file" = - ]; then
      stdin=1
      entries+=($'-\t-\tfile')
      continue
    fi
    case $file in /*) ;; *) file=$PWD/$file ;; esac
    cc_readable "$file"
    cc_path_info "$file"
    meta=-
    if [ -n "$CC_META_FILE" ] && [ -r "$CC_META_FILE" ]; then
      meta=m${#metas[@]}
      metas+=("$CC_META_FILE")
    fi
    printf -v entry '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s' "${#files[@]}" "$file" "$CC_KIND" "${CC_SESSION_ID:--}" \
      "${CC_AGENT_ID:--}" "${CC_RUN_ID:--}" "${CC_SESSION_DIR:--}" "${CC_PROJECT_DIR:--}" "$meta"
    files+=("$file")
    entries+=("$entry")
    if [ -n "$CC_SESSION_DIR" ] && [ "$CC_SESSION_DIR" != "$last_dir" ] && [ -d "$CC_SESSION_DIR/tool-results" ]; then
      dirs+=("$CC_SESSION_DIR/tool-results")
    fi
    last_dir=$CC_SESSION_DIR
  done
  [ $stdin -eq 1 ] && input=/dev/stdin
  "$(cc_jq_binary)" -n -R -c -L "$CC_SESSIONS_LIB" \
    --rawfile __ctx <(printf '%s\n' ${entries[@]+"${entries[@]}"}) \
    --rawfile __stats <(
      [ ${#files[@]} -eq 0 ] || printf '%s\0' "${files[@]}" | xargs -0 stat -f '%z%t%m%t%N' -- 2> /dev/null
    ) \
    --rawfile __sizes <(
      [ ${#dirs[@]} -eq 0 ] || printf '%s\n' "${dirs[@]}" | LC_ALL=C sort -u | tr '\n' '\0' |
        xargs -0 sh -c 'find "$@" -type f -exec stat -f "%z%t%N" {} +' sh 2> /dev/null
      [ ${#files[@]} -eq 0 ] || printf '%s\0' "${files[@]}" | xargs -0 grep -h -o -e 'Full output saved to: [^"\\]*' -- 2> /dev/null |
        LC_ALL=C sort -u | while IFS= read -r file; do
          file=${file#Full output saved to: }
          [ -f "$file" ] && printf '%s\0' "$file"
        done | xargs -0 stat -f '%z%t%N' -- 2> /dev/null
    ) \
    --rawfile __bundle <(
      for file in ${files[@]+"${files[@]}"} ${metas[@]+"${metas[@]}"}; do
        printf '%s\0%s\0' "$file" "$CC_SESSIONS_LIB/file-separator"
      done | xargs -0 cat -- 2> /dev/null
    ) \
    ${options[@]+"${options[@]}"} -- "$program" < "$input"
}

# cc_module_program <name> <call>: the text of lib/<name>.jq followed by the call, run as the main
# program. jq 1.8.2 aborts at compile time when a module that the program imports calls an s::
# function that calls another one, so a command module is never imported.
cc_module_program() {
  printf '%s\n%s\n' "$(< "$CC_SESSIONS_LIB/$1.jq")" "$2"
}
