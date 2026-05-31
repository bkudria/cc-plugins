# Skill Resource Usage Guide

How to effectively use the `references/`, `scripts/`, `workflows/`, and `assets/` directories within a Claude Code skill.

## Directory Purposes

- **references/** -- Documentation and reference material that Claude reads into context. Supplements SKILL.md with detailed information without bloating the main file.
- **scripts/** -- Executable code (bash, python) that Claude runs via the Bash tool. Automates repetitive or multi-step tasks.
- **workflows/** -- Multi-step process documents (`.md`) that Claude reads and follows, or executable **Workflow scripts** (`.js`) that Claude runs via the Workflow tool to offload long-running work to the background. See Background Workflow Scripts below.
- **assets/** -- Static files (templates, configs, data) used as output or input. These are NOT loaded into context automatically.

## When to Use Each

| Use Case | Directory | Example |
|----------|-----------|---------|
| Detailed docs too long for SKILL.md | references/ | API reference, checklists |
| Automated task | scripts/ | Scaffolding, validation, formatting |
| Multi-step process Claude follows | workflows/ | Phased create/audit procedures |
| Long-running or heavy task | workflows/ | Background investigation/analysis run via the Workflow tool |
| Template files to copy/customize | assets/ | Config templates, boilerplate |
| Static data files | assets/ | Word lists, schema definitions |

## References Best Practices

- One topic per file.
- Name descriptively (`api-reference.md`, not `ref1.md`).
- Start with a title heading matching the topic.
- Keep focused -- if a reference exceeds 300 lines, split it into separate files.
- Always mention references in SKILL.md with a reference table so Claude knows when to consult them.
- Use progressive disclosure: SKILL.md has the summary, the reference file has the detail.

## Scripts Best Practices

- Include a shebang line (`#!/usr/bin/env bash`).
- Set strict mode (`set -euo pipefail`).
- Include a usage comment at the top describing purpose and arguments.
- Accept arguments for flexibility rather than hardcoding values.
- Print clear status messages so Claude can interpret results.
- Use exit codes properly: 0 for success, non-zero for errors.
- Make scripts executable (`chmod +x`).
- Document each script in SKILL.md's script reference table.

Example header:

```bash
#!/usr/bin/env bash
# Usage: scaffold-component.sh <name> [--with-tests]
# Creates a new component with optional test file.
set -euo pipefail
```

## Background Workflow Scripts

When a skill's core task is long-running or heavy -- multi-area investigation, large-scale analysis, anything that would otherwise monopolize the main agent's turn or bloat its context -- offload it to a background **Workflow** script: a `.js` file under `workflows/` that the skill invokes via the Workflow tool. The skill itself stays thin: it delegates, waits, and presents.

The skill must follow this contract:

1. **Invoke, don't inline.** The skill calls the Workflow tool with the script path and args; it does not perform the heavy work itself.
2. **The immediate return is a task id, not the result.** The Workflow tool is non-blocking -- it returns a task identifier right away, and the real output arrives later as a separate completion notification. A skill that treats the first return as the answer will present nothing, or fabricate.
3. **Wait for genuine completion.** After invoking, the skill stops and waits for the completion notification before doing anything else. (The SDK holds the turn open while a background task is pending.)
4. **Read the canonical artifact, not the notification.** Completion notifications truncate long string fields (~3900 chars), so a large result embedded in the notification arrives cut off. Have the script write its full output to a canonical file (a fixed `outPath`) and have the skill Read that file for the complete result. Scalar notification fields (counts, paths, status) survive intact and are safe to branch on.
5. **Present verbatim; never fabricate.** The skill presents what it read. If the file is missing or empty, it says so -- it does not invent a plausible-looking result.

Constraints inside the script:

- Workflow scripts run in a sandboxed JS context with **no filesystem or Node API access**. To write the canonical output file, the script delegates the write to a subagent within the workflow (which has tool access) rather than calling `fs` directly.
- Parse `args` defensively: a script may receive `args` as a JSON string rather than an object. Accept string-or-object, validate required fields, and return a structured error (not a crash) when they are missing.

Why this shape: the heavy work runs out-of-band without blocking or bloating the main agent's context; the skill's own logic stays small and testable (delegate -> wait -> read -> present); and the canonical file is a durable artifact the user or a follow-up skill can re-open. List the script in SKILL.md's resource table like any other workflow. For how to eval a workflow-delegating skill, see the claude-code-evals skill's `references/config-type-patterns.md`.

## Assets Best Practices

- Assets are NOT read into context automatically -- they do not consume context budget.
- Use the Write tool or scripts to copy and customize them for the user.
- Name files with the intended output format (`template.yml`, not `template.txt`).
- Include placeholder markers (`TODO`, `{{variable}}`) so Claude knows what to fill in.
- Assets have no size limit since they are not loaded into context.

## File Size Guidelines

| File Type | Recommended Max | Reason |
|-----------|----------------|--------|
| SKILL.md | 300 lines | Context budget; this is always loaded |
| Single reference | 300 lines | Focus and readability; split if larger |
| Script | 200 lines | Maintainability; decompose if larger |
| Asset | No limit | Not loaded into context |

## How They Work Together

A typical skill uses all three directories in concert:

1. **SKILL.md** provides the high-level instructions and a table listing available references, scripts, and assets.
2. **references/** files are read on demand when Claude needs deeper detail on a topic mentioned in SKILL.md.
3. **scripts/** are invoked via the Bash tool to automate tasks described in SKILL.md.
4. **assets/** are copied or transformed by scripts or the Write tool to produce final output.

## Key Trade-offs

- Putting too much in SKILL.md wastes context on every invocation. Move detail to references.
- Putting too little in SKILL.md means Claude may not know a reference or script exists. Always include a summary table.
- Scripts add power but add maintenance burden. Use them for tasks that are repetitive, error-prone, or require exact formatting.
- Assets are free in terms of context cost but invisible to Claude unless SKILL.md describes them.
