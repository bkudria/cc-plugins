# sessions

Investigate past Claude Code sessions from their transcripts.

Claude Code keeps every session as JSONL under `~/.claude/projects/` (or `$CLAUDE_CONFIG_DIR/projects/`). Questions about
earlier work can only be answered from those files: what a session decided, why an agent took a step, which skills it
loaded, what a sub-agent concluded, where the tokens went. The files are large, mostly harness bookkeeping, and in an
internal format that changes between releases. [GOALS.md](GOALS.md) says what that makes hard.

## What's in this plugin

- **`cc-sessions`**, a read-only CLI for agents. It reads the current transcript format correctly, keeps every answer
  inside an output budget and says how to continue, and gives each record a handle (its line number) that other commands
  accept. Its commands:

  | Command | Answers |
  |---|---|
  | `list` | which sessions exist, filtered by text, skill, directory, time or origin |
  | `search` | where text appears, across sessions or inside one |
  | `overview` | what a session is: ids, cwd, models, time, tokens, tools, skills, agents, errors |
  | `prompts` | what the human did: inputs, answers, denials, plan decisions, interrupts |
  | `conversation` | what was said, turn by turn |
  | `tools` | which tools ran, each call paired with its result |
  | `agents` | the session's sub-agents, teammates, forks and workflow runs, with status and results |
  | `entry` | one entry in full, with its parent chain |
  | `schema` | which entry types and keys transcripts contain, flagging ones the CLI does not know |
  | `jq` | anything else: jq with the transcript library loaded |

  `cc-sessions --help` and `cc-sessions <command> --help` are the reference for every option and output field.

## Requirements

- macOS (Linux may work but is not tested)
- bash 3.2 or later, jq 1.7 or later, and [ripgrep](https://github.com/BurntSushi/ripgrep) for `list` and `search`

`cc-sessions --help` ends with a line reporting whether jq and ripgrep are usable.

## Usage

    /plugin install sessions@bkudria-cc-plugins

While the plugin is enabled, Claude Code puts its `bin/` directory on `PATH`, so `cc-sessions` runs as a plain command
in the session's Bash tool. `cc-sessions list` shows the newest sessions; `current` names the running session.

## How it works

[SPEC.md](SPEC.md) defines the semantics: how entries group into API messages, which entries are human input, how skill
loads, sub-agents, workflow runs and saved tool outputs are recognised, and the output format. `lib/sessions.jq` holds
those rules as one jq module; each command is a small script in `libexec/` over it.

## Development

    scrut test plugins/sessions/tests

The tests need [scrut](https://github.com/facebookincubator/scrut) 0.5.0 and shellcheck besides the requirements above.
They run against a synthetic transcript tree in `tests/fixtures/config/`, described in
[tests/fixtures/FACTS.md](tests/fixtures/FACTS.md). The fixtures hold no real transcript content. CI runs the suite on
macOS with both the Homebrew jq and the jq that ships with macOS.

## License

[MIT](LICENSE)
