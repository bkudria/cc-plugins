# projects

Audit a project's standards compliance or scaffold a new one, driven by a declarative `project.yaml`.

## What's in this plugin

projects ships a single skill:

- **[standards](skills/standards/SKILL.md)** — manages project standards compliance through `project.yaml`, a per-project file that declares which **profiles** apply (directories of standard definitions), optionally which inherited standards are **disabled** (with a reason), and optionally which suggested standards are **required** (severity upgraded from `SUGG` to `FAIL`). The skill runs in two modes:
  - **Audit** — walk the selected profiles, verify each standard against the project (deterministic shell checks run inline; judgment checks fan out to background sub-agents), and render a prioritized FAIL/SUGG table.
  - **Scaffold** — interview, generate `project.yaml`, create the files the selected profiles expect, then audit to confirm zero FAILs.

## The model

A **standard** is a self-contained YAML file under `skills/standards/profiles/<profile>/`. It declares whether it's required, a one-line description, and exactly one of a deterministic `check.script` or a judgment-based `check.prompt`. A standard's identity is `<profile>/<basename>`. Standards are activated purely by directory listing — every `.yaml` under a selected profile is live.

`project.yaml` carries exactly three keys:

```yaml
profiles: [base, public]      # which profile directories apply

disabled:                     # optional — exempt a standard, with a reason
  public/code-of-conduct: "Single-maintainer pre-1.0 project; deferred to v1.0."

required:                     # optional — upgrade a suggested standard to FAIL
  - base/lockfile
```

The skill is intentionally language- and tool-agnostic: standards inspect the project itself (manifests, config, files) rather than reading declarations, so the same profile works across languages.

## Usage

    /plugin install projects@bkudria-cc-plugins

The skill auto-triggers on phrases like "audit this project", "check compliance", "new project", or "scaffold project". See [skills/standards/SKILL.md](skills/standards/SKILL.md) for the full trigger list and the audit/scaffold workflows.

Projects without a `project.yaml` are not tracked — the audit is opt-in per project.

## How the audit runs

The deterministic runner (`skills/standards/scripts/run-audit.sh`) is a six-verb state machine — `--init`, `--collect`, `--merge`, `--gate`, `--render`, `--check` — operating on a per-audit state directory. It runs in two rounds: required standards first, and suggested standards only if every required one passes. Judgment-based checks are delegated to a background `Workflow` (`skills/standards/workflows/verify.js`) that fans out one verifier per pending standard. The `--check` verb gives a clean CI pass/fail exit code.
