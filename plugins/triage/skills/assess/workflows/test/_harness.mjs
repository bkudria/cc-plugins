// Integration harness for the investigate.js ORCHESTRATION (not just its pure core).
//
// investigate.js is a Workflow script: the runtime strips its `export`, wraps the body
// in an async function, and injects the globals agent/parallel/phase/log/args. The pure
// loader (_load.mjs) extracts only the test-seam regions; this harness instead loads the
// WHOLE script with those globals stubbed, so the real orchestration runs end to end over
// deterministic agent responses. A scenario drives one failure branch by making a single
// agent label throw (→ withRetry returns null / parallel swallows to null) or return a
// degraded value, then asserts on the script's real return object (status, coverage,
// reliabilityFlags, findingsCount, error). No LLM, no IO, no time/randomness.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SOURCE = fileURLToPath(new URL('../investigate.js', import.meta.url))
// Strip the ESM `export` so the body is legal inside a Function; it already uses a
// top-level `return` and top-level `await`, so we wrap it with the AsyncFunction ctor
// (the same constructor used to parse-check the script).
const src = readFileSync(SOURCE, 'utf8').replace(/^export\s+/gm, '')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const factory = new AsyncFunction('agent', 'parallel', 'phase', 'log', 'args', src)

// Mirror the runtime parallel(): run every thunk concurrently, preserve order, and
// swallow a thrown/rejected thunk to null. This is what makes a dropped area or a lost
// lens verdict reachable by throwing inside the relevant agent call.
const realisticParallel = (thunks) =>
  Promise.all(thunks.map((t) => Promise.resolve().then(t).catch(() => null)))

// ---- the default happy fixture ---------------------------------------------
// Minimal data shaped to satisfy exactly what investigate.js reads off each agent result.
// A fully happy run over this fixture returns status 'ok'. Three areas keep the run above
// PLAN_CRITIC_MIN_AREAS so the plan critic actually fires.
export const AREAS = ['alpha', 'beta', 'gamma']

const obsFor = (area) => ({
  area,
  observations: [
    { title: area + ' observation', body: 'what is, in ' + area, evidence: [area + '.js:1'], significance: 'high' },
  ],
})

const planResult = {
  overallQuestion: 'Is the thing sound?',
  effortRationale: 'three facets',
  areas: AREAS.map((name) => ({ name, rationale: 'why ' + name, effort: 'medium' })),
}

const HAPPY = {
  plan: planResult,
  'plan-critic': { sound: true, issues: [] },
  'plan-revise': planResult,
  'source-digest': { overview: 'orientation overview', landmarks: [{ location: 'alpha.js:1-9', what: 'the alpha entrypoint', relevance: 'bears on area alpha' }] },
  'completeness-critic': { complete: true, gaps: [] },
  verify: { checksPerformed: ['cross-ref'], corrections: [], reliabilityFlags: [] },
  'apply-corrections': { corrections: [] },
  synthesize: {
    assessmentTitle: 'T',
    scopeSummary: 's',
    areasCovered: AREAS.join(', '),
    findings: [
      { number: 1, title: 'F1', significance: 'high', body: 'b1', citations: ['alpha.js:1'] },
      { number: 2, title: 'F2', significance: 'medium', body: 'b2', citations: ['beta.js:1'] },
    ],
    summary: 'sum',
  },
  'write-assessment': { written: true, path: '/tmp/assessment-test.md' },
  'rewrite-assessment': { written: true, path: '/tmp/assessment-test.md' },
}

const areaOf = (label) => label.slice(label.indexOf(':') + 1)

// Dispatch an agent() call to its canned happy response by label. Dynamic labels
// (area:/gap:/verify:<lens>#i/ground#n) are matched by prefix.
const defaultAgent = (_prompt, opts) => {
  const label = (opts && opts.label) || ''
  if (label.startsWith('area:') || label.startsWith('gap:')) return obsFor(areaOf(label))
  if (label.startsWith('verify:')) return { verdict: 'holds', confidence: 'high', rationale: 'independently confirmed' }
  if (label.startsWith('ground#')) return { ungrounded: [] }
  if (Object.prototype.hasOwnProperty.call(HAPPY, label)) return HAPPY[label]
  throw new Error('no happy default for agent label: ' + label)
}

// Sentinel: an override mapped to THROW makes that label throw (→ withRetry null on the
// critical path, → null inside parallel for fan-out jobs).
export const THROW = Symbol('inject-throw')

// Build a scenario agent from a map of overrides. A key is either an exact label, or a
// prefix ending in ':' or '#' (matches every dynamic label under it). The value is a
// replacement response, a (prompt, opts) => response function, or THROW. Everything else
// falls through to the happy fixture. Exact-label keys win over prefix keys.
export const withOverrides = (overrides = {}) => {
  const prefixKeys = Object.keys(overrides).filter((k) => k.endsWith(':') || k.endsWith('#'))
  return (prompt, opts) => {
    const label = (opts && opts.label) || ''
    const key = Object.prototype.hasOwnProperty.call(overrides, label)
      ? label
      : prefixKeys.find((k) => label.startsWith(k))
    if (key != null) {
      const o = overrides[key]
      if (o === THROW) throw new Error('injected failure: ' + label)
      return typeof o === 'function' ? o(prompt, opts) : o
    }
    return defaultAgent(prompt, opts)
  }
}

// Run the whole workflow against a scenario agent. Returns the script's real return value,
// the ordered list of agent labels that were dispatched (so a scenario can assert the
// targeted stage actually fired, or that a gated stage was/ wasn't reached), and `dispatches`
// — the same calls with their `opts.model` (undefined when the role inherits the caller's
// model) so a scenario can assert each role's model tier. The recording wrapper logs the
// label/model BEFORE calling, so a throwing label is still recorded as fired.
export const runWorkflow = async ({ args, agent }) => {
  const calls = []
  const dispatches = []
  const recordingAgent = async (prompt, opts) => {
    const label = (opts && opts.label) || ''
    calls.push(label)
    dispatches.push({ label, model: opts && opts.model })
    return agent(prompt, opts)
  }
  const result = await factory(recordingAgent, realisticParallel, () => {}, () => {}, args)
  return { result, calls, dispatches }
}
