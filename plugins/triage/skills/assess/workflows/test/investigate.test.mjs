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

const { degradationSummary, renderAssessment, applyVerdicts, applyFindingCorrections, pickOverallQuestion, selectVerifyTargets, verifyTargetBudget, selectProbedKeys, summarizeAudit, runReliabilityFlags, clampEffort, collectObs } = helpers

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

// applyFindingCorrections: splice post-synthesis grounding corrections into the
// synthesized findings — replace the body of each finding whose number has a correction,
// preserve every other field and every other finding, never mutate the input.
const finding = (number, over = {}) => ({ number, title: 'T' + number, significance: 'high', body: 'body ' + number, citations: ['c' + number], ...over })

test('applyFindingCorrections: replaces only the targeted finding body, preserving other fields', () => {
  const out = applyFindingCorrections([finding(1), finding(2)], [{ findingNumber: 2, correctedBody: 'fixed two' }])
  assert.equal(out[0].body, 'body 1') // untouched
  assert.equal(out[1].body, 'fixed two') // corrected
  // every other field on the corrected finding is preserved
  assert.deepEqual({ number: out[1].number, title: out[1].title, significance: out[1].significance, citations: out[1].citations },
    { number: 2, title: 'T2', significance: 'high', citations: ['c2'] })
})

test('applyFindingCorrections: empty corrections returns the findings unchanged', () => {
  const findings = [finding(1), finding(2)]
  assert.deepEqual(applyFindingCorrections(findings, []), findings)
})

test('applyFindingCorrections: a correction for an absent finding number is ignored', () => {
  const out = applyFindingCorrections([finding(1)], [{ findingNumber: 99, correctedBody: 'orphan' }])
  assert.deepEqual(out, [finding(1)])
})

test('applyFindingCorrections: does not mutate the input findings', () => {
  const input = [finding(1)]
  applyFindingCorrections(input, [{ findingNumber: 1, correctedBody: 'mutated?' }])
  assert.equal(input[0].body, 'body 1') // original object untouched
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

const obs = (over = {}) => ({ area: 'A', title: 't1', body: 'b1', evidence: ['e1'], significance: 'high', ...over })

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
  // The kept (prompt-bound) correction drops `was` — it duplicated `body` byte-for-byte, which the
  // synthesizer/verifier already see at the observation root. Only `now`/`why` reach the prompt.
  assert.deepEqual(kept[0].verificationNotes.corrections, [
    { lens: 'L', now: 'b1-fixed', why: 'off by one' },
  ])
  // The audit `actions` record keeps the full before/after, including `was`.
  assert.deepEqual(actions[0].corrections, [
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

test('applyVerdicts: a medium-confidence drop removes the observation', () => {
  const { kept, actions } = applyVerdicts(
    [obs()],
    [{ area: 'A', title: 't1', verdict: 'drop', confidence: 'medium', lens: 'L', rationale: 'working as designed' }]
  )
  assert.equal(kept.length, 0)
  assert.equal(actions[0].action, 'dropped')
  assert.equal(actions[0].confidence, 'medium')
})

test('applyVerdicts: a correct with a lower correctedSignificance downgrades the kept observation', () => {
  const { kept, actions } = applyVerdicts(
    [obs()], // significance: 'high'
    [{ area: 'A', title: 't1', verdict: 'correct', correctedSignificance: 'medium', lens: 'L', rationale: 'inflated' }]
  )
  assert.equal(kept[0].significance, 'medium') // lowered from high
  // The kept (prompt-bound) observation carries no significanceDowngrade record: the synthesizer
  // reads the corrected root `significance` directly, never the downgrade provenance. With no
  // correction text and no flags, this observation gets no verificationNotes at all.
  assert.equal(kept[0].verificationNotes, undefined)
  // The audit `actions` record keeps the full downgrade provenance.
  assert.deepEqual(actions[0].significanceDowngrade, { lens: 'L', was: 'high', now: 'medium', why: 'inflated' })
  assert.equal(actions[0].action, 'corrected')
})

test('applyVerdicts: correctedSignificance is downgrade-only — an equal or higher level is ignored', () => {
  const { kept } = applyVerdicts(
    [obs({ significance: 'medium' })],
    [{ area: 'A', title: 't1', verdict: 'correct', correctedSignificance: 'high', lens: 'L', rationale: 'wants to raise' }]
  )
  assert.equal(kept[0].significance, 'medium') // never raised past the original
  assert.equal(kept[0].verificationNotes, undefined) // no downgrade recorded, no other notes
})

// area-aware verify-target selection
const vobs = (area, significance, title) => ({ area, title, body: 'b', evidence: ['e'], significance })
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

// probedKeys tells the consolidation verifier which observations were "already
// individually probed and reconciled" so it scrutinises the others. It must be
// keyed off the verdicts that actually returned, not the dispatched targets —
// otherwise a lost verdict still claims its observation was checked.
const ptarget = (area, title) => ({ o: { area, title } })
const pverdict = (area, title, lens = 'L') => ({ area, title, lens })

test('selectProbedKeys: total verdict loss claims nothing was probed', () => {
  const targets = [ptarget('A', 'tA'), ptarget('B', 'tB')]
  assert.deepEqual(selectProbedKeys(targets, []), [])
})

test('selectProbedKeys: partial loss keeps only the observations whose verdict returned', () => {
  const targets = [ptarget('A', 'tA'), ptarget('B', 'tB'), ptarget('C', 'tC')]
  const verdicts = [pverdict('A', 'tA'), pverdict('C', 'tC')]
  assert.deepEqual(selectProbedKeys(targets, verdicts), ['A / tA', 'C / tC'])
})

test('selectProbedKeys: full coverage returns every target key (no regression)', () => {
  const targets = [ptarget('A', 'tA'), ptarget('B', 'tB')]
  const verdicts = [pverdict('A', 'tA'), pverdict('B', 'tB')]
  assert.deepEqual(selectProbedKeys(targets, verdicts), ['A / tA', 'B / tB'])
})

test('selectProbedKeys: multiple lens verdicts for one observation collapse to a single key', () => {
  const targets = [ptarget('A', 'tA'), ptarget('B', 'tB')]
  const verdicts = [pverdict('A', 'tA', 'L1'), pverdict('A', 'tA', 'L2'), pverdict('B', 'tB', 'L1')]
  assert.deepEqual(selectProbedKeys(targets, verdicts), ['A / tA', 'B / tB'])
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

test('summarizeAudit counts corrections, drops, flags, ungrounded, and reliability flags', () => {
  const summary = summarizeAudit({
    status: 'degraded',
    observationCount: 12,
    synthInputCount: 10,
    findingsCount: 4,
    auditActions: [
      { action: 'corrected' }, { action: 'corrected' },
      { action: 'dropped' },
      { action: 'flagged' }, { action: 'flagged' }, { action: 'flagged' },
    ],
    grounding: { ran: true, checked: 4, ungrounded: [{ findingNumber: 1 }, { findingNumber: 2 }], corrected: [3] },
    reliabilityFlags: ['consolidation verification failed and was skipped'],
  })
  assert.deepEqual(summary, {
    status: 'degraded',
    observations: 12,
    synthesized: 10,
    findings: 4,
    corrected: 2,
    dropped: 1,
    flagged: 3,
    ungrounded: 2,
    groundCorrected: 1,
    reliabilityFlags: 1,
  })
})

test('summarizeAudit on a clean run reports zeros and passes the funnel counts through', () => {
  const summary = summarizeAudit({
    status: 'ok',
    observationCount: 8,
    synthInputCount: 8,
    findingsCount: 5,
    auditActions: [],
    grounding: { ran: false, checked: 0, ungrounded: [] },
    reliabilityFlags: undefined,
  })
  assert.deepEqual(summary, {
    status: 'ok',
    observations: 8,
    synthesized: 8,
    findings: 5,
    corrected: 0,
    dropped: 0,
    flagged: 0,
    ungrounded: 0,
    groundCorrected: 0,
    reliabilityFlags: 0,
  })
})

test('summarizeAudit reports groundCorrected from the grounding.corrected list', () => {
  const summary = summarizeAudit({
    status: 'ok',
    observationCount: 5,
    synthInputCount: 5,
    findingsCount: 3,
    auditActions: [],
    grounding: { ran: true, checked: 3, ungrounded: [], corrected: [1, 2] },
    reliabilityFlags: [],
  })
  assert.equal(summary.groundCorrected, 2)
  assert.equal(summary.ungrounded, 0)
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

// clampEffort: cap a planner-proposed effort at the optional user ceiling
// (low < medium < high). EFFORT_LEVELS = ['low', 'medium', 'high'].
test('clampEffort: with no ceiling the proposed level passes through', () => {
  assert.equal(clampEffort('high', null), 'high')
  assert.equal(clampEffort('low', null), 'low')
})

test('clampEffort: a ceiling clamps a higher proposed level down to it', () => {
  assert.equal(clampEffort('high', 'medium'), 'medium')
})

test('clampEffort: a proposed level at or below the ceiling is left alone', () => {
  assert.equal(clampEffort('low', 'high'), 'low')
  assert.equal(clampEffort('medium', 'medium'), 'medium')
})

test('clampEffort: an unrecognized proposed level defaults to medium', () => {
  assert.equal(clampEffort('bogus', null), 'medium')
})

test('clampEffort: an unrecognized proposed level is still clamped by the ceiling', () => {
  assert.equal(clampEffort('bogus', 'low'), 'low') // medium default, then clamped down to low
})

// collectObs: flatten investigator results into one observation list, stamping
// each observation with its area.
test('collectObs: flattens areas and stamps each observation with its area', () => {
  const out = collectObs([
    { area: 'alpha', observations: [
      { title: 't1', body: 'b1', evidence: ['x.js:1'], significance: 'high' },
      { title: 't2', body: 'b2', evidence: ['x.js:2'], significance: 'low' },
    ] },
    { area: 'beta', observations: [
      { title: 't3', body: 'b3', evidence: ['y.js:1'], significance: 'medium' },
    ] },
  ])
  assert.equal(out.length, 3)
  assert.deepEqual(out[0], { area: 'alpha', title: 't1', body: 'b1', evidence: ['x.js:1'], significance: 'high' })
  assert.deepEqual(out[2], { area: 'beta', title: 't3', body: 'b3', evidence: ['y.js:1'], significance: 'medium' })
})

test('collectObs: an investigation missing its observations contributes nothing', () => {
  const out = collectObs([
    { area: 'alpha' }, // no observations key — the `|| []` guard
    { area: 'beta', observations: [] },
    { area: 'gamma', observations: [{ title: 't', body: 'b', evidence: ['z.js:1'], significance: 'high' }] },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].area, 'gamma')
})

test('collectObs: empty input yields an empty list', () => {
  assert.deepEqual(collectObs([]), [])
})

// verifyTargetBudget sizes the adversarial-lens budget so every area is guaranteed a
// floor slot: it stays at the minimum for small runs, grows with the area count, and
// is clamped to the total-area cap. This is what stops completeness-added areas from
// falling off the right side of the top-K ranking once area count reaches the minimum.
test('verifyTargetBudget: fewer areas than the minimum keeps the minimum budget', () => {
  assert.equal(verifyTargetBudget(3, 6, 12), 6)
})

test('verifyTargetBudget: at the minimum boundary the budget is the minimum', () => {
  assert.equal(verifyTargetBudget(6, 6, 12), 6)
})

test('verifyTargetBudget: more areas than the minimum scales the budget to the area count', () => {
  assert.equal(verifyTargetBudget(10, 6, 12), 10)
})

test('verifyTargetBudget: at the cap the budget equals the cap', () => {
  assert.equal(verifyTargetBudget(12, 6, 12), 12)
})

test('verifyTargetBudget: above the cap the budget is clamped to the cap', () => {
  assert.equal(verifyTargetBudget(15, 6, 12), 12)
})
