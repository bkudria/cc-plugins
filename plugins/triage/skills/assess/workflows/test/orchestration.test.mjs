// Integration suite for the investigate.js ORCHESTRATION — the agent()-driven stages and
// the failure-to-status mapping the pure unit suite (investigate.test.mjs) only ever
// exercises as signal-in/object-out. Each scenario rides one coherent happy fixture
// (see _harness.mjs) and overrides exactly one agent label to drive a single failure
// branch, then asserts on the workflow's real return value. Deterministic: no LLM, no IO.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runWorkflow, withOverrides, THROW } from './_harness.mjs'

const low = (overrides) => runWorkflow({ args: { scope: 's', effort: 'low' }, agent: withOverrides(overrides) })
const med = (overrides) => runWorkflow({ args: { scope: 's', effort: 'medium' }, agent: withOverrides(overrides) })
const high = (overrides) => runWorkflow({ args: { scope: 's', effort: 'high' }, agent: withOverrides(overrides) })

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

test('ungrounded citations: a finding citation that does not resolve degrades the run', async () => {
  const ungrounded = { ungrounded: [{ citation: 'x.js:1', problem: 'missing', detail: 'no such line' }] }
  const { result, calls } = await med({ 'ground#': () => ungrounded })
  assert.ok(calls.some((l) => l.startsWith('ground#')))
  assert.equal(result.status, 'degraded')
  assert.ok(result.grounding.ungrounded.length > 0)
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

test('high effort: the overclaim lens is dispatched at high but not at medium', async () => {
  const hi = await high()
  assert.ok(hi.calls.some((l) => l.startsWith('verify:overclaim#')))
  const lo = await med()
  assert.ok(!lo.calls.some((l) => l.startsWith('verify:overclaim#')))
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
  const CHEAP_EXACT = new Set(['write-assessment'])
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

test('low effort: plan-critic, completeness, lenses, and grounding are skipped and the run stays ok', async () => {
  const { result, calls } = await low()
  assert.equal(result.status, 'ok') // reduced rigor is not degradation
  assert.ok(!calls.includes('plan-critic')) // plan critic gated off at low
  assert.ok(!calls.includes('completeness-critic')) // EFFORT_ROUNDS.low = 0
  assert.ok(!calls.some((l) => l.startsWith('verify:'))) // EFFORT_LENSES.low = [] → no per-lens jobs
  assert.ok(!calls.some((l) => l.startsWith('ground#'))) // grounding gated off at low
  // The single-shot consolidation verify (exact label 'verify') still runs at low — not asserted absent.
})
