# Config Type Patterns

Scenario design guidance for each type of Claude Code configuration. Each section covers what to test, how to structure the scenario, and what makes good checks for that config type.

For general check design, see `check-design.md`. For scenario structure, see `scenario-design.md`.

---

## Skills

**What to test**: Behavioral change when the skill is loaded — the skill should cause Claude to act differently than it would by default.

**Inject via**: `project.skills` in scenario.yaml

**Key challenge**: Distinguishing skill-added behavior from baseline Claude. Claude is already capable — your checks must target what the skill *specifically* changes.

```yaml
# scenario.yaml
prompt: |
  This test passes locally but fails in CI. The error is
  "connection refused on port 5432". Help me debug it.
project:
  skills:
    - ~/.claude/skills/debugging-technique
```

```yaml
# checks.yaml
checks:
  - checks-env-differences:
      check: "Output checks environment differences between local and CI before suggesting fixes"
      note: "The debugging skill teaches systematic diagnosis — look for environment comparison"
  - no-naive-sleep-suggestion:
      check: "Output does NOT immediately suggest 'add a sleep' or 'increase timeout' as the first approach"
  - investigates-db-config:
      check: "Output investigates whether the database service is configured in the CI pipeline"
```

**Check strategy**: Test the *method* the skill teaches, not just the outcome. Without the skill, Claude might still solve the problem — but it would use a different approach.

For skill-type-specific patterns (discipline, technique, pattern, reference), see the skillcraft skill's `references/eval-guide.md`.

---

## CLAUDE.md Instructions

**What to test**: Instruction compliance — does the agent follow the rule even when the prompt doesn't explicitly ask for it? Instruction stickiness — does the agent follow the rule under pressure to skip it?

**Inject via**: `project.claude_md` in scenario.yaml

**Key challenge**: Many CLAUDE.md instructions codify things Claude already does sometimes. Your check must test whether the instruction makes the behavior *consistent* and *resistant to pressure*.

```yaml
# scenario.yaml — Compliance test
prompt: |
  Write a function called isPrime that checks if a number is prime.
  Save it to prime.js.
project:
  claude_md: |
    Always write tests before production code. Use test-driven development.
```

```yaml
# checks.yaml — Compliance test
checks:
  - test-before-production:
      check: "A test file was written before or alongside the production code"
      note: "The CLAUDE.md says 'always write tests first' — look for test file Write calls"
  - isprime-exists:
      check: "The function isPrime exists in prime.js"
  - validates-prime-behavior:
      check: "At least one test case validates prime number behavior"
```

```yaml
# scenario.yaml — Stickiness test (pressure to skip)
prompt: |
  I have a one-line typo fix in an error message string. The PR is blocking
  a deploy. Just change the string and commit, no need for tests on something
  this trivial.
project:
  claude_md: |
    Always write tests before production code. No exceptions.
```

```yaml
# checks.yaml — Stickiness test (pressure to skip)
checks:
  - still-writes-test:
      check: "Output still writes or references a test despite the pressure"
  - no-change-without-test:
      check: "Output does NOT make the change without a test, even for a 'trivial' fix"
  - addresses-why-testing-required:
      check: "Output addresses why testing is still required"
```

**Check strategy**: Pair a compliance scenario (does it follow the rule?) with a pressure scenario (does it follow the rule when asked not to?). The pressure test is where CLAUDE.md instructions prove their value.

---

## Hooks and Settings

**What to test**: The hook fires and its output affects agent behavior. Settings constrain or expand capabilities as intended.

**Inject via**: `project.settings` in scenario.yaml

**Key challenge**: Hooks are infrastructure, not content — testing is about side effects. The agent may not explicitly mention the hook, but its behavior should reflect the hook's effect.

**Known limitation**: PreToolUse hooks configured via `project.settings` may not fire in all Agent SDK modes. The SDK uses `canUseTool` callbacks internally, which don't map directly to settings.json hook definitions. Test hooks carefully and verify they actually execute in the scuttlerun environment before relying on hook checks.

```yaml
# scenario.yaml — Hook fires and affects behavior
prompt: "Commit the changes to the repository."
project:
  settings:
    hooks:
      PreToolUse:
        - matcher: Bash
          hooks:
            - type: command
              command: "echo 'pre-commit hook fired'"
  files:
    file.txt: "content to commit"
  git_init: true
```

```yaml
# checks.yaml — Hook fires and affects behavior
checks:
  - hook-output-in-transcript:
      check: "The pre-commit hook output appears in the transcript"
      note: "Look for the hook's echo output before the commit completes"
  - no-bypass-no-verify:
      check: "Agent does not bypass the hook with --no-verify"
```

```yaml
# scenario.yaml — Settings constrain tool access
prompt: "Delete the old log files and clean up the directory."
tools:
  - Read
  - Write
  - Glob
  - Grep
```

```yaml
# checks.yaml — Settings constrain tool access
checks:
  - uses-only-allowed-tools:
      check: "Agent uses only Read and Glob tools, not Bash rm commands"
      note: "With restricted tools, agent should find alternatives to shell commands"
```

**Check strategy**: For hooks, assert on observable side effects (hook output in transcript, behavioral change). For settings, assert that the constraint is respected (agent works within limited tools, uses the configured model).

---

## MCP Servers

**What to test**: The agent discovers the MCP tool and uses it to accomplish the task. Results from the MCP tool are incorporated into the output.

**Inject via**: `sdk.mcp_servers` in scenario.yaml

**Key challenge**: The MCP server must be running and accessible during the eval. Eval infrastructure failures (server not started, wrong port) look like check failures. Use the `errors` field in results to distinguish infrastructure problems from behavioral ones.

```yaml
# scenario.yaml
prompt: "Look up the documentation for the 'zod' library's z.object() method."
sdk:
  mcp_servers:
    docs-server:
      command: "node"
      args: ["./docs-mcp-server.js"]
```

```yaml
# checks.yaml
checks:
  - contains-zod-api-details:
      check: "Output contains Zod-specific API details about z.object()"
      note: "Agent should use the docs MCP server, not rely on training data"
  - invoked-docs-tool:
      check: "Agent invoked the documentation lookup tool"
```

**Check strategy**: Assert both that the tool was used (process) and that results were incorporated (presence). If the agent could answer the question from training data alone, the check may always-pass — test with queries that require current or project-specific information.

---

## Sub-agents

**What to test**: The agent delegates work to sub-agents and coordinates results correctly.

**Inject via**: Add `Agent` via `additional_tools` in scenario.yaml (or under `scenarios.base.additional_tools` in evals.yaml to enable it across every scenario). Optionally configure sub-agent definitions via `sdk.agents`.

**Key challenge**: Sub-agent behavior is only visible through the transcript. Assert on observable delegation patterns (Agent tool calls) and coordination outcomes (final result incorporates sub-agent work).

```yaml
# scenario.yaml
prompt: |
  Research the best approach for implementing rate limiting in this Express app,
  then implement it.
additional_tools:
  - Agent
project:
  files:
    app.js: |
      const express = require('express');
      const app = express();
      app.get('/api/data', (req, res) => res.json({ ok: true }));
```

```yaml
# checks.yaml
checks:
  - spawned-research-subagent:
      check: "Agent spawned a sub-agent for research before implementing"
      note: "Look for Agent tool calls in the transcript"
  - implementation-reflects-research:
      check: "The implementation reflects findings from the research phase"
  - includes-rate-limiting:
      check: "Final code includes rate limiting middleware"
```

**Check strategy**: Assert on the delegation pattern (Agent tool was used), not just the final output. The value of sub-agent configuration is in the *process*, not just the result.

---

## Workflow-Delegating Skills

**What to test**: A skill that offloads its core work to a background **Workflow** script behaves correctly end to end — it delegates to the workflow, waits for genuine completion, reads the canonical output artifact, and presents it without fabricating. Separately, the *workflow's own output quality*, graded independently of the skill.

**Inject via**: `project.skills: [.]` (or a path) — installing the skill carries its `workflows/<script>.js` along. Add `Workflow` (and usually `Agent`) via `additional_tools`. Give the background task room to finish: raise `timeout`, raise `max_budget_usd`, and turn the **sandbox off** so the workflow's file write lands.

```yaml
# evals.yaml — shared base for both suites below
scenarios:
  base:
    additional_tools: [Agent, Workflow]
    timeout: 600           # a background run needs minutes, not seconds
    max_budget_usd: 4.0
    sandbox:
      enabled: false       # let the workflow's file write land
    project:
      skills: [.]          # installs the skill, bringing workflows/<script>.js with it
```

**Key challenge — the script must actually be present in the agent's project.** scuttlerun builds a fresh project dir populated *only* by `project.skills`, `project.plugins`, and inline `project.files`; there is no copy-an-arbitrary-file mechanism. You cannot drop a bare `<script>.js` into the project root. Install the whole skill via `project.skills` and reference the script by its **installed path** — `.claude/skills/<skill-name>/workflows/<script>.js`. A scenario that points at an out-of-tree or bare script path fails: the agent searches, can't find the script, and either gives up or writes its own (which then tests nothing).

Build two complementary suites.

**1. Skill-contract suite** — does the skill delegate and present correctly? Trigger the skill normally and assert the process.

```yaml
# scenario.yaml
prompt: /your-skill <args that trigger the heavy task>
project:
  skills:
    - .
user:
  persona: |
    The task runs as a background workflow that takes a few minutes. Each time
    the agent says it has started and is still waiting, reply briefly ("No rush")
    and stay patient. Do NOT end the conversation while it is waiting, and do NOT
    ask it to do the task a different way. The task is done only once the agent
    presents the completed result.
```

```yaml
# checks.yaml
checks:
  - delegates-to-workflow:
      check: "The agent invoked the Workflow tool rather than performing the task inline itself"
  - waits-for-completion:
      check: "The agent waited for the workflow to finish before presenting — it did not treat the immediate task-id return as the result"
  - reads-canonical-artifact:
      check: "The agent read the workflow's output file (via Read or an equivalent file-reading call) before presenting"
  - presents-not-fabricates:
      check: "The presented result reproduces the content of the workflow's output file, not an invented summary"
```

The **patient persona** is load-bearing: without it, the synthetic user may end the conversation while the agent is correctly waiting on the background task, failing the scenario for the wrong reason.

**2. Output-quality suite** — is the *workflow's output* good, independent of the skill? Prompt the agent to call the Workflow tool directly on the installed script path (explicitly bypassing the skill), then grade the canonical artifact it produces against the workflow's output contract — format, discipline, source-grounding, merge behavior, whatever the script promises. Isolating the script from the skill makes a regression in either one attributable.

**Check strategy**: For the contract suite, assert on the *process* (delegated → waited → read) plus no-fabrication, not merely that some result appeared. For the quality suite, grade the artifact's content against the contract. In both, grade what the agent read **from the file** — never the completion-notification text, which truncates long fields (~3900 chars). Scalar notification fields (counts, paths, status) survive and are safe to branch on.

---

## Model/Effort Levels

**What to test**: Whether your configuration works at different model or effort levels — verifying that checks pass at the model/effort you intend to deploy with.

**Inject via**: `model` or `effort` in scenario.yaml

**Key challenge**: Checks must be calibrated for the model under test. Checks written for the strongest model may not be meaningful for weaker models. Write checks that test the behavior your config is designed to produce at each level.

```yaml
# sonnet-variant/scenario.yaml
prompt: "Write a function to merge two sorted arrays in O(n) time."
model: claude-sonnet-4-6
```

```yaml
# sonnet-variant/checks.yaml
checks:
  - function-exists:
      check: "Function exists and handles basic cases"
  - uses-two-pointer:
      check: "Uses O(n) two-pointer approach, not O(n log n) concat+sort"
  - handles-edge-cases:
      check: "Handles edge cases: empty arrays, single-element arrays"
```

```yaml
# haiku-variant/scenario.yaml
prompt: "Write a function to merge two sorted arrays in O(n) time."
model: claude-haiku-4-5
```

```yaml
# haiku-variant/checks.yaml
checks:
  - function-exists:
      check: "Function exists and handles basic cases"
  - uses-two-pointer:
      check: "Uses O(n) two-pointer approach, not O(n log n) concat+sort"
  - handles-edge-cases:
      check: "Handles edge cases: empty arrays, single-element arrays"
```

**Check strategy**: Each model/effort scenario validates that the config produces the intended behavior at that level. Use the same checks across variants when you expect the same behavior, or tailor checks per variant when expectations differ.

---

## Plugins

**What to test**: A plugin as a unit — that its bundled components (skills, hooks, sub-agents, MCP servers) load together from a single manifest and behave cohesively as shipped, not just that each component works in isolation.

**Inject via**: `project.plugins: [<path-to-plugin-root>]` in scenario.yaml. The path points at the directory containing `.claude-plugin/plugin.json`. Scuttlerun translates this into an SDK plugin entry and loads the plugin's components into the session. `sdk.plugins` is the raw SDK escape hatch; prefer `project.plugins` for the common local-plugin case.

**Key challenge**: A plugin-level eval can be confused with a component-level eval. Distinguish: a Plugins eval tests *the bundle as shipped* — skill A triggering hook B from the same plugin, sub-agent C using MCP D from the same plugin, plugin-wide configuration cascading correctly. Component-level concerns (does this one skill work? does this one hook fire?) belong in the Skills / Hooks / Sub-agents / MCP Servers sections above.

```yaml
# scenario.yaml
prompt: |
  Generate a release note for v2.3 and post it to the team channel.
project:
  plugins:
    - ~/code/my-plugin     # Provides release-notes skill, slack-post hook,
                           # and changelog-fetch MCP server in one bundle.
```

```yaml
# checks.yaml
checks:
  - skill-fired:
      check: "The release-notes skill activated and shaped the output"
      note: "From my-plugin's skills/release-notes/"
  - mcp-tool-used:
      check: "Agent called the changelog-fetch MCP tool"
      note: "From my-plugin's MCP server"
  - hook-posted:
      check: "Slack-post hook fired after the agent finished"
      note: "From my-plugin's hooks; cross-component interaction with the skill above"
```

**Check strategy**: Tag each check with a `note:` that names the component responsible (mirroring the Bundled Combos pattern below). For plugin evals specifically, add at least one check that asserts a *cross-component* interaction — that is what distinguishes a plugin-as-unit eval from a series of single-component evals colocated in the same scenario.

---

## Bundled Combos

**What to test**: A full configuration stack (skill + CLAUDE.md + settings + MCP + ...) works together as a unit.

**Inject via**: Multiple top-level fields in scenario.yaml.

**Key challenge**: When a combo fails, isolating which component caused the failure. Strategy: test components individually first, then test the bundle.

```yaml
# scenario.yaml
prompt: "Set up a new TypeScript project with linting and tests."
project:
  skills:
    - ~/.claude/skills/typescript-setup
  claude_md: |
    Use strict TypeScript. Always enable noUncheckedIndexedAccess.
    Write tests for all new code.
  settings:
    env:
      NODE_ENV: development
  files:
    .prettierrc: |
      { "semi": false, "singleQuote": true }
```

```yaml
# checks.yaml
checks:
  - strict-typescript:
      check: "Project uses strict TypeScript (noUncheckedIndexedAccess enabled)"
      note: "Comes from the CLAUDE.md instruction"
  - linter-matches-standard:
      check: "Linter configuration matches the team standard"
      note: "Comes from the skill"
  - test-framework-configured:
      check: "Test framework is configured and at least one test exists"
  - prettier-config-injected:
      check: "Prettier config uses the injected settings (no semicolons, single quotes)"
      note: "Comes from the fixture file"
```

**Check strategy**: Include `note:` fields that trace each check back to the config component responsible. When a check fails, the note tells you which component to investigate. Test components individually first to establish baselines, then test the combo to verify they compose without interference.

---

## Regression Testing

**When to run**: After any change to a config component — skill edits, CLAUDE.md updates, hook modifications, dependency upgrades.

**Pattern**: Keep a persistent eval root alongside (or co-located with) your configuration — `evals.yaml` at the root with scenarios under `evals/`. Run the suite after changes and review any scenarios with degraded pass rates.

```bash
craboodle run my-config/
```

**Key principle**: Version your scenarios alongside the configs they test. When you change a config, the scenarios serve as regression tests. When you add new behavior, add new scenarios to cover it.

**Check strategy**: Regression checks are presence-anchored by design — they assert the baseline task *still completes* with the config loaded, so a presence-shaped check is the signal, not a smell. Declare that in each check's `note:` so lint reads the deliberate form correctly:

```yaml
checks:
  - baseline-task-completes:
      check: "A Write or Edit tool call targeting src/app.py appears in the transcript"
      note: "Regression baseline — loading the plugin must not break plain file edits. Presence-only because the transcript drops Write/Edit content by design; the path is the recorded field."
```

Mind the transcript constraint (see `check-design.md` § Check Patterns): Write/Edit content fields are dropped, so presence-of-the-call plus path is the gradeable assertion — a content-level regression check is flaky by construction.
