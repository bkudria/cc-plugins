export const meta = {
  name: 'standards-verify',
  description: 'Fan out one verifier sub-agent per pending standard: each reads its rendered prompt file, verifies the standard against the project, and writes a {met,detail} JSON verdict to its response file for run-audit.sh --merge to read.',
  whenToUse: 'Invoked by the standards audit (workflows/audit.md) after --collect has rendered the pending prompt files. Called once per scope — required, then (if the gate passes) suggested.',
  phases: [
    { title: 'Verify', detail: 'one haiku agent per pending standard, in parallel; each writes its response file' },
  ],
}

// ---- params -----------------------------------------------------------------
// The Workflow harness can deliver `args` as a JSON-encoded string rather than a
// parsed object; normalize both shapes before use.
let P = {}
if (typeof args === 'string') {
  try { P = JSON.parse(args) } catch (e) { P = {} }
} else if (args && typeof args === 'object') {
  P = args
}

const scope = P.scope || 'unspecified'
const pending = Array.isArray(P.pending) ? P.pending : []

if (!pending.length) {
  // Every standard in this scope was deterministic (resolved by --collect with no
  // prompt) — there is nothing to fan out. The main thread proceeds to --merge.
  log('No pending standards for scope "' + scope + '"; nothing to verify.')
  return { scope, requested: 0, dispatched: 0 }
}

// ---- Verify (parallel fan-out, one agent per pending standard) ---------------
phase('Verify')
log('Verifying ' + pending.length + ' pending standard(s) for scope "' + scope + '".')

// Each verifier's COMPLETE instructions live in its rendered prompt file on disk
// (written by run-audit.sh --collect): the project context, the standard's check,
// any maintainer notes, and a final directive to Write {"met","detail"} to its
// response file. The agent's only job is to read that file and obey it. Verdicts
// travel as files — never as the agent's return value — because --merge reads the
// response files and the Workflow completion notification truncates large returns.
const dispatchVerifier = (p) =>
  agent(
    'You are verifying one project standard. Your COMPLETE instructions ' +
    'live in a file on disk — read it and follow it exactly.\n\n' +
    '1. Use the Read tool to read this file verbatim:\n   ' + p.prompt_path + '\n' +
    '2. That file contains the project context, the standard\'s check, and a final ' +
    'directive to record a one-line JSON verdict. Investigate the project as the check ' +
    'requires (Read, Grep, Glob, and Bash are available), reach a verdict, then use the ' +
    'Write tool to write exactly {"met": true|false, "detail": "<one-line>"} — nothing ' +
    'else, no fenced code block — to this response file:\n   ' + p.response_path + '\n' +
    '3. The response file is the ONLY output that matters; your chat reply is ignored. ' +
    'Do not write the verdict anywhere else, and do not skip the Write.\n\n' +
    'Standard id: ' + p.id,
    { label: 'verify:' + p.id, phase: 'Verify', model: 'haiku' }
  )

/* test-seam:pure-fn:start */
// parallel() preserves order (results[i] pairs with pending[i]) and yields null for
// an agent that died (terminal API error / skipped). A verifier "ran" iff its result
// is neither null nor undefined — INCLUDING an empty string, since verifiers are told
// "your chat reply is ignored" and end on a Write, so a silent "" return is a success.
const ran = (r) => r !== null && r !== undefined
// How many verifiers ran (truthiness would wrongly drop the silent-"" successes).
const countDispatched = (results) => results.filter(ran).length
// Which standards failed to dispatch, by id — so the shortfall is actionable, not a
// bare number. Pairs each result with its pending entry by position.
const failedIds = (results, pending) =>
  pending.filter((_, i) => !ran(results[i])).map((p) => p.id)
/* test-seam:pure-fn:end */

const results = await parallel(pending.map((p) => () => dispatchVerifier(p)))
const dispatched = countDispatched(results)
const failed = failedIds(results, pending)
if (failed.length) {
  log(failed.length + ' verifier(s) failed to dispatch (' + failed.join(', ') + '); ' +
    '--merge treats any missing response file as FAIL (failure to verify is itself a failure).')
}
log('Dispatched ' + dispatched + '/' + pending.length + ' verifier(s) for scope "' + scope + '".')

return { scope, requested: pending.length, dispatched, failed }
