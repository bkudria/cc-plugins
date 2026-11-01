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

cc_data_root() {
  printf '%s/projects\n' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
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
  cc_find_lines < <(find "$root" -type f \( -name "$ref*.jsonl" -o -name "agent-$ref*.jsonl" -o -name "agent-a$ref*.jsonl" \) \
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
  cc_find_lines < <(find "$root" -mindepth 2 -maxdepth 2 -type f -name "${dir##*/}.jsonl" 2> /dev/null < /dev/null | LC_ALL=C sort)
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
  done < <(find "$root" \( -type d -path '*/subagents/workflows/*' -name "$ref*" \) -o \
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
      cc_find_lines < <(find "$root" -mindepth 2 -maxdepth 2 -type f -name "$CLAUDE_CODE_SESSION_ID.jsonl" 2> /dev/null < /dev/null)
      cc_pick "$CLAUDE_CODE_SESSION_ID" ${CC_FOUND[@]+"${CC_FOUND[@]}"}
      ;;
    */* | *.jsonl) cc_resolve_path "$ref" ;;
    wf_*) cc_resolve_run "$ref" ;;
    *) cc_resolve_id "$ref" ;;
  esac
}

# cc_agent_transcript <session-dir> <agent-id>: the agent's transcript in that session's directory,
# else anywhere under the data root; returns 1 when there is none.
cc_agent_transcript() {
  local dir=$1 id=$2 path root
  for path in "$dir/subagents/agent-$id.jsonl" "$dir"/subagents/workflows/*/"agent-$id.jsonl"; do
    [ -f "$path" ] && printf '%s\n' "$path" && return 0
  done
  root=$(cc_data_root)
  [ -d "$root" ] || return 1
  path=$(find "$root" -type f -name "agent-$id.jsonl" 2> /dev/null < /dev/null | LC_ALL=C sort | head -n 1)
  [ -n "$path" ] && printf '%s\n' "$path" && return 0
  return 1
}

# cc_run_dir <session-dir> <run-id>: the workflow run's directory, found like cc_agent_transcript.
cc_run_dir() {
  local dir=$1 run=$2 path root
  [ -d "$dir/subagents/workflows/$run" ] && printf '%s\n' "$dir/subagents/workflows/$run" && return 0
  root=$(cc_data_root)
  [ -d "$root" ] || return 1
  path=$(find "$root" -type d -name "$run" -path '*/subagents/workflows/*' 2> /dev/null < /dev/null | LC_ALL=C sort | head -n 1)
  [ -n "$path" ] && printf '%s\n' "$path" && return 0
  return 1
}

# cc_run_record <session-dir> <run-id>: the run's workflows/<run-id>.json, found like cc_run_dir.
cc_run_record() {
  local dir=$1 run=$2 path root
  [ -f "$dir/workflows/$run.json" ] && printf '%s\n' "$dir/workflows/$run.json" && return 0
  root=$(cc_data_root)
  [ -d "$root" ] || return 1
  path=$(find "$root" -type f -name "$run.json" -path '*/workflows/*' 2> /dev/null < /dev/null | LC_ALL=C sort | head -n 1)
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

# cc_agent_transcripts <session-dir> <agent-id>...: cc_agent_transcript for several ids, with one find
# over the data root for those not in the session directory; ids found nowhere print nothing.
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
  find "$root" -type f \( "${names[@]}" \) 2> /dev/null < /dev/null | LC_ALL=C sort | awk -F / '!seen[$NF]++'
}

# cc_session_agent_files <main-transcript> [--journals]: cc_agent_files, then the agent transcripts that
# the session's Agent and Workflow calls name but that sit elsewhere under the data root, as a resumed
# session's agents stay with the original session. --journals adds each workflow run's journal.jsonl.
cc_session_agent_files() {
  local main=$1 journals=${2-} dir=${1%.jsonl} key id path found missing=() confirmed='' names=()
  {
    cc_agent_files "$main"
    if [ "$journals" = --journals ] && [ -d "$dir/subagents/workflows" ]; then
      find "$dir/subagents/workflows" -mindepth 2 -maxdepth 2 -type f -name journal.jsonl 2> /dev/null < /dev/null
    fi
  } | LC_ALL=C sort
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
  find "$(cc_data_root)" \( -false "${names[@]}" \) -print 2> /dev/null < /dev/null | LC_ALL=C sort |
    while IFS= read -r path; do
      if [ -d "$path" ]; then
        for found in "$path"/agent-*.jsonl; do [ -f "$found" ] && printf '%s\n' "$found"; done
        [ "$journals" = --journals ] && [ -f "$path/journal.jsonl" ] && printf '%s\n' "$path/journal.jsonl"
      else
        printf '%s\n' "$path"
      fi
    done | awk -F/ '!seen[$NF]++ || $NF == "journal.jsonl"'
}

# cc_current_files: the current session (CLAUDE_CODE_SESSION_ID): its main transcript, then every
# transcript under its session directories; nothing when the variable is empty.
cc_current_files() {
  local id=${CLAUDE_CODE_SESSION_ID-} root dir
  [ -n "$id" ] || return 0
  root=$(cc_data_root)
  [ -d "$root" ] || return 0
  find "$root" -mindepth 2 -maxdepth 2 -type f -name "$id.jsonl" 2> /dev/null < /dev/null | LC_ALL=C sort | head -n 1
  for dir in "$root"/*/"$id"; do
    [ -d "$dir" ] && find "$dir" -type f -name '*.jsonl' ! -name journal.jsonl ! -path '*/tool-results/*' 2> /dev/null < /dev/null
  done | LC_ALL=C sort
}

# cc_resolve_all <session-reference>...: resolves each one (exiting like cc_resolve) into the array
# CC_FILES, in order, each file once.
cc_resolve_all() {
  local ref seen
  CC_FILES=()
  for ref in "$@"; do
    cc_resolve "$ref"
    for seen in ${CC_FILES[@]+"${CC_FILES[@]}"}; do [ "$seen" = "$CC_FILE" ] && continue 2; done
    CC_FILES+=("$CC_FILE")
  done
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

# cc_sessions_stopped <reason> <shown> <left> <next-size> <last-modified>: the notice of a cross-session
# command that applied the output budget itself and stopped reading, in the dispatcher's words.
cc_sessions_stopped() {
  local s=s
  [ "$2" -eq 1 ] && s=''
  if [ "$2" -eq 0 ]; then
    cc_notice "output stopped at $1 after 0 sessions; the next record is $4 characters; continue with --max-chars $4"
  else
    cc_notice "output stopped at $1 after $2 session$s; $3 older sessions left out; continue with --until $5"
  fi
}

# cc_sessions_by_mtime <from> <to>: the main transcripts under the data root modified inside the bounds
# (epoch seconds; empty for none), newest first, as "<pos>TAB<mtime>TAB<bytes>TAB<path>" lines.
cc_sessions_by_mtime() {
  find "$(cc_data_root)" -mindepth 2 -maxdepth 2 -type f -name '*.jsonl' ! -name 'agent-*' \
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
  find "$root" -mindepth 3 -path '*/subagents/*' -type f "${names[@]}" 2> /dev/null < /dev/null |
    awk '{ main = $0; sub(/\/subagents\/.*$/, ".jsonl", main); print main "\t" $0 }'
  cc_lines "$(find "$root" -mindepth 2 -maxdepth 2 -type f -name 'agent-*.jsonl' 2> /dev/null < /dev/null)"
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

# cc_jq_failed <status> <what>: after a failed cc_jq_program in a command substitution. Status 1 and 2
# were reported already (an unreadable file, a usage error found by the program); any other status is
# jq failing on the input, said in a sentence instead of jq's own words.
cc_jq_failed() {
  case $1 in 1 | 2) exit "$1" ;; esac
  cc_fail "could not read $2" "check that it is a Claude Code transcript"
}

# cc_jq_program <program> [<jq-option>...] -- <file|->...
# Runs jq with lib/ on the library path. Each file reaches the program through s::transcripts as one
# transcript object; files and agent meta files are passed with --rawfile, so stdin stays closed unless
# "-" is a file. One stat call covers every file, however many there are.
cc_jq_program() {
  local program=$1 file ctx='' sizes stated dir index=0 stdin=0 line stat_line meta
  local options=() raw=() files=() session_dirs=() entries=() stats=()
  shift
  while [ $# -gt 0 ] && [ "$1" != -- ]; do
    options+=("$1")
    shift
  done
  [ $# -gt 0 ] && shift
  for file in "$@"; do
    if [ "$file" = - ]; then
      stdin=1
      entries+=("$(printf '%s\t%s\t%s' - - file)")
      continue
    fi
    case $file in /*) ;; *) file=$PWD/$file ;; esac
    cc_readable "$file"
    cc_path_info "$file"
    files+=("$file")
    raw+=(--rawfile "__f$index" "$file")
    meta=-
    if [ -n "$CC_META_FILE" ] && [ -r "$CC_META_FILE" ]; then
      meta=__m$index
      raw+=(--rawfile "$meta" "$CC_META_FILE")
    fi
    entries+=("$(printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t@STAT@\t%s' "__f$index" "$file" "$CC_KIND" "${CC_SESSION_ID:--}" \
      "${CC_AGENT_ID:--}" "${CC_RUN_ID:--}" "${CC_SESSION_DIR:--}" "${CC_PROJECT_DIR:--}" "$meta")")
    index=$((index + 1))
    if [ -n "$CC_SESSION_DIR" ] && [ -d "$CC_SESSION_DIR/tool-results" ]; then
      for dir in ${session_dirs[@]+"${session_dirs[@]}"}; do [ "$dir" = "$CC_SESSION_DIR" ] && continue 2; done
      session_dirs+=("$CC_SESSION_DIR")
    fi
  done
  # stat skips a file that vanished, so each line is matched to its file by name.
  if [ $index -gt 0 ]; then
    cc_lines "$(stat -f '%z%t%m%t%N' -- "${files[@]}" 2> /dev/null < /dev/null)"
    stats=(${CC_LINES[@]+"${CC_LINES[@]}"})
  fi
  index=0
  for line in ${entries[@]+"${entries[@]}"}; do
    case $line in
      *@STAT@*)
        stat_line=$'-\t-'
        if [ ${#stats[@]} -gt 0 ] && [ "${stats[0]#*$'\t'*$'\t'}" = "${files[index]}" ]; then
          stat_line=${stats[0]%$'\t'*}
          stats=(${stats[@]+"${stats[@]:1}"})
        fi
        line=${line/@STAT@/$stat_line}
        index=$((index + 1))
        ;;
    esac
    ctx+=$line$'\n'
  done
  sizes=$(
    for dir in ${session_dirs[@]+"${session_dirs[@]}"}; do
      find "$dir/tool-results" -type f -exec stat -f '%z%t%N' {} + 2> /dev/null < /dev/null
    done
    if [ ${#files[@]} -gt 0 ]; then
      grep -h -o -e 'Full output saved to: [^"\\]*' -- "${files[@]}" 2> /dev/null < /dev/null | sort -u |
        while IFS= read -r stated; do
          stated=${stated#Full output saved to: }
          [ -f "$stated" ] && stat -f '%z%t%N' "$stated" 2> /dev/null < /dev/null
        done
    fi
  )
  if [ $stdin -eq 1 ]; then
    "$(cc_jq_binary)" -n -R -c -L "$CC_SESSIONS_LIB" --arg __ctx "$ctx" --arg __sizes "$sizes" \
      ${raw[@]+"${raw[@]}"} ${options[@]+"${options[@]}"} -- "$program"
  else
    "$(cc_jq_binary)" -n -R -c -L "$CC_SESSIONS_LIB" --arg __ctx "$ctx" --arg __sizes "$sizes" \
      ${raw[@]+"${raw[@]}"} ${options[@]+"${options[@]}"} -- "$program" < /dev/null
  fi
}

# cc_module_program <name> <call>: the text of lib/<name>.jq followed by the call, run as the main
# program. jq 1.8.2 aborts at compile time when a module that the program imports calls an s::
# function that calls another one, so a command module is never imported.
cc_module_program() {
  printf '%s\n%s\n' "$(< "$CC_SESSIONS_LIB/$1.jq")" "$2"
}

# cc_jq <filter> [<jq-option>...] -- <file|->... : the filter runs once per transcript object.
cc_jq() {
  local filter=$1
  shift
  cc_jq_program "import \"sessions\" as s; s::transcripts | ($filter)" "$@"
}
