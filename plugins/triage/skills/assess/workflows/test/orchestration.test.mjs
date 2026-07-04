// Integration suite for the investigate.js ORCHESTRATION — the agent()-driven stages and
// the failure-to-status mapping the pure unit suite (investigate.test.mjs) only ever
// exercises as signal-in/object-out. Each scenario rides one coherent happy fixture
// (see _harness.mjs) and overrides exactly one agent label to drive a single failure
// branch, then asserts on the workflow's real return value. Deterministic: no LLM, no IO.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runWorkflow, withOverrides, THROW, AREAS } from './_harness.mjs'

const low = (overrides) => runWorkflow({ args: { scope: 's', effort: 'low' }, agent: withOverrides(overrides) })
const med = (overrides) => runWorkflow({ args: { scope: 's', effort: 'medium' }, agent: withOverrides(overrides) })
const high = (overrides) => runWorkflow({ args: { scope: 's', effort: 'high' }, agent: withOverrides(overrides) })
// No effort ceiling: the planner's per-area efforts decide the run's overall effort (the median).
const adaptive = (overrides) => runWorkflow({ args: { scope: 's' }, agent: withOverrides(overrides) })

test('ok baseline: a fully happy run reports ok with findings and no reliability flags', async () => {
  const { result, calls } = await med()
  assert.equal(result.status, 'ok')
  assert.equal(result.findingsCount, 2)
  assert.deepEqual(result.reliabilityFlags, [])
  // Sanity: medium effort actually exercised the gated stages this suite drives.
  assert.ok(calls.includes('plan-critic'))
  assert.ok(calls.includes('completeness-critic'))
  assert.ok(calls.some((l) => l.startsWith('verify:')))
  assert.ok(calls.some((l) => l.startsWith('ground#')))
})

test('plan-critic null: advisory critic crash flags but does not degrade the run', async () => {
  const { result, calls } = await med({ 'plan-critic': THROW })
  assert.ok(calls.includes('plan-critic')) // the failure was actually injected
  assert.equal(result.status, 'ok') // critic is advisory — null does not lower status
  assert.ok(result.reliabilityFlags.some((f) => /plan critic failed after retry/.test(f)))
})

test('completeness-critic null: advisory critic crash flags but does not degrade the run', async () => {
  const { result, calls } = await med({ 'completeness-critic': THROW })
  assert.ok(calls.includes('completeness-critic'))
  assert.equal(result.status, 'ok')
  assert.ok(result.reliabilityFlags.some((f) => /completeness critic failed after retry/.test(f)))
})

test('area drop: an investigator that fails drops its area and degrades the run', async () => {
  const { result } = await med({ 'area:beta': THROW })
  assert.equal(result.status, 'degraded')
  assert.ok(result.coverage.dropped.includes('beta'))
  assert.equal(result.coverage.completed, result.coverage.planned - 1)
})

test('verify-consolidation failure: a thrown consolidation degrades the run and flags it', async () => {
  const { result } = await med({ verify: THROW })
  assert.equal(result.status, 'degraded')
  assert.ok(result.reliabilityFlags.some((f) => /consolidation verification failed and was skipped/.test(f)))
})

test('total verdict loss: every lens verdict lost degrades the run and flags it', async () => {
  const { result, calls } = await med({ 'verify:': THROW })
  assert.ok(calls.some((l) => l.startsWith('verify:'))) // lens jobs were dispatched...
  assert.equal(result.verification.enforced, false) // ...but none survived
  assert.equal(result.status, 'degraded')
  assert.ok(result.reliabilityFlags.some((f) => /every verdict was lost/.test(f)))
})

test('consolidation verify payload: a long observation body is excerpted, not sent in full', async () => {
  let captured = ''
  const longBody = 'X'.repeat(4000)
  const capture = (prompt) => { captured = prompt; return { checksPerformed: ['x'], corrections: [], reliabilityFlags: [] } }
  const bigObs = () => ({ area: 'alpha', observations: [{ title: 'big', body: longBody, evidence: ['alpha.js:1'], significance: 'high' }] })
  const { calls } = await med({ verify: capture, 'area:alpha': bigObs })
  assert.ok(calls.includes('verify'))
  assert.ok(!captured.includes(longBody)) // the full body is not transmitted to the consolidation verifier
  assert.ok(captured.includes('X'.repeat(1200))) // the load-bearing opening is preserved
  assert.match(captured, /body excerpted/) // and marked as excerpted so the verifier knows it is partial
})

test('consolidation verify payload (single-pass path): a long body is excerpted at low effort too', async () => {
  let captured = ''
  const longBody = 'X'.repeat(4000)
  const capture = (prompt) => { captured = prompt; return { checksPerformed: ['x'], corrections: [], reliabilityFlags: [] } }
  const bigObs = () => ({ area: 'alpha', observations: [{ title: 'big', body: longBody, evidence: ['alpha.js:1'], significance: 'high' }] })
  const { calls } = await low({ verify: capture, 'area:alpha': bigObs })
  assert.ok(calls.includes('verify'))
  assert.ok(!captured.includes(longBody)) // the single-pass branch excerpts like the lens branch
  assert.ok(captured.includes('X'.repeat(1200)))
  assert.match(captured, /body excerpted/)
})

test('consolidation verify prompt: directs the verifier to re-read cited source for full claim text', async () => {
  let captured = ''
  const capture = (prompt) => { captured = prompt; return { checksPerformed: ['x'], corrections: [], reliabilityFlags: [] } }
  const { calls } = await med({ verify: capture })
  assert.ok(calls.includes('verify'))
  assert.match(captured, /re-read the cited source/i)
})

test('consolidation verify prompt (lens path): checks narrow to cross-reference + unprobed-tail spot-check', async () => {
  let captured = ''
  const capture = (prompt) => { captured = prompt; return { checksPerformed: ['x'], corrections: [], reliabilityFlags: [] } }
  const { calls } = await med({ verify: capture })
  assert.ok(calls.includes('verify'))
  // Narrowed check 1 resolves cross-observation disagreements against source.
  assert.match(captured, /re-read the cited source to determine which is right/)
  // Narrowed check 2 is scoped to the observations the lenses did not probe.
  assert.match(captured, /For each observation NOT in that list/)
  assert.ok(captured.includes('alpha / alpha observation')) // the probed-keys list still rides the prompt
  // The lens-covered checks are gone: the standalone numeric spot-check and the full-set
  // reliability sweep (anchors use the old block's unique wording — VERIFY_INTENSITY.medium
  // legitimately keeps a lowercase "spot-check the most significant numeric claim").
  assert.ok(!captured.includes('Spot-check the single most significant numeric claim'))
  assert.ok(!captured.includes('could have been truncated'))
  assert.ok(!captured.includes('Give the OTHER observations closer scrutiny'))
  // The shared riders survive the narrowing.
  assert.ok(captured.includes('Cross-reference overlapping claims across areas and spot-check the most significant numeric claim.'))
  assert.match(captured, /re-read the cited source rather than relying solely on the body text/)
})

test('consolidation verify prompt (single-pass path): the original three-check battery is unchanged at low effort', async () => {
  let captured = ''
  const capture = (prompt) => { captured = prompt; return { checksPerformed: ['x'], corrections: [], reliabilityFlags: [] } }
  const { calls } = await low({ verify: capture })
  assert.ok(calls.includes('verify'))
  assert.match(captured, /Perform these checks:/)
  assert.match(captured, /1\. Cross-reference claims across areas/)
  assert.ok(captured.includes('independently verify the shared element. Where areas are disjoint, say so and move on.'))
  assert.ok(captured.includes('2. Spot-check the single most significant numeric claim'))
  assert.ok(captured.includes('could have been truncated, timed out, or silently failed'))
  assert.ok(!captured.includes('already individually probed')) // no probed-keys steer on this branch
})

test('large run: every area is adversarially probed even when area count exceeds the minimum budget', async () => {
  // Seven areas (one observation each) — above MAX_VERIFY_TARGETS (6). With a fixed
  // budget the per-area floor fills all six slots with the first six areas and the
  // seventh (the kind of area completeness adds) gets zero lens coverage. The verify
  // label is 'verify:<lens>#<i>' where i is the observation's original index, so the
  // set of distinct indices probed is the set of observations that got any lens.
  const sevenAreaPlan = {
    overallQuestion: 'Is the thing sound?',
    effortRationale: 'seven facets',
    areas: Array.from({ length: 7 }, (_, n) => ({ name: 'area' + n, rationale: 'why ' + n, effort: 'medium' })),
  }
  const { result, calls } = await med({ plan: sevenAreaPlan })
  const probedIdx = new Set(
    calls.filter((l) => l.startsWith('verify:')).map((l) => l.slice(l.indexOf('#') + 1))
  )
  assert.equal(probedIdx.size, 7) // every area's observation was probed, not just the first six
  assert.equal(result.status, 'ok')
})

test('global-fill headroom: a hot area\'s second observation is probed, not just one per area', async () => {
  // Six areas — the starvation boundary, where the old budget equalled the area count (6) so the
  // per-area floor consumed every slot and the global-significance fill never ran. area0 carries a
  // SECOND high observation, so allObs is [area0#0, area0#1, area1, area2, area3, area4, area5] and
  // index 1 is area0's extra. The floor fills six slots (one per area); only the headroom that lifts
  // the budget above six lets the global fill reach index 1 — the globally-top observation the floor
  // skipped. Without the headroom, index 1 is never probed.
  const sixAreaPlan = {
    overallQuestion: 'Is the thing sound?',
    effortRationale: 'six facets',
    areas: Array.from({ length: 6 }, (_, n) => ({ name: 'area' + n, rationale: 'why ' + n, effort: 'medium' })),
  }
  const area0TwoObs = {
    area: 'area0',
    observations: [
      { title: 'area0 observation', body: 'b', evidence: ['area0.js:1'], significance: 'high' },
      { title: 'area0 second', body: 'b2', evidence: ['area0.js:2'], significance: 'high' },
    ],
  }
  const { result, calls } = await med({ plan: sixAreaPlan, 'area:area0': area0TwoObs })
  const probedIdx = new Set(
    calls.filter((l) => l.startsWith('verify:')).map((l) => l.slice(l.indexOf('#') + 1))
  )
  assert.ok(probedIdx.has('1'))   // area0's second (globally-top) observation got a lens
  assert.equal(probedIdx.size, 7) // all seven observations probed under the headroom budget
  assert.equal(result.status, 'ok')
})

test('ungrounded citations: a finding citation that does not resolve degrades the run', async () => {
  const ungrounded = { ungrounded: [{ citation: 'x.js:1', problem: 'missing', detail: 'no such line' }] }
  const { result, calls } = await med({ 'ground#': () => ungrounded })
  assert.ok(calls.some((l) => l.startsWith('ground#')))
  assert.equal(result.status, 'degraded')
  assert.ok(result.grounding.ungrounded.length > 0)
})

test('corrective grounding: a finding the ground agent rewrites is re-written and no longer degrades', async () => {
  const corrected = { ungrounded: [{ citation: 'alpha.js:1', problem: 'mismatch', detail: 'says X not Y' }], correctedBody: 'CORRECTED BODY TEXT' }
  const { result, calls } = await med({ 'ground#': () => corrected })
  assert.ok(calls.includes('rewrite-assessment'))            // the corrective re-write fired
  assert.ok(result.markdown.includes('CORRECTED BODY TEXT')) // the delivered document carries the fix
  assert.deepEqual(result.grounding.ungrounded, [])          // residual is empty — everything corrected
  assert.ok(result.grounding.corrected.length > 0)           // corrections are recorded
  assert.equal(result.status, 'ok')                          // fully corrected → not degraded
})

test('write join ordering: the initial persist is dispatched before the corrective re-write that overwrites it', async () => {
  // write-assessment runs concurrently with the Ground fan-out, but it must still be joined ahead
  // of rewrite-assessment, which overwrites the same path. Dispatch order is what the clockless
  // harness can observe; the explicit await enforcing resolution order lives in the script.
  const corrected = { ungrounded: [{ citation: 'alpha.js:1', problem: 'mismatch', detail: 'd' }], correctedBody: 'C' }
  const { calls } = await med({ 'ground#': () => corrected })
  const wrote = calls.indexOf('write-assessment')
  const rewrote = calls.indexOf('rewrite-assessment')
  assert.ok(wrote !== -1 && rewrote !== -1, 'both the initial persist and the corrective re-write fired')
  assert.ok(wrote < rewrote, 'write-assessment is ordered before rewrite-assessment')
})

test('partial correction: a corrected finding is re-written but an uncorrected mismatch still degrades', async () => {
  const fix = { ungrounded: [{ citation: 'alpha.js:1', problem: 'mismatch', detail: 'd' }], correctedBody: 'FIXED-1' }
  const noFix = { ungrounded: [{ citation: 'beta.js:1', problem: 'missing', detail: 'gone' }] }
  const { result } = await med({ 'ground#1': () => fix, 'ground#2': () => noFix })
  assert.ok(result.markdown.includes('FIXED-1'))             // finding 1 corrected in the document
  assert.deepEqual(result.grounding.corrected, [1])          // only finding 1 corrected
  assert.ok(result.grounding.ungrounded.some((u) => u.findingNumber === 2)) // finding 2 residual remains
  assert.equal(result.status, 'degraded')                    // uncorrected residual keeps it degraded
})

test('no corrective re-write when grounding finds nothing to correct', async () => {
  const { calls } = await med() // happy fixture: ground returns empty ungrounded, no correctedBody
  assert.ok(!calls.includes('rewrite-assessment'))
})

test('corrective re-write runs on the cheap tier', async () => {
  const corrected = { ungrounded: [{ citation: 'alpha.js:1', problem: 'mismatch', detail: 'd' }], correctedBody: 'C' }
  const { dispatches } = await med({ 'ground#': () => corrected })
  const rw = dispatches.find((d) => d.label === 'rewrite-assessment')
  assert.ok(rw, 'rewrite-assessment was dispatched')
  assert.equal(rw.model, 'sonnet')
})

const synthWith = (findings) => ({
  assessmentTitle: 'T', scopeSummary: 's', areasCovered: 'a', findings, summary: 'sum',
})

test('ground cap: only the top MAX_GROUND_TARGETS findings are dispatched', async () => {
  const seven = Array.from({ length: 7 }, (_, n) => ({
    number: n + 1, title: 'F' + (n + 1), significance: 'high', body: 'b' + (n + 1), citations: ['alpha.js:' + (n + 1)],
  }))
  const { calls } = await med({ synthesize: synthWith(seven) })
  for (let n = 1; n <= 6; n++) assert.ok(calls.includes('ground#' + n), 'ground#' + n + ' dispatched')
  assert.ok(!calls.includes('ground#7')) // the seventh finding falls past the grounding budget
})

test('out-of-band basis: citation-less findings are skipped and their slots backfill', async () => {
  const findings = [
    { number: 1, title: 'F1', significance: 'high', body: 'b1', citations: [], outOfBandBasis: ['human-reported ground truth items 5 and 7'] },
    ...Array.from({ length: 6 }, (_, n) => ({
      number: n + 2, title: 'F' + (n + 2), significance: 'high', body: 'b' + (n + 2), citations: ['alpha.js:' + (n + 2)],
    })),
  ]
  const { result, calls } = await med({ synthesize: synthWith(findings) })
  assert.ok(!calls.includes('ground#1')) // nothing groundable — no agent re-derives "unverifiable"
  assert.ok(calls.includes('ground#7')) // the freed slot backfills with the next groundable finding
  assert.equal(result.grounding.skipped, 1)
})

test('ground prompt excludes out-of-band basis', async () => {
  const one = [{ number: 1, title: 'F1', significance: 'high', body: 'b1', citations: ['alpha.js:1'], outOfBandBasis: ['user-stated intent'] }]
  let groundPrompt = ''
  const { calls } = await med({
    synthesize: synthWith(one),
    'ground#': (prompt) => { groundPrompt = prompt; return { ungrounded: [] } },
  })
  assert.ok(calls.includes('ground#1'))
  assert.ok(groundPrompt.includes('alpha.js:1'), 'the checkable citation reaches the agent')
  assert.ok(!groundPrompt.includes('user-stated intent'), 'the out-of-band basis does not reach the agent')
})

test('synthesis failure: a synthesizer that fails after retry produces a failed run', async () => {
  const { result } = await med({ synthesize: THROW })
  assert.equal(result.status, 'failed')
  assert.equal(result.error, 'synthesis failed')
})

test('write failure: a failed persist makes the run failed even though synthesis succeeded', async () => {
  const { result } = await med({ 'write-assessment': THROW })
  assert.equal(result.status, 'failed')
  assert.equal(result.error, 'synthesis failed')
})

test('empty observations (legitimate): no observations, no coverage loss, stays ok', async () => {
  const empty = (_p, opts) => ({ area: opts.label.slice(opts.label.indexOf(':') + 1), observations: [] })
  const { result } = await med({ 'area:': empty })
  assert.equal(result.status, 'ok') // a legitimately empty result is not a failure
  assert.equal(result.observationCount, 0)
  assert.equal(result.findingsCount, 0)
  assert.match(result.markdown, /produced no observations/)
})

test('empty observations + coverage loss: emptiness with dropped areas escalates to failed', async () => {
  const { result } = await med({ 'area:': THROW }) // every area fails → empty AND fully dropped
  assert.equal(result.status, 'failed')
  assert.equal(result.observationCount, 0)
  assert.equal(result.coverage.dropped.length, 3)
})

test('high effort: the overclaim lens is applied at high but not at medium', async () => {
  const hi = await high()
  assert.ok(hi.calls.some((l) => l.startsWith('verify:grounding+overclaim#')))
  const lo = await med()
  assert.ok(!lo.calls.some((l) => l.includes('overclaim')))
})

test('grounding lens prompt: carries the folded reliability instruction', async () => {
  let captured = ''
  const capture = (prompt) => { captured = prompt; return { verdict: 'holds', confidence: 'high', rationale: 'ok' } }
  const { calls } = await med({ 'verify:grounding#0': capture })
  assert.ok(calls.includes('verify:grounding#0'))
  // 'larger or different' is unique to the lens text, so that hit can only come from the
  // lens itself; 'reliabilityConcern' also appears in the output-fields instruction, so it
  // checks the prompt carries the field name, not the lens.
  assert.ok(captured.includes('larger or different than the evidence implies'))
  assert.ok(captured.includes('reliabilityConcern'))
  assert.ok(captured.includes('Grounding/citation accuracy'))
})

test('medium effort: a single combined lens dispatches per verify target', async () => {
  const { calls } = await med()
  assert.ok(calls.some((l) => l.startsWith('verify:grounding#')))
  assert.ok(!calls.some((l) => l.startsWith('verify:reliability#')))
})

test('high effort: lenses are grounding and overclaim only, merged into one verifier', async () => {
  const { calls } = await high()
  assert.ok(calls.some((l) => l.startsWith('verify:grounding+overclaim#')))
  assert.ok(!calls.some((l) => l.startsWith('verify:grounding#')))
  assert.ok(!calls.some((l) => l.startsWith('verify:overclaim#')))
  assert.ok(!calls.some((l) => l.startsWith('verify:reliability#')))
})

test('high effort: one merged verifier dispatches per verify target', async () => {
  const { calls } = await high()
  const verifyLabels = calls.filter((l) => l.startsWith('verify:'))
  // One merged job per probed observation (the fixture yields one observation per area),
  // not one per (observation × lens).
  assert.equal(verifyLabels.length, AREAS.length)
  assert.ok(verifyLabels.every((l) => l.startsWith('verify:grounding+overclaim#')))
})

test('merged verifier prompt: carries both lens texts and the resolution rule', async () => {
  let captured = ''
  const capture = (prompt) => { captured = prompt; return { verdict: 'holds', confidence: 'high', rationale: 'ok' } }
  const { calls } = await high({ 'verify:grounding+overclaim#0': capture })
  assert.ok(calls.includes('verify:grounding+overclaim#0'))
  // Unique anchors: each lens's opening phrase appears only in its VERIFY_LENSES text,
  // and the severity-resolution rule only in the merged closing instruction.
  assert.ok(captured.includes('Grounding/citation accuracy'))
  assert.ok(captured.includes('Over-claim / significance inflation'))
  assert.ok(captured.includes('drop > correct > holds'))
})

test('verify-lens prompt: names the top-level verdict fields the schema requires', async () => {
  // The lens agents' schema rejects any wrapper object (additionalProperties: false), and a prompt
  // that embeds an Observation JSON payload but never says what to return invites exactly that
  // wrapping. The prompt must state the output fields the way the Ground prompt states its own.
  let captured = ''
  const capture = (prompt) => { captured = prompt; return { verdict: 'holds', confidence: 'high', rationale: 'ok' } }
  const { calls } = await med({ 'verify:grounding#0': capture })
  assert.ok(calls.includes('verify:grounding#0'))
  assert.ok(captured.includes('top-level fields'))
  assert.ok(captured.includes('"verdict" (holds/correct/drop)'))
  assert.ok(captured.includes('never wrap'))
})

test('read-only tool framing: instructs paging large files across multiple Read calls', async () => {
  // A single whole-file Read of a large source fails on the token cap and loses the round-trip.
  // The paging guidance lives once in READ_ONLY_TOOLS so every tool-using role carries it; the
  // verify prompt is the capture site because lens verifiers re-read the primary source.
  let captured = ''
  const capture = (prompt) => { captured = prompt; return { verdict: 'holds', confidence: 'high', rationale: 'ok' } }
  await med({ 'verify:grounding#0': capture })
  assert.ok(captured.includes('Read large files in pages'))
  assert.ok(captured.includes('token cap'))
})

test('adaptive (no ceiling): a lone-high minority yields the median effort, not the max — the overclaim lens stays off', async () => {
  // 2 of 5 areas rated high, the rest lower. The old max rule made this a 'high' run; the
  // median lands it at 'medium', so the high-only overclaim lens never fires, while the
  // medium-gated stages (plan-critic, completeness, grounding) still do.
  const fiveAreas = {
    overallQuestion: 'Is the thing sound?',
    effortRationale: 'mixed facets',
    areas: [
      { name: 'a1', rationale: 'r', effort: 'high' },
      { name: 'a2', rationale: 'r', effort: 'high' },
      { name: 'a3', rationale: 'r', effort: 'medium' },
      { name: 'a4', rationale: 'r', effort: 'low' },
      { name: 'a5', rationale: 'r', effort: 'low' },
    ],
  }
  const { result, calls } = await adaptive({ plan: fiveAreas })
  assert.equal(result.effort, 'medium') // median of [high, high, medium, low, low]
  assert.ok(!calls.some((l) => l.startsWith('verify:overclaim#'))) // high-only lens does not fire
  // Sanity: genuinely medium (not damped all the way to low) — the medium-gated stages fired.
  assert.ok(calls.includes('plan-critic'))
  assert.ok(calls.includes('completeness-critic'))
  assert.ok(calls.some((l) => l.startsWith('ground#')))
})

test('plan revision honors the user effort ceiling (the post-revision recompute cannot drop below it)', async () => {
  // The critic rejects the plan; the revised plan's areas are all 'low'. Under a 'high'
  // ceiling the run's effort must stay 'high' (the ceiling wins), not collapse to the
  // revised areas' median — i.e. the post-revision effort recompute must still pass the ceiling.
  const rejected = { sound: false, issues: [{ kind: 'overlap', detail: 'areas overlap' }] }
  const revisedLow = {
    overallQuestion: 'Is the thing sound?',
    effortRationale: 'revised',
    areas: [
      { name: 'b1', rationale: 'r', effort: 'low' },
      { name: 'b2', rationale: 'r', effort: 'low' },
      { name: 'b3', rationale: 'r', effort: 'low' },
    ],
  }
  const { result, calls } = await high({ 'plan-critic': rejected, 'plan-revise': revisedLow })
  assert.ok(calls.includes('plan-revise')) // the revision path actually fired
  assert.equal(result.effort, 'high') // ceiling preserved through the recompute, not dropped to the revised median
})

test('high effort: the completeness loop runs at most EFFORT_ROUNDS.high (2) gap rounds', async () => {
  let round = 0
  const alwaysGap = () => { round += 1; return { complete: false, gaps: [{ name: 'gap-' + round, rationale: 'r' }] } }
  const { result, calls } = await high({ 'completeness-critic': alwaysGap })
  // The critic keeps reporting a gap, but the round cap stops the loop at exactly 2.
  assert.equal(calls.filter((l) => l === 'completeness-critic').length, 2)
  assert.ok(calls.includes('gap:gap-1'))
  assert.ok(calls.includes('gap:gap-2'))
  // 3 initial areas + 2 dispatched gap rounds.
  assert.equal(result.coverage.planned, 5)
})

test('high effort: a round that surfaces no new observations stops the loop early (diminishing returns)', async () => {
  // The critic keeps naming a fresh gap every round, so absent any guard the round cap would run 2.
  let round = 0
  const alwaysGap = () => { round += 1; return { complete: false, gaps: [{ name: 'gap-' + round, rationale: 'r' }] } }
  // ...but each gap area is investigated SUCCESSFULLY and returns zero observations. Coverage does
  // not grow, so the loop must stop after round 1 rather than pay for round 2's serial barrier.
  const emptyGap = (_p, opts) => ({ area: opts.label.slice(opts.label.indexOf(':') + 1), observations: [] })
  const { result, calls } = await high({ 'completeness-critic': alwaysGap, 'gap:': emptyGap })
  assert.equal(calls.filter((l) => l === 'completeness-critic').length, 1) // round 2's critic never runs
  assert.ok(calls.includes('gap:gap-1'))   // round 1 did investigate its gap
  assert.ok(!calls.includes('gap:gap-2'))  // round 2 was never dispatched
  assert.equal(result.status, 'ok')        // an early exit is normal, not a degradation
})

test('cheap write-agent: the verbatim write-assessment runs on the cheap tier, not the inherited top tier', async () => {
  const { dispatches } = await med()
  const write = dispatches.find((d) => d.label === 'write-assessment')
  assert.ok(write, 'write-assessment was dispatched')
  // Its whole job is one verbatim Write with no reasoning, so it must be pinned to the cheap
  // tier rather than inheriting the caller's top tier (which omitting `model` would do).
  assert.equal(write.model, 'sonnet')
})

test('model tiers: mechanical roles are pinned to the cheap tier; judgment roles inherit the caller', async () => {
  const { dispatches } = await med()
  // Pinned to the cheap tier: the area/gap investigators, the per-lens verifiers
  // (verify:<lens>#i), the grounding agents, and the verbatim write-agent — none reason.
  const CHEAP_PREFIX = /^(area:|gap:|verify:|ground#)/
  const CHEAP_EXACT = new Set(['source-digest', 'write-assessment', 'rewrite-assessment', 'apply-corrections'])
  // Inherit the caller's model: the judgment roles. NB: bare 'verify' is the consolidation
  // verifier (judgment) — distinct from the 'verify:<lens>#i' per-lens verifiers above.
  const INHERIT = new Set(['plan', 'plan-critic', 'plan-revise', 'completeness-critic', 'verify', 'synthesize'])
  for (const d of dispatches) {
    if (CHEAP_PREFIX.test(d.label) || CHEAP_EXACT.has(d.label)) {
      assert.equal(d.model, 'sonnet', `${d.label} should be pinned to the cheap tier`)
    } else if (INHERIT.has(d.label)) {
      assert.equal(d.model, undefined, `${d.label} should inherit the caller's model`)
    }
  }
})

test('completeness gap that keeps failing is re-proposable and never consumes a budget slot', async () => {
  const flaky = () => ({ complete: false, gaps: [{ name: 'flaky', rationale: 'r' }] })
  const { result, calls } = await high({ 'completeness-critic': flaky, 'gap:flaky': THROW })
  // Re-proposed and re-dispatched both rounds — the round-1 failure did not block it.
  assert.equal(calls.filter((l) => l === 'gap:flaky').length, 2)
  // 3 initial areas + 2 dispatched gap attempts; only the 3 initial areas produced coverage.
  assert.equal(result.coverage.planned, 5)
  assert.equal(result.coverage.completed, 3)
  assert.ok(result.coverage.dropped.includes('flaky'))
  assert.equal(result.status, 'degraded') // lost coverage, but observations remain
})

test('gap effort: a self-assessed low gap runs at its own low effort even when the run is high', async () => {
  // overallEffort is 'high' (the ceiling), but the completeness critic sizes this gap 'low' (a
  // binary/lookup facet). The gap must run at its OWN effort, not inherit the run's high. The
  // investigator prompt embeds 'Effort for this area: <effort>', so the gap's effort is observable.
  let captured = ''
  const capture = (prompt) => {
    captured = prompt
    return { area: 'narrowgap', observations: [{ title: 't', body: 'b', evidence: ['x.js:1'], significance: 'high' }] }
  }
  const { result } = await high({
    'completeness-critic': () => ({ complete: false, gaps: [{ name: 'narrowgap', rationale: 'r', effort: 'low' }] }),
    'gap:narrowgap': capture,
  })
  assert.match(captured, /Effort for this area: low/)        // ran at its own low effort...
  assert.ok(!/Effort for this area: high/.test(captured))    // ...not forced up to the run's high
  assert.equal(result.status, 'ok')
})

test('the completeness-critic payload is projected — observation bodies are not re-sent', async () => {
  let captured = ''
  const capture = (prompt) => { captured = prompt; return { complete: true, gaps: [] } }
  // alpha investigator returns an observation with a sentinel title + body.
  const sentinel = (_p, opts) => ({
    area: opts.label.slice(opts.label.indexOf(':') + 1),
    observations: [{ title: 'SENTINEL_TITLE', body: 'SENTINEL_BODY_PROSE', evidence: ['x.js:1'], significance: 'high' }],
  })
  const { calls } = await high({ 'area:alpha': sentinel, 'completeness-critic': capture })
  assert.ok(calls.includes('completeness-critic'))      // the critic actually ran
  assert.ok(captured.includes('SENTINEL_TITLE'))        // title (coverage signal) is present
  assert.ok(!captured.includes('SENTINEL_BODY_PROSE'))  // body prose is NOT re-sent
  assert.ok(!captured.includes('"body"'))               // the projection drops the body field entirely
})

test('completeness gap dedup: a gap differing from an existing area only by case/whitespace is rejected', async () => {
  // Existing areas are alpha/beta/gamma. A gap named 'Alpha' re-covers area 'alpha', but the
  // exact-name filter (`!areaNames.includes(g.name)`) let it through and spent a full investigator
  // on it. The normalized filter must reject it before the fan-out — no `gap:Alpha` is dispatched.
  const dupGap = () => ({ complete: false, gaps: [{ name: 'Alpha', rationale: 'r', effort: 'low' }] })
  const { calls } = await high({ 'completeness-critic': dupGap })
  assert.ok(calls.includes('completeness-critic'))   // the critic actually ran
  assert.ok(!calls.includes('gap:Alpha'))            // the case-only duplicate was filtered out
})

test('completeness-critic prompt: gaps must be semantically distinct, not the same theme re-named', async () => {
  // The critic was told only "do NOT propose any of these again" / "Do NOT restate covered ground" —
  // an exact-name steer. It must also be told a gap cannot be an existing theme under a different name.
  let captured = ''
  const capture = (prompt) => { captured = prompt; return { complete: true, gaps: [] } }
  const { calls } = await high({ 'completeness-critic': capture })
  assert.ok(calls.includes('completeness-critic'))
  assert.match(captured, /different name/)
})

test('synthesizer payload: corrections reach the synthesizer without re-sending the body or audit-only downgrade provenance', async () => {
  // Every probed observation gets a 'correct' verdict that both rewrites the claim and downgrades
  // significance, so applyVerdicts folds corrections + a significanceDowngrade into the kept set.
  // The synthesizer must see the actionable parts (now/why) but NOT the body-duplicating `was`
  // (the body is already at the observation root) nor the audit-only significanceDowngrade record.
  const correcting = () => ({ verdict: 'correct', confidence: 'high', correction: 'CORRECTED_CLAIM', correctedSignificance: 'medium', rationale: 'WHY_CORRECTED' })
  let captured = ''
  const capture = (prompt) => {
    captured = prompt
    return { assessmentTitle: 'T', scopeSummary: 's', areasCovered: 'a', findings: [], summary: 'sum' }
  }
  const { calls } = await high({ 'verify:': correcting, synthesize: capture })
  assert.ok(calls.includes('synthesize'))                // the synthesizer actually ran
  assert.match(captured, /CORRECTED_CLAIM/)              // the corrected claim (now) reaches it...
  assert.match(captured, /WHY_CORRECTED/)                // ...with its rationale (why)
  assert.ok(!captured.includes('"was"'))                 // the body-duplicating `was` field is gone
  assert.ok(!captured.includes('significanceDowngrade')) // audit-only downgrade provenance is gone
})

test('synthesizer payload: nothing from the consolidation verifier rides the synth prompt', async () => {
  // Consolidation corrections used to be JSON.stringify'd into the synthesize prompt as an
  // advisory instruction — the mechanism that let a false correction ship unrecorded. They are
  // now translated and applied in code after synthesis (apply-corrections → applyFindingCorrections),
  // so no field of the verification object may reach this (top-tier, largest) prompt: not the
  // corrections, and not the audit-only fields that were already projected out.
  const verification = {
    checksPerformed: ['CHECK_SENTINEL'],
    corrections: [{ claim: 'CLAIM_SENTINEL', issue: 'ISSUE_SENTINEL', correctedClaim: 'FIXED_SENTINEL' }],
    reliabilityFlags: ['FLAG_SENTINEL'],
  }
  let captured = ''
  const capture = (prompt) => {
    captured = prompt
    return { assessmentTitle: 'T', scopeSummary: 's', areasCovered: 'a', findings: [], summary: 'sum' }
  }
  const { calls } = await med({ verify: verification, synthesize: capture })
  assert.ok(calls.includes('synthesize'))          // the synthesizer actually ran
  assert.ok(!captured.includes('FIXED_SENTINEL'))  // corrections no longer ride the prompt...
  assert.ok(!captured.includes('CLAIM_SENTINEL'))
  assert.ok(!captured.includes('Cross-area verification corrections')) // ...nor their instruction header
  assert.ok(!captured.includes('FLAG_SENTINEL'))   // reliabilityFlags stay out (surfaced in the result instead)
  assert.ok(!captured.includes('CHECK_SENTINEL'))  // audit-only checksPerformed stays out
})

test('consolidation corrections: a cheap applier lands them on the findings before write and ground', async () => {
  // The consolidation verifier's corrections are claim-level free text with no finding target.
  // A cheap translation agent maps them onto finding numbers and the correction is applied in
  // code BEFORE the persist and BEFORE grounding — so corrected text is itself still grounded.
  const verification = {
    checksPerformed: [],
    corrections: [{ claim: 'CLAIM_SENTINEL', issue: 'ISSUE_SENTINEL', correctedClaim: 'FIXED_SENTINEL' }],
    reliabilityFlags: [],
  }
  let writePrompt = ''
  let groundPrompt = ''
  const { result, calls, dispatches } = await med({
    verify: verification,
    'apply-corrections': { corrections: [{ findingNumber: 1, correctedBody: 'CONSOLIDATION-CORRECTED BODY' }] },
    'write-assessment': (prompt) => { writePrompt = prompt; return { written: true, path: '/tmp/assessment-test.md' } },
    'ground#1': (prompt) => { groundPrompt = prompt; return { ungrounded: [] } },
  })
  const applier = dispatches.find((d) => d.label === 'apply-corrections')
  assert.ok(applier, 'apply-corrections was dispatched')
  assert.equal(applier.model, 'sonnet') // mechanical translation runs on the cheap tier
  assert.ok(calls.indexOf('apply-corrections') < calls.indexOf('write-assessment')) // applied before the persist
  assert.ok(result.markdown.includes('CONSOLIDATION-CORRECTED BODY')) // the delivered document carries the correction
  assert.ok(writePrompt.includes('CONSOLIDATION-CORRECTED BODY'))     // ...as does the persisted copy
  assert.ok(groundPrompt.includes('CONSOLIDATION-CORRECTED BODY'))    // grounding checks the corrected text
  assert.equal(result.status, 'ok')
})

test('consolidation-corrections applier is gated: no corrections, no findings, or failed synthesis skips it', async () => {
  // Happy fixture: the consolidation verifier returns no corrections → nothing to translate.
  const happy = await med()
  assert.ok(!happy.calls.includes('apply-corrections'))
  const corr = { checksPerformed: [], corrections: [{ claim: 'c', issue: 'i', correctedClaim: 'cc' }], reliabilityFlags: [] }
  // Corrections exist but synthesis produced zero findings → nothing to apply them to.
  const noFindings = await med({
    verify: corr,
    synthesize: { assessmentTitle: 'T', scopeSummary: 's', areasCovered: 'a', findings: [], summary: 'sum' },
  })
  assert.ok(!noFindings.calls.includes('apply-corrections'))
  // Corrections exist but the synthesizer failed → the run fails without dispatching the applier.
  const failed = await med({ verify: corr, synthesize: THROW })
  assert.ok(!failed.calls.includes('apply-corrections'))
  assert.equal(failed.result.status, 'failed')
})

test('consolidation-corrections applier failure: the run stays ok, is flagged, and the original body stands', async () => {
  const corr = { checksPerformed: [], corrections: [{ claim: 'c', issue: 'i', correctedClaim: 'cc' }], reliabilityFlags: [] }
  const { result, calls } = await med({ verify: corr, 'apply-corrections': THROW })
  assert.ok(calls.includes('apply-corrections')) // the applier was dispatched and failed after retry
  assert.equal(result.status, 'ok') // like the advisory critics, a lost applier does not degrade the run
  assert.ok(result.reliabilityFlags.some((f) => /consolidation corrections could not be applied/.test(f)))
  assert.ok(result.markdown.includes('b1')) // the original finding body stands uncorrected
})

// ---- verify-consolidation / synthesize overlap ----------------------------------------------
// The consolidation verifier and the synthesizer are the two slowest serial stages, and the only
// data flowing between them (corrections) is now applied in code after both settle — so the
// consolidation promise is held unawaited across the synthesize call and joined after it. These
// two scenarios prove the overlap on both dispatch paths: the verify override settles only on a
// later event-loop turn (setImmediate), so `overlapped` is true only if synthesize dispatched
// while the consolidation verify was still pending. safeVerify never rejects, so holding the
// promise is safe; the late-settling result must still reach the run's flags and audit.

const OVERLAP_SYNTH = {
  assessmentTitle: 'T',
  scopeSummary: 's',
  areasCovered: 'a',
  findings: [{ number: 1, title: 'F1', significance: 'high', body: 'b1', citations: ['alpha.js:1'] }],
  summary: 'sum',
}
const lateVerify = (onSettle) => () => new Promise((resolve) => setImmediate(() => {
  onSettle()
  resolve({ checksPerformed: ['late'], corrections: [], reliabilityFlags: ['LATE_FLAG'] })
}))

test('verify-consolidation overlaps synthesis (lens path): synthesize dispatches while consolidation is pending', async () => {
  let verifySettled = false
  let overlapped = false
  const { result, calls } = await med({
    verify: lateVerify(() => { verifySettled = true }),
    synthesize: () => { overlapped = !verifySettled; return OVERLAP_SYNTH },
  })
  assert.ok(calls.indexOf('verify') < calls.indexOf('synthesize')) // consolidation still dispatches first...
  assert.ok(overlapped, 'synthesize dispatched while the consolidation verify was still pending')
  assert.ok(result.reliabilityFlags.includes('LATE_FLAG'))         // the late result still reaches the run's flags
  assert.deepEqual(result.verification.checks.checksPerformed, ['late']) // ...and the verification audit
  assert.equal(result.status, 'ok')
})

test('verify-consolidation overlaps synthesis (single-pass path): the low-effort verifier is also held unawaited', async () => {
  let verifySettled = false
  let overlapped = false
  const { result, calls } = await low({
    verify: lateVerify(() => { verifySettled = true }),
    synthesize: () => { overlapped = !verifySettled; return OVERLAP_SYNTH },
  })
  assert.ok(calls.indexOf('verify') < calls.indexOf('synthesize'))
  assert.ok(overlapped, 'synthesize dispatched while the single-pass verify was still pending')
  assert.ok(result.reliabilityFlags.includes('LATE_FLAG'))
  assert.deepEqual(result.verification.checks.checksPerformed, ['late'])
  assert.equal(result.status, 'ok')
})

test('synthesizer fidelity: the prompt forbids claims and specifics not present in the observations', async () => {
  // The synthesizer is text-in/text-out with no read tools, so paraphrase drift here is only caught
  // downstream by grounding (capped + skipped at low effort). The prompt must direct it to stay within
  // the observations and carry cited specifics over verbatim, to lower the drift rate at the boundary.
  let captured = ''
  const capture = (prompt) => {
    captured = prompt
    return { assessmentTitle: 'T', scopeSummary: 's', areasCovered: 'a', findings: [], summary: 'sum' }
  }
  const { calls } = await med({ synthesize: capture })
  assert.ok(calls.includes('synthesize'))                         // the synthesizer actually ran
  assert.match(captured, /supported by the observation/i)         // only claim what the observations support
  assert.match(captured, /do NOT introduce|preserve .* exactly/i) // carry specifics over, don't invent them
})

test('plan-critic baseline: the critic is given the scope-size scaling rule to judge area count against', async () => {
  // The planner has explicit scaling rules (single file 1-3 areas, module 4-6, ...), but the critic
  // was asked to judge "count vs scope" with no baseline. It must now receive the same rule, or it
  // cannot catch over-decomposition (e.g. a single file split into six areas).
  let captured = ''
  const capture = (prompt) => { captured = prompt; return { sound: true, issues: [] } }
  const { calls } = await med({ 'plan-critic': capture })
  assert.ok(calls.includes('plan-critic'))   // the critic actually ran
  assert.match(captured, /1-3 areas/)        // the single-file bucket...
  assert.match(captured, /4-6 areas/)        // ...and the module bucket are present as the count baseline
})

test('plan-critic payload: each area carries its effort so over-granularity is visible', async () => {
  // The projection stripped effort (name + rationale only), hiding "many low-effort areas on one
  // file" from the critic. The per-area effort must now reach the critic. Fixture areas are medium.
  let captured = ''
  const capture = (prompt) => { captured = prompt; return { sound: true, issues: [] } }
  const { calls } = await med({ 'plan-critic': capture })
  assert.ok(calls.includes('plan-critic'))
  assert.match(captured, /"effort": "medium"/)   // effort is no longer stripped from the projection
})

test('planner prompt: areas must be mutually distinct, not merely semi-independent', async () => {
  // "semi-independent / explorable on its own" did not forbid overlap, so the planner could emit
  // areas that investigate the same ground. The prompt must explicitly demand mutually-distinct areas.
  let captured = ''
  const capture = (prompt) => {
    captured = prompt
    return { overallQuestion: 'q', effortRationale: 'r', areas: ['alpha', 'beta', 'gamma'].map((name) => ({ name, rationale: 'r', effort: 'medium' })) }
  }
  const { calls } = await med({ plan: capture })
  assert.ok(calls.includes('plan'))            // the planner actually ran
  assert.match(captured, /mutually distinct/)  // the distinctness instruction is present
})

test('read-only sub-agents are told to confine searches to scope, not scan $HOME or the filesystem root', async () => {
  // The investigator and the grounding agent both run live filesystem searches. Without a
  // breadth guardrail, an agent that cannot locate a path falls back to `find /` / `find ~`,
  // which is pathologically slow and, on macOS, blocks on per-app data-access prompts. The
  // guardrail lives once in READ_ONLY_TOOLS; grounding must reuse it (no inline drift), so
  // both prompts must carry it.
  let investPrompt = ''
  let groundPrompt = ''
  const captureInvest = (prompt, opts) => {
    investPrompt = prompt
    return { area: opts.label.slice(opts.label.indexOf(':') + 1), observations: [
      { title: 't', body: 'b', evidence: ['x.js:1'], significance: 'high' },
    ] }
  }
  const captureGround = (prompt) => { groundPrompt = prompt; return { ungrounded: [] } }
  await med({ 'area:alpha': captureInvest, 'ground#': captureGround })

  for (const [role, prompt] of [['investigator', investPrompt], ['grounding', groundPrompt]]) {
    assert.ok(prompt, `${role} prompt was captured`)
    // Positive: searches must be confined to the scope.
    assert.match(prompt, /confine/i, `${role} must be told to confine searches to the scope`)
    // Negative: the whole-machine traversals must be named as forbidden.
    assert.match(prompt, /home directory|filesystem root/i, `${role} must forbid scanning $HOME / the filesystem root`)
  }
})

test('low effort: plan-critic, completeness, lenses, and grounding are skipped and the run stays ok', async () => {
  const { result, calls } = await low()
  assert.equal(result.status, 'ok') // reduced rigor is not degradation
  assert.ok(!calls.includes('plan-critic')) // plan critic gated off at low
  assert.ok(!calls.includes('completeness-critic')) // EFFORT_ROUNDS.low = 0
  assert.ok(!calls.some((l) => l.startsWith('verify:'))) // EFFORT_LENSES.low = [] → no per-lens jobs
  assert.ok(!calls.some((l) => l.startsWith('ground#'))) // grounding gated off at low
  // The single-shot consolidation verify (exact label 'verify') still runs at low — not asserted absent.
})

// ---- source digest (one-time orientation map shared across the run's agents) ---------------
// A single agent reads the source once and hands the investigators, verifiers, and grounding
// agents a shared orientation map, so they target their reads instead of each re-orienting in
// the whole source. The map is advisory (every recipient still reads source); verifier prompts
// mark it navigation-only so the map shared with the investigators being checked never stands
// in as evidence, and the verbatim writer and corrections translator never receive it.

const SENTINEL_DIGEST = (_p, opts) =>
  (opts && opts.label) === 'source-digest'
    ? { overview: 'OVERVIEW', landmarks: [{ location: 'SENTINEL.js:42', what: 'SENTINEL_WHAT', relevance: 'SENTINEL_REL' }] }
    : null

test('source digest fires exactly once before the area fan-out and reaches the investigators', async () => {
  let investPrompt = ''
  const { calls } = await med({
    'source-digest': SENTINEL_DIGEST,
    'area:alpha': (prompt, opts) => {
      investPrompt = prompt
      return { area: opts.label.slice(opts.label.indexOf(':') + 1), observations: [
        { title: 't', body: 'b', evidence: ['x.js:1'], significance: 'high' },
      ] }
    },
  })
  const digestIdx = calls.indexOf('source-digest')
  const firstAreaIdx = calls.findIndex((l) => l.startsWith('area:'))
  assert.equal(calls.filter((l) => l === 'source-digest').length, 1) // dispatched exactly once
  assert.ok(digestIdx >= 0 && firstAreaIdx >= 0 && digestIdx < firstAreaIdx) // before the fan-out
  assert.match(investPrompt, /SENTINEL\.js:42/) // the map's landmark reached the investigator
  assert.match(investPrompt, /SENTINEL_WHAT/)
})

test('source digest reaches the lens verifiers and the consolidation verifier, marked navigation-only', async () => {
  let lensPrompt = ''
  let consolidationPrompt = ''
  const { result, calls } = await med({
    'source-digest': SENTINEL_DIGEST,
    'verify:': (prompt) => { lensPrompt = prompt; return { verdict: 'holds', confidence: 'high', rationale: 'ok' } },
    verify: (prompt) => { consolidationPrompt = prompt; return { checksPerformed: ['cross-ref'], corrections: [], reliabilityFlags: [] } },
  })
  assert.ok(calls.includes('source-digest')) // the digest actually fired (the override was live)
  assert.ok(lensPrompt && consolidationPrompt, 'lens and consolidation prompts were captured')
  assert.match(lensPrompt, /SENTINEL\.js:42/) // the map's landmark reached the lens verifier...
  assert.match(consolidationPrompt, /SENTINEL\.js:42/) // ...and the consolidation verifier
  // ...but marked navigation-only: verifiers check claims from the same investigators the map
  // was shared with, so the map itself must never stand in as evidence.
  assert.match(lensPrompt, /never as evidence/i)
  assert.match(consolidationPrompt, /never as evidence/i)
  assert.equal(result.status, 'ok')
})

test('the map never reaches the verbatim writer or the corrections translator', async () => {
  let writePrompt = ''
  let applierPrompt = ''
  const { result } = await med({
    'source-digest': SENTINEL_DIGEST,
    // A live correction forces the apply-corrections translator to dispatch.
    verify: { checksPerformed: ['cross-ref'], corrections: [{ claim: 'c', issue: 'i', correctedClaim: 'cc' }], reliabilityFlags: [] },
    'apply-corrections': (prompt) => { applierPrompt = prompt; return { corrections: [] } },
    'write-assessment': (prompt) => { writePrompt = prompt; return { written: true, path: '/tmp/assessment-test.md' } },
  })
  assert.ok(writePrompt && applierPrompt, 'write and applier prompts were captured')
  assert.ok(!writePrompt.includes('SENTINEL.js:42')) // neither the writer (no source access needed)...
  assert.ok(!applierPrompt.includes('SENTINEL.js:42')) // ...nor the translator (pure keyed rewrite) gets the map
  assert.ok(!/orientation map/i.test(writePrompt))
  assert.ok(!/orientation map/i.test(applierPrompt))
  assert.equal(result.status, 'ok')
})

test('source digest reaches the grounding agents', async () => {
  let groundPrompt = ''
  const { result, calls } = await med({
    'source-digest': SENTINEL_DIGEST,
    'ground#': (prompt) => { groundPrompt = prompt; return { ungrounded: [] } },
  })
  assert.ok(calls.includes('source-digest')) // the digest actually fired (the override was live)
  assert.ok(groundPrompt, 'ground prompt was captured')
  assert.match(groundPrompt, /SENTINEL\.js:42/) // the map's landmark reached the grounding agent
  assert.match(groundPrompt, /orientation map/i)
  assert.equal(result.status, 'ok')
})

test('source digest is skipped at low effort (a quick scan pays no front barrier)', async () => {
  const { calls } = await low()
  assert.ok(!calls.includes('source-digest'))
  assert.ok(calls.some((l) => l.startsWith('area:'))) // investigators still ran
})

test('source digest is skipped when there is a single area (no fan-out to amortize)', async () => {
  const onePlan = {
    overallQuestion: 'Is the thing sound?',
    effortRationale: 'one facet',
    areas: [{ name: 'solo', rationale: 'the only facet', effort: 'medium' }],
  }
  const { calls } = await med({ plan: onePlan })
  assert.ok(!calls.includes('source-digest'))
  assert.ok(calls.includes('area:solo')) // the lone investigator still ran
})

test('source digest failure is non-critical: investigators run unaided and the run stays ok', async () => {
  let investPrompt = ''
  const { result, calls } = await med({
    'source-digest': THROW,
    'area:alpha': (prompt, opts) => {
      investPrompt = prompt
      return { area: opts.label.slice(opts.label.indexOf(':') + 1), observations: [
        { title: 't', body: 'b', evidence: ['x.js:1'], significance: 'high' },
      ] }
    },
  })
  assert.ok(calls.includes('source-digest')) // it was dispatched and threw
  assert.ok(calls.some((l) => l.startsWith('area:'))) // investigators still ran
  assert.ok(!/orientation map/i.test(investPrompt)) // with no orientation block (digest produced nothing)
  assert.equal(result.status, 'ok') // a lost digest does not degrade the run
})

test('source digest runs on the cheap tier', async () => {
  const { dispatches } = await med()
  const digest = dispatches.find((d) => d.label === 'source-digest')
  assert.ok(digest, 'source-digest was dispatched')
  assert.equal(digest.model, 'sonnet')
})
