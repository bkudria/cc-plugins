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

test('corrective grounding: a finding the ground agent rewrites is re-written and no longer degrades', async () => {
  const corrected = { ungrounded: [{ citation: 'alpha.js:1', problem: 'mismatch', detail: 'says X not Y' }], correctedBody: 'CORRECTED BODY TEXT' }
  const { result, calls } = await med({ 'ground#': () => corrected })
  assert.ok(calls.includes('rewrite-assessment'))            // the corrective re-write fired
  assert.ok(result.markdown.includes('CORRECTED BODY TEXT')) // the delivered document carries the fix
  assert.deepEqual(result.grounding.ungrounded, [])          // residual is empty — everything corrected
  assert.ok(result.grounding.corrected.length > 0)           // corrections are recorded
  assert.equal(result.status, 'ok')                          // fully corrected → not degraded
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
  const CHEAP_EXACT = new Set(['source-digest', 'write-assessment', 'rewrite-assessment'])
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

// ---- source digest (one-time orientation map shared by the area investigators) -------------
// A single agent reads the source once and hands every investigator a shared orientation map,
// so they target their reads instead of each re-ingesting the whole source. The map is advisory
// (investigators still read source) and scoped to investigators only — verify and grounding keep
// raw-source access because they re-derive citations against actual source.

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

test('source digest is for investigators only: verify and grounding never receive the map', async () => {
  let verifyPrompt = ''
  let groundPrompt = ''
  const { calls } = await med({
    'source-digest': SENTINEL_DIGEST,
    'verify:': (prompt) => { verifyPrompt = prompt; return { verdict: 'holds', confidence: 'high', rationale: 'ok' } },
    'ground#': (prompt) => { groundPrompt = prompt; return { ungrounded: [] } },
  })
  assert.ok(calls.includes('source-digest')) // the digest actually fired (the override was live)...
  assert.ok(verifyPrompt && groundPrompt, 'verify and ground prompts were captured')
  assert.ok(!verifyPrompt.includes('SENTINEL.js:42')) // ...but the map is absent from the verify prompt
  assert.ok(!groundPrompt.includes('SENTINEL.js:42')) // ...and from the grounding prompt
  assert.ok(!/orientation map/i.test(verifyPrompt))
  assert.ok(!/orientation map/i.test(groundPrompt))
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
