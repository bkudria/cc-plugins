# Ideas

Candidate future directions for the plugins in this marketplace — under
consideration, not commitments. Entries are not ordered by priority.

## Evals

- **Grade main-agent checks on `subagent_of`.** Since scuttlerun 0.7.0
  (bkudria/scuttlerun#115), every tool and result entry a sub-agent makes
  carries `subagent_of: <Agent call id>` (or `unknown`); an entry without it
  is the main agent's. Before it, a sub-agent's calls read as the main
  agent's, so no check could say what the main agent itself did. Only
  sub-agents started by the Agent tool stream their calls: agents a
  `Workflow` starts never appear in the transcript, so the Workflow-based
  suites (projects/standards' audit, triage/assess) are unaffected and their
  "main transcript" wording already holds.
  - triage/iterate delegates each item to an Agent call, and the notes of
    `investigation-before-presenting`'s checks say that investigating
    directly with Read, Grep, Glob or Bash fails the skill, but no check
    asserts it: the checks require Agent calls, and none forbids the main
    agent's own investigation. Add one per
    suite that needs it, e.g. "No Read, Grep, Glob or Bash call without
    `subagent_of` targets src/csv_to_kdl/cli.py before the first
    AskUserQuestion call". Candidates: `investigation-before-presenting`,
    `happy-path-single-item`, `declined-item`.
  - `happy-path-single-item`'s `no-edit-before-ask` counts a sub-agent's
    edit too. Decide whether a sub-agent editing notes.md before the gate is
    the same failure; if not, scope the check to calls without
    `subagent_of`.
  - claude-code-evals' references/check-design.md says nothing about telling
    main-agent calls from sub-agent calls. Add a section: grade on
    `subagent_of`, and expect no entries at all for agents a Workflow starts.
  - Run each changed suite under scuttlerun 0.7.0 or later. Transcripts
    recorded earlier lack the field, so re-grading old runs does not test
    the new wording. The same release waits for background sub-agents
    (bkudria/scuttlerun#117), so a suite that moves to a model that
    backgrounds Agent calls unasked (haiku-5-5 does) needs no workaround.
