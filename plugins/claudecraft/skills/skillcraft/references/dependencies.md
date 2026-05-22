# Skill Dependencies Guide

How to declare, check, and manage dependencies in Claude Code skills.

## Types of Dependencies

| Type | Example | How to Declare |
|------|---------|---------------|
| External CLI tool | `jq`, `yq`, `gh` | `## Dependencies` section in SKILL.md |
| Other skill | `claude-code-evals`, `skillcraft` | `## Dependencies` section in SKILL.md |
| System command | `git`, `python3`, `node` | Usually implicit; document if non-obvious |
| File/config | `.env`, `package.json` | `context` field or note in SKILL.md |

## Declaring Dependencies

Add a `## Dependencies` section near the bottom of SKILL.md.

**Ordering convention** — list external CLIs (with `brew install` or equivalent install instructions) first, then skill dependencies. The rationale: external CLIs are install-layer prerequisites the user must satisfy on the host before the skill can run, while skill dependencies are resolved at use-time by Claude's skill loader. Putting installable prerequisites first matches a reader skimming "Do I have what this skill needs?" — they answer the install-time question, then the use-time question. Within each group, prefer pipeline-flow order over alphabetical when one applies (e.g. orchestrator → driver → grader).

**External tools** — include install instructions:
```
- **yq** — YAML processing (`brew install yq`)
- **jq** — JSON processing (`brew install jq`)
- **gh** — GitHub CLI (`brew install gh`)
```

**Skill dependencies** — reference by name and note whether they ship in the same plugin:
```
- **claude-code-evals** (sibling skill in this plugin) — Eval schema, check design, results interpretation
- **testing-strategy** skill — TDD framework and gate language
```

**System commands** — only document non-obvious ones:
```
- **ffmpeg** — Video processing (`brew install ffmpeg`)
```

## Checking Dependencies at Runtime

**In shell scripts** — check at the top before proceeding:
```bash
for cmd in yq gh; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing: $cmd"; exit 1; }
done
```

**Skill dependencies** — Claude loads other skills via the Skill tool when the user (or this skill) asks. The dependency is satisfied as long as the named skill is installed (personal `~/.claude/skills/`, plugin install dir, or project-local `.claude/skills/`). Sibling-in-plugin skills are loadable by name.

**Graceful degradation** — if a dependency is optional, skip that feature with a message rather than failing entirely.

## Inter-Skill Dependencies

Reference other skills by name. Claude resolves them via the Skill tool, regardless of install location.

Common dependency patterns:

| Skill | Provides |
|-------|----------|
| `claude-code-evals` | Eval schema, check design rules, results interpretation |
| `skillcraft` | Skill authoring discipline, audits, provenance tracking |
| `testing-strategy` | TDD framework, implementation protocol, eval gate language |

**Avoid circular dependencies.** If skill A depends on skill B, skill B must not depend on skill A. Keep the dependency graph a DAG.

## Composition Patterns

Skills interact through three patterns:

| Pattern | How It Works | Example |
|---------|-------------|---------|
| **Workflow GATE** | Skill A's workflow tells Claude to load Skill B before proceeding | `skillcraft`'s `bootstrap-evals.md` gates on loading `claude-code-evals` |
| **Cross-reference** | Skill A's docs point at specific reference files in Skill B | `skillcraft` references `claude-code-evals/references/check-design.md` for check rules |
| **External CLI handoff** | Skill A documents and shells out to an external CLI both skills assume is on PATH | Both `claude-code-evals` and `skillcraft` use `craboodle` for eval runs |

### Path Resolution

Reference *files inside the current skill* via `${CLAUDE_SKILL_DIR}` so the path works regardless of install location:

```bash
# Good — resolves to the current skill's directory at runtime
${CLAUDE_SKILL_DIR}/scripts/quick-validate.sh <target>
```

```bash
# Bad — hard-coded absolute path; breaks when the skill moves into a plugin
~/.claude/skills/<skill-name>/scripts/quick-validate.sh <target>
```

For *other skills*, prefer name-based reference in prose ("see the `claude-code-evals` skill") and let Claude load them via the Skill tool. Hard-coded paths into another skill's tree are brittle.

### When to Inline vs. Depend

| Situation | Approach |
|-----------|----------|
| Logic is <20 lines and unlikely to change | Inline it |
| Another skill handles this better | Depend on it |
| Multiple skills need the same capability | Factor into a shared skill |
| The dependency adds install friction | Inline or make it optional |

## Best Practices

1. **Minimize dependencies** — each one is a potential failure point
2. **Prefer built-in tools** — use `AskUserQuestion` when 4 or fewer options suffice; only reach for an external TUI when the built-in is genuinely insufficient
3. **Document all non-obvious dependencies** — anything beyond `git`, `bash`, standard Unix tools
4. **Test with dependencies missing** — verify the skill produces clear error messages
5. **Pin to behavior, not versions** — tools update; depend on capabilities, not release numbers
6. **Keep install instructions current** — `brew install` for macOS, note alternatives if cross-platform

## Dependency Section Template

```markdown
## Dependencies

- **yq** — YAML processing (`brew install yq`)
- **gh** — GitHub CLI (`brew install gh`)
- **claude-code-evals** (sibling skill in this plugin) — Eval schema and check design
```
