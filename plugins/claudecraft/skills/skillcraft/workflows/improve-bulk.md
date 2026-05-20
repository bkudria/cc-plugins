# Bulk Skill Audit

Audit every installed skill and present a summary.

## Process

1. Find all skills in `~/.claude/skills/` and `.claude/skills/`
2. Run the standard audit (see `workflows/improve-standard.md`) on each
3. Present a summary table:

```
| Skill | Score | Critical | Warnings |
|-------|-------|----------|----------|
| claude-code-evals | 30/32 | 0 | 2 |
| skillcraft | 28/32 | 0 | 4 |
```

4. Ask which skills to fix interactively
