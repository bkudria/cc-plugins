# Standard Skill Audit

Full audit of a single skill against the 44-item quality checklist.

## Quick Pre-flight (Optional)

Run `scripts/quick-validate.sh` for fast structural checks before the full audit:

```bash
${CLAUDE_SKILL_DIR}/scripts/quick-validate.sh <skill-directory>
${CLAUDE_SKILL_DIR}/scripts/quick-validate.sh --all  # all skills
```

This catches structural issues (missing files, bad frontmatter, name mismatches) without reading the full checklist. Use the full audit for content and quality checks.

## Step 1: Select Target Skill

If `$ARGUMENTS` specifies a path, use it. Otherwise pick a skill:

1. Identify up to 4 likely candidates from: skills referenced in the current conversation; the skill currently being edited (if any); recently-touched skills (`git log --name-only --since="14 days ago"` filtered to skill paths if those trees are under git).
2. Use `AskUserQuestion` with those candidates plus an "Other" option.
3. If the user picks "Other", or if no plausible candidates surface, ask conversationally: "Which skill should I audit? Give me the skill name or path."

Check both `~/.claude/skills/` and `.claude/skills/` in the current project for candidates.

## Step 2: Read All Skill Files

Read every file in the skill directory — SKILL.md, all references/, all scripts/. Build a complete picture before auditing.

## Step 3: Apply Quality Checklist

Run all checks from `references/quality-checklist.md` across eight categories:

| Category | IDs | Focus |
|----------|-----|-------|
| Structure | S1-S7 | Files, naming, executability |
| Metadata | M1-M8 | Frontmatter correctness |
| Content | C1-C7 | Writing quality, examples |
| Progressive Disclosure | P1-P5 | Body vs references balance |
| Advanced Features | A1-A5 | Dynamic context, hooks, agents |
| Quality | Q1-Q5 | Dedup, formatting, consistency |
| TDD Compliance | T1-T5 | Baseline testing, skill type testing |
| Eval Pipeline | E1-E5 | Behavioral testing & benchmarks |

## Step 4: Present Findings

Structure the report as:

```
## Audit: skill-name

**Score: 24/32 checks passed**

### Passed (24)
S1 ✓ SKILL.md exists
...

### Issues (8)
🔴 Critical (blocks functionality)
- M2: Description empty — skill won't auto-trigger

🟡 Warning (degrades quality)
- C3: Missing "When to Use" section
- P1: Body is 620 lines — move detail to references/

🔵 Suggestion (nice to have)
- Q4: Inconsistent heading levels
```

Also note **Strengths** — things the skill does well worth preserving.

## Step 5: Fix Issues Interactively

For each issue (critical first), present the fix and ask the user with `AskUserQuestion`. Use the finding ID + summary as the question (e.g. "M2: Description empty — fix it?") and three options:

- **Fix now** — Apply the fix immediately
- **Skip** — Move to next issue
- **Discuss** — Explain the issue in detail, then re-ask

One `AskUserQuestion` call per issue. Process the user's choice before moving to the next finding.

## Step 6: Re-validate

After all fixes, re-run the checklist. Report final score.

## Step 7: Behavioral Eval

If the skill has no `evals/` directory, run the Bootstrap Evals workflow (`workflows/bootstrap-evals.md`). All skills should have eval coverage.

Then re-run edit-relevant scenarios to verify improvements haven't introduced regressions.

## Anti-Pattern Detection

Consult `references/anti-patterns.md` for common problems. When an anti-pattern is detected, cite it by name and show the before/after fix.

## Fix Resources

When suggesting fixes, consult these references:

| File | Use During Audit |
|------|-----------------|
| `references/official-spec.md` | Verify compliance against official Anthropic spec |
| `references/frontmatter-reference.md` | Fix frontmatter issues (M1-M8) |
| `references/skill-templates.md` | Suggest template-based restructuring |
| `references/writing-style.md` | Fix writing style issues (C1) |
| `references/naming-conventions.md` | Fix naming issues (M1, M3) |
