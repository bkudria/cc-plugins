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

const { degradationSummary, renderAssessment, applyVerdicts, pickOverallQuestion } = helpers

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
