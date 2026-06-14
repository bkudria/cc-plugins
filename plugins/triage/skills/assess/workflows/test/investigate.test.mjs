// Unit suite for the pure functions in ../investigate.js.
//
// These functions are the deterministic, observation-only core of the assess
// workflow: status/coverage derivation, the assess<->iterate markdown format
// contract, the verdict rails, and the overall-question selection. They take
// plain data in and return plain data out (no injected globals), so they are
// unit-testable in isolation via the source loader in ./_load.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { helpers } from './_load.mjs'

const { degradationSummary, renderAssessment, applyVerdicts, pickOverallQuestion, selectVerifyTargets, runReliabilityFlags } = helpers

test('renderAssessment emits the deterministic assess<->iterate format contract', () => {
  const md = renderAssessment({
    assessmentTitle: 'Demo',
    scopeSummary: 'the widget',
    areasCovered: 'parsing, rendering',
    findings: [
      { number: 1, title: 'First thing', significance: 'high', body: 'Body one.' },
      { number: 2, title: 'Second thing', significance: 'low', body: 'Body two.' },
    ],
    summary: 'All done.',
  })

  // Structural headers iterate depends on.
  assert.ok(md.startsWith('## Assessment: Demo\n'))
  assert.match(md, /^\*\*Scope\*\*: the widget$/m)
  assert.match(md, /^\*\*Areas covered\*\*: parsing, rendering$/m)
  assert.match(md, /^## Findings$/m)
  assert.match(md, /^## Summary$/m)
  assert.ok(md.includes('All done.'))

  // Each finding: "### N. Title" immediately followed by its "**Significance**:"
  // line, then a blank line, then the body. This exact block is the contract
  // iterate parses — lock it verbatim.
  assert.ok(md.includes('### 1. First thing\n**Significance**: high\n\nBody one.'))
  assert.ok(md.includes('### 2. Second thing\n**Significance**: low\n\nBody two.'))
})

test('renderAssessment with no findings still renders the structural h2s', () => {
  const md = renderAssessment({
    assessmentTitle: 'Empty',
    scopeSummary: 's',
    areasCovered: 'none',
    findings: [],
    summary: 'Nothing found.',
  })
  assert.match(md, /^## Findings$/m)
  assert.match(md, /^## Summary$/m)
  assert.ok(!md.includes('### '))
})

test('degradationSummary: ok when nothing is lost', () => {
  assert.deepEqual(
    degradationSummary({ plannedAreas: 3, droppedAreas: [], synthOk: true, verifyFailed: false }),
    { status: 'ok', coverage: { planned: 3, completed: 3, dropped: [] } }
  )
})

test('degradationSummary: degraded when an area is dropped', () => {
  assert.deepEqual(
    degradationSummary({ plannedAreas: 3, droppedAreas: ['auth'], synthOk: true, verifyFailed: false }),
    { status: 'degraded', coverage: { planned: 3, completed: 2, dropped: ['auth'] } }
  )
})

test('degradationSummary: degraded when verify failed even with full coverage', () => {
  const r = degradationSummary({ plannedAreas: 2, droppedAreas: [], synthOk: true, verifyFailed: true })
  assert.equal(r.status, 'degraded')
  assert.equal(r.coverage.completed, 2)
})

test('degradationSummary: degraded when the lens verdicts were lost (dispatched but empty)', () => {
  const r = degradationSummary({ plannedAreas: 2, droppedAreas: [], synthOk: true, verifyFailed: false, verifyLost: true })
  assert.equal(r.status, 'degraded')
  assert.equal(r.coverage.completed, 2)
})

test('degradationSummary: ok when verify ran (verifyLost false) and nothing else lost', () => {
  const r = degradationSummary({ plannedAreas: 2, droppedAreas: [], synthOk: true, verifyFailed: false, verifyLost: false })
  assert.equal(r.status, 'ok')
})

test('degradationSummary: failed overrides everything when synth did not succeed', () => {
  assert.deepEqual(
    degradationSummary({ plannedAreas: 2, droppedAreas: ['a', 'b'], synthOk: false, verifyFailed: false }),
    { status: 'failed', coverage: { planned: 2, completed: 0, dropped: ['a', 'b'] } }
  )
})

test('degradationSummary: degraded when citations failed to ground', () => {
  const r = degradationSummary({ plannedAreas: 2, droppedAreas: [], synthOk: true, verifyFailed: false, ungrounded: 3 })
  assert.equal(r.status, 'degraded')
  assert.equal(r.coverage.completed, 2)
})

test('degradationSummary: ok when no citations are ungrounded', () => {
  const r = degradationSummary({ plannedAreas: 2, droppedAreas: [], synthOk: true, verifyFailed: false, ungrounded: 0 })
  assert.equal(r.status, 'ok')
})

test('degradationSummary: a zero-observation run that also lost coverage escalates to failed', () => {
  // Empty + a real loss (a dropped area, or verify failure) is not a legitimately
  // empty result — it is a broken run, so it escalates past 'degraded' to 'failed'.
  assert.equal(
    degradationSummary({ plannedAreas: 2, droppedAreas: ['auth'], synthOk: true, noObservations: true }).status,
    'failed'
  )
  assert.equal(
    degradationSummary({ plannedAreas: 2, droppedAreas: [], synthOk: true, verifyFailed: true, noObservations: true }).status,
    'failed'
  )
})

test('degradationSummary: a clean zero-observation run is still ok', () => {
  // A legitimately empty investigation (no losses) stays 'ok' — preserved behavior.
  assert.equal(
    degradationSummary({ plannedAreas: 2, droppedAreas: [], synthOk: true, verifyFailed: false, noObservations: true }).status,
    'ok'
  )
})

const obs = (over = {}) => ({ area: 'A', title: 't1', body: 'b1', evidence: 'e1', significance: 'high', ...over })

test('applyVerdicts: a high/medium-confidence drop removes the observation', () => {
  const { kept, actions } = applyVerdicts(
    [obs()],
    [{ area: 'A', title: 't1', verdict: 'drop', confidence: 'high', lens: 'L', rationale: 'bogus' }]
  )
  assert.equal(kept.length, 0)
  assert.deepEqual(actions, [
    { area: 'A', title: 't1', action: 'dropped', lens: 'L', confidence: 'high', rationale: 'bogus' },
  ])
})

test('applyVerdicts: a low-confidence drop becomes a flag, observation kept', () => {
  const { kept, actions } = applyVerdicts(
    [obs()],
    [{ area: 'A', title: 't1', verdict: 'drop', confidence: 'low', lens: 'L', rationale: 'maybe' }]
  )
  assert.equal(kept.length, 1)
  assert.ok(kept[0].verificationNotes.flags.includes('low-confidence drop (L): maybe'))
  assert.equal(actions[0].action, 'flagged')
})

test('applyVerdicts: a reliabilityConcern becomes a flag, observation kept', () => {
  const { kept } = applyVerdicts(
    [obs()],
    [{ area: 'A', title: 't1', verdict: 'hold', lens: 'L', reliabilityConcern: 'flaky source' }]
  )
  assert.equal(kept.length, 1)
  assert.ok(kept[0].verificationNotes.flags.includes('reliability (L): flaky source'))
})

test('applyVerdicts: a correct folds an annotation but preserves the original body', () => {
  const { kept, actions } = applyVerdicts(
    [obs()],
    [{ area: 'A', title: 't1', verdict: 'correct', correction: 'b1-fixed', lens: 'L', rationale: 'off by one' }]
  )
  assert.equal(kept[0].body, 'b1') // original body preserved, never rewritten
  assert.deepEqual(kept[0].verificationNotes.corrections, [
    { lens: 'L', was: 'b1', now: 'b1-fixed', why: 'off by one' },
  ])
  assert.equal(actions[0].action, 'corrected')
})

test('applyVerdicts: across lenses, a qualifying drop wins over a correct', () => {
  const { kept } = applyVerdicts(
    [obs()],
    [
      { area: 'A', title: 't1', verdict: 'correct', correction: 'x', lens: 'L1', rationale: 'r1' },
      { area: 'A', title: 't1', verdict: 'drop', confidence: 'high', lens: 'L2', rationale: 'r2' },
    ]
  )
  assert.equal(kept.length, 0)
})

// area-aware verify-target selection
const vobs = (area, significance, title) => ({ area, title, body: 'b', evidence: 'e', significance })
const countByArea = (targets) => targets.reduce((m, t) => ((m[t.o.area] = (m[t.o.area] || 0) + 1), m), {})

test('selectVerifyTargets: per-area floor quota spreads slots, including a lone medium area', () => {
  const list = [
    ...Array.from({ length: 6 }, (_, n) => vobs('A', 'high', 'a' + n)),
    vobs('B', 'high', 'b0'), vobs('B', 'high', 'b1'),
    vobs('C', 'medium', 'c0'),
  ]
  const targets = selectVerifyTargets(list, 6)
  assert.equal(targets.length, 6)
  // Every area gets its floor; A keeps the surplus. The old top-6-by-significance
  // slice would take all six high-sig A observations and never probe C's medium.
  assert.deepEqual(countByArea(targets), { A: 4, B: 1, C: 1 })
  assert.ok(targets.some((t) => t.o.area === 'C'))
})

test('selectVerifyTargets: a low-only area gets just its floor; higher significance fills the rest', () => {
  const list = [
    vobs('A', 'high', 'a0'), vobs('A', 'high', 'a1'), vobs('A', 'high', 'a2'),
    vobs('B', 'low', 'b0'), vobs('B', 'low', 'b1'),
  ]
  const targets = selectVerifyTargets(list, 4)
  // B is represented once (its floor); the remaining slots go to A's highs,
  // never B's second low while higher-significance observations remain.
  assert.deepEqual(countByArea(targets), { A: 3, B: 1 })
})

test('selectVerifyTargets: a single area is unchanged from the top-K slice (no regression)', () => {
  const list = Array.from({ length: 10 }, (_, n) => vobs('A', 'high', 'a' + n))
  const targets = selectVerifyTargets(list, 6)
  assert.equal(targets.length, 6)
  assert.deepEqual(targets.map((t) => t.i), [0, 1, 2, 3, 4, 5])
})

test('selectVerifyTargets: returns all observations when fewer than the budget', () => {
  const list = [vobs('A', 'high', 'a0'), vobs('B', 'medium', 'b0')]
  assert.equal(selectVerifyTargets(list, 6).length, 2)
})

test('selectVerifyTargets: preserves each observation original index', () => {
  const list = [vobs('A', 'high', 'a0'), vobs('B', 'high', 'b0'), vobs('A', 'high', 'a1')]
  const targets = selectVerifyTargets(list, 3)
  for (const t of targets) assert.equal(list[t.i], t.o)
  assert.deepEqual(targets.map((t) => t.i).sort((a, b) => a - b), [0, 1, 2])
})

test('pickOverallQuestion: original plan question by default', () => {
  assert.equal(pickOverallQuestion({ plan: { overallQuestion: 'Q' }, scope: 's' }), 'Q')
})

test('pickOverallQuestion: falls back to scope when no plan question', () => {
  assert.equal(pickOverallQuestion({ plan: null, scope: 's' }), 's')
  assert.equal(pickOverallQuestion({ plan: {}, scope: 's' }), 's')
})

test('pickOverallQuestion: an adopted revision question supersedes the original', () => {
  assert.equal(
    pickOverallQuestion({ plan: { overallQuestion: 'Q' }, revised: { overallQuestion: 'R' }, scope: 's' }),
    'R'
  )
})

test('pickOverallQuestion: a revision without a question falls back to plan/scope', () => {
  assert.equal(
    pickOverallQuestion({ plan: { overallQuestion: 'Q' }, revised: { areas: [] }, scope: 's' }),
    'Q'
  )
  assert.equal(pickOverallQuestion({ plan: null, revised: { overallQuestion: 'R' }, scope: 's' }), 'R')
})

// run-level reliability flags — disclose safeguards that silently no-op'd
// (a critic that crashed on both attempts) or verification that came back partial.
// These surface in the audit trail; they do not by themselves change status.
test('runReliabilityFlags: a silently-skipped plan critic is flagged', () => {
  const flags = runReliabilityFlags({ planCriticFailed: true })
  assert.equal(flags.length, 1)
  assert.match(flags[0], /plan critic/i)
})

test('runReliabilityFlags: a silently-skipped completeness critic is flagged', () => {
  const flags = runReliabilityFlags({ completenessCriticFailed: true })
  assert.equal(flags.length, 1)
  assert.match(flags[0], /completeness critic/i)
})

test('runReliabilityFlags: partial verdict loss is flagged with received/expected counts', () => {
  const flags = runReliabilityFlags({ verdictsReceived: 7, verdictsExpected: 10 })
  assert.equal(flags.length, 1)
  assert.match(flags[0], /\b7\b/)
  assert.match(flags[0], /\b10\b/)
})

test('runReliabilityFlags: no partial flag on total loss or on complete verification', () => {
  // Total loss (received 0) is handled separately by verifyLost; complete coverage
  // has nothing to flag. Only a genuine partial (0 < received < expected) flags.
  assert.deepEqual(runReliabilityFlags({ verdictsReceived: 0, verdictsExpected: 10 }), [])
  assert.deepEqual(runReliabilityFlags({ verdictsReceived: 10, verdictsExpected: 10 }), [])
  assert.deepEqual(runReliabilityFlags({ verdictsReceived: 7, verdictsExpected: 7 }), [])
})

test('runReliabilityFlags: a clean run yields no flags', () => {
  assert.deepEqual(runReliabilityFlags({}), [])
})
