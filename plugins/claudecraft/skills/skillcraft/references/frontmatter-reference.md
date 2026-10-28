# Skill Frontmatter Reference

Complete catalog of all valid YAML frontmatter fields for Claude Code SKILL.md files, matching the frontmatter reference at https://code.claude.com/docs/en/skills.

Frontmatter is a YAML block at the top of SKILL.md, delimited by `---`:

```yaml
---
name: my-skill
description: What this skill does
---
```

---

## Fields

### name

- **Type**: string
- **Constraint**: hyphen-case, lowercase, max 64 characters
- **Default**: Parent directory name
- **Description**: Unique identifier for the skill. Used in `/name` invocation and skill system references.
- **When to use**: Always include. Must match the directory name.
- **Example**: `name: docker-helper`
- **Trade-offs**: Short names are easier to type but less descriptive. Prefer clarity over brevity.

### description

- **Type**: string
- **Constraint**: 10-1024 characters
- **Default**: None (strongly recommended)
- **Description**: Tells Claude when to auto-load this skill. The most important field for discoverability. Include specific trigger phrases — verb+noun combinations that match what users say or do.
- **When to use**: Always include. Write as if answering "When should Claude load this skill?"
- **Example**: `description: Reference for Docker commands and Dockerfile best practices. Use when writing Dockerfiles, debugging container issues, optimizing Docker builds, or configuring multi-stage builds.`
- **Trade-offs**: Longer descriptions with more trigger phrases improve auto-triggering but consume more metadata space. Aim for 3-5 specific trigger phrases.

### when_to_use

- **Type**: string
- **Default**: None
- **Description**: Extra context for when Claude should invoke the skill, such as trigger phrases or example requests. Appended to `description` in the skill listing; the combined text is truncated at 1,536 characters.
- **When to use**: When trigger phrases would crowd the `description`. Keep the key use case in `description` and move the trigger list here.
- **Example**: `when_to_use: Triggers on "audit this project", "check compliance", "scaffold project".`
- **Trade-offs**: Counts toward the same 1,536-character listing cap as `description`.

### disable-model-invocation

- **Type**: boolean
- **Default**: `false` (auto-triggering enabled)
- **Description**: When `true`, Claude will never auto-load this skill. The skill can only be invoked manually via `/skill-name`.
- **When to use**: Set `true` for heavy workflows (wizards, multi-step processes) that shouldn't fire automatically. Keep `false` for knowledge and reference skills.
- **Example**: `disable-model-invocation: true`
- **Trade-offs**: Disabling auto-invocation means the skill is only useful if the user knows it exists. Good for heavy workflows, bad for reference material.

### user-invocable

- **Type**: boolean
- **Default**: `true`
- **Description**: When `true`, the skill appears as a `/skill-name` command. When `false`, the skill is hidden from the `/` menu but Claude can still auto-trigger it. Note: `user-invocable` only controls menu visibility, not Skill tool access. Use `disable-model-invocation: true` to block programmatic invocation.
- **When to use**: Set `false` for internal/helper skills that other skills depend on but users shouldn't invoke directly.
- **Example**: `user-invocable: false`
- **Trade-offs**: Non-user-invocable skills are invisible to the user. Combined with `disable-model-invocation: true`, the skill becomes completely invisible (anti-pattern #10).

### allowed-tools

- **Type**: string (space- or comma-separated) or YAML list of tool names or permission rules
- **Default**: None (normal permission prompts apply)
- **Description**: Tools Claude can use **without asking permission** during the turn that invokes the skill. It pre-approves; it does not restrict. Tools not listed stay available under the session's normal permission rules. The grant clears when the user sends their next message.
- **When to use**: When the skill reliably runs specific commands or scripts and prompting for each would interrupt it, e.g. the skill's own bundled scripts.
- **Example**: `allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/run.sh *), Read`
- **Trade-offs**: Every entry runs without a prompt, so scope entries narrowly (a specific script pattern rather than bare `Bash`). To remove tools, use `disallowed-tools`.

### disallowed-tools

- **Type**: string (space- or comma-separated) or YAML list of tool names
- **Default**: None
- **Description**: Tools removed from Claude's available pool while the skill is active. The restriction clears when the user sends their next message.
- **When to use**: When the skill must never call certain tools, e.g. `AskUserQuestion` in an autonomous loop, or `Write`/`Edit` in a read-only reference skill.
- **Example**: `disallowed-tools: AskUserQuestion`
- **Trade-offs**: Removing a tool the instructions rely on breaks the skill. Cannot remove `EndConversation` while any other tool remains.

### model

- **Type**: string
- **Default**: The session model
- **Description**: Model to use while the skill is active, for the rest of the current turn; the session model resumes on the next prompt. Accepts the same values as `/model` (aliases like `sonnet`, `opus`, `haiku`, or full model IDs), or `inherit`. With `context: fork`, sets the forked subagent's model.
- **When to use**: Rarely. Use a smaller model for simple, fast tasks or a larger one for complex reasoning. Document the rationale.
- **Example**: `model: haiku`
- **Trade-offs**: Model overrides affect cost and capability. A value excluded by the organization's model allowlist is ignored.

### effort

- **Type**: string: `low`, `medium`, `high`, `xhigh`, or `max`
- **Default**: The session's effort level
- **Description**: Effort level while the skill is active. Overrides the session effort level. Available levels depend on the model.
- **When to use**: When the skill's work needs more (or less) thoroughness than the session default, e.g. `high` for careful audits.
- **Example**: `effort: high`
- **Trade-offs**: Higher effort costs more tokens and time; lower effort means more early stopping.

### context

- **Type**: string
- **Default**: None (runs inline in the main conversation)
- **Description**: Set to `fork` to run the skill in a forked subagent context. The subagent runs in the background by default; set `background: false` to wait for its result in the invoking turn.
- **When to use**: For reference-heavy skills or many exploratory reads you don't want cluttering the main context.
- **Example**: `context: fork`
- **Trade-offs**: The forked subagent can only return its final output to the main conversation.

### agent

- **Type**: string
- **Default**: None
- **Description**: Which subagent type to use when `context: fork` is set: a built-in type such as `Explore`, `Plan`, or `general-purpose`, or a custom agent name. Has no effect without `context: fork`.
- **When to use**: When the forked task matches an agent's specialty, e.g. `Explore` for codebase research.
- **Example**: `agent: Explore`
- **Trade-offs**: Agent types have different tool access; `Explore` and `Plan` cannot edit files.

### background

- **Type**: boolean
- **Default**: `true`
- **Description**: Only applies with `context: fork`. Set to `false` to wait for the forked subagent's result in the turn that invoked the skill, instead of running it in the background.
- **When to use**: When the invoking turn needs the skill's result before continuing.
- **Example**: `background: false`
- **Trade-offs**: Waiting blocks the main conversation until the subagent finishes.

### argument-hint

- **Type**: string
- **Default**: None
- **Description**: Hint text shown after the `/skill-name` command to indicate expected arguments. Displayed in the skill list and autocomplete.
- **When to use**: When the skill accepts arguments via `$ARGUMENTS`. Describe what the argument should be.
- **Example**: `argument-hint: "[path to file]"`
- **Trade-offs**: None — always include if the skill uses `$ARGUMENTS`.

### arguments

- **Type**: space-separated string or YAML list
- **Default**: None
- **Description**: Named positional arguments for `$name` substitution in the skill content. Names map to argument positions in order.
- **When to use**: When the skill takes several positional arguments and named placeholders read better than `$1`, `$2`.
- **Example**: `arguments: issue branch`
- **Trade-offs**: None beyond keeping `argument-hint` consistent with the names.

### hooks

- **Type**: object
- **Default**: None
- **Description**: Define pre/post hooks that run shell commands around tool calls. Follows the Claude Code hooks schema.
- **When to use**: When the skill needs to run setup/teardown around specific tool calls, or enforce constraints.
- **Example**:
  ```yaml
  hooks:
    PreToolUse:
      - matcher: Bash
        hooks:
          - type: command
            command: echo "About to run bash"
  ```
- **Trade-offs**: Hooks add complexity. Use sparingly and test thoroughly.

### paths

- **Type**: comma-separated string or YAML list of glob patterns
- **Default**: None (the skill can load for any file)
- **Description**: Limits automatic loading to when Claude is working with files matching the patterns. Patterns are relative to the current working directory and use the same glob format as path-specific rules.
- **When to use**: When the skill only applies to part of a repository, e.g. `src/**` or `**/*.tf`.
- **Example**: `paths: "src/**"`
- **Trade-offs**: Files outside the working directory never match, so the skill won't auto-load for them.

### shell

- **Type**: string: `bash` or `powershell`
- **Default**: `bash`
- **Description**: Shell used for `` !`command` `` and ` ```! ` blocks in the skill.
- **When to use**: Only for Windows-oriented skills that need PowerShell.
- **Example**: `shell: powershell`
- **Trade-offs**: `powershell` needs the PowerShell tool enabled, which is off by default on macOS and Linux.

### metadata

- **Type**: map
- **Default**: None
- **Description**: Free-form key-value data for your own tooling. Claude Code doesn't act on it and drops a value that isn't a map.
- **When to use**: For catalog or ownership fields read by your own scripts.
- **Example**: `metadata: { owner: platform-team }`
- **Trade-offs**: Don't reuse frontmatter field names (such as `paths`) as keys.

### license

- **Type**: string
- **Default**: None
- **Description**: License covering the skill, from the Agent Skills spec. Claude Code accepts it but doesn't act on it.
- **When to use**: For skills shared outside your own setup.
- **Example**: `license: MIT`
- **Trade-offs**: None.

### compatibility

- **Type**: string (up to 500 characters)
- **Default**: None
- **Description**: Environment requirements, such as intended products or system prerequisites, from the Agent Skills spec. Claude Code accepts it but doesn't act on it.
- **When to use**: For skills shared across tools that read the Agent Skills spec.
- **Example**: `compatibility: Requires jq and a POSIX shell`
- **Trade-offs**: None.

---

## String Substitutions

Use these placeholders in SKILL.md body text — they're replaced at load time.

| Placeholder | Replaced With | Example Use |
|-------------|--------------|-------------|
| `$ARGUMENTS` or `{{ARGUMENTS}}` | Text after `/skill-name ` | Pre-fill inputs from user's command |
| `$1`, `$2`, etc. | Positional arguments (space-separated) | Parse structured arguments |
| `$name` | The argument named `name` in the `arguments` field | Readable placeholders for positional arguments |
| `${CLAUDE_SESSION_ID}` | Current session UUID | Generate unique temp files |
| `${CLAUDE_SKILL_DIR}` | Directory containing the skill's SKILL.md | Reference bundled scripts/files regardless of CWD |

### Usage Pattern

```markdown
## Arguments: $ARGUMENTS

If arguments were provided, parse them as: ...
```

---

## Dynamic Context

Embed command output in the SKILL.md **body text** using backtick-bang syntax (`` !`command` ``). Commands run at load time as preprocessing — their output replaces the placeholder before Claude sees the content.

```markdown
Current git branch: !`git branch --show-current`
Recent commits: !`git log --oneline -5`
```

**Guidelines**:
- Commands must be fast (< 1 second)
- Limit output size — pipe through `head` or `tail` if needed
- Use for: current state (branch, directory), available tools, environment detection

---

## Progressive Disclosure Strategy

Structure skill files for optimal context usage:

| File | Content | Target Length |
|------|---------|--------------|
| SKILL.md | Workflow, quick reference, links | 100-300 lines |
| references/*.md | Detailed specifications, catalogs | 100-400 lines each |
| scripts/*.sh | Executable automation | As needed |

**Principle**: SKILL.md is always loaded. References are loaded on demand. Keep SKILL.md lean so the common case is fast; put depth in references/ for when it's needed.

---

## Common Field Combinations

| Skill Type | Typical Frontmatter |
|------------|-------------------|
| Knowledge/Reference | `name`, `description` (rich triggers) |
| Heavy Workflow | `name`, `description`, `disable-model-invocation: true`, `argument-hint` |
| Read-only Reference | `name`, `description`, `disallowed-tools: Write, Edit, NotebookEdit` |
| Forked Research | `name`, `description`, `context: fork`, `agent: Explore` |
| Internal Helper | `name`, `description`, `user-invocable: false` |
