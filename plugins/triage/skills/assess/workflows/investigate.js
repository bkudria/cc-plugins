export const meta = {
  name: 'assess-investigate',
  description: 'Autonomous investigation core for the assess skill: plan areas, investigate each in parallel, check coverage for gaps, cross-verify, synthesize a numbered observation-only assessment and write it to disk, then ground finding citations against source',
  whenToUse: 'Invoked by the assess skill (by path) once scope/focus/effort are resolved. Runs Phases 2-4 headless; the skill keeps Phase 0-1 (scope resolution + interview).',
  phases: [
    { title: 'Plan', detail: 'break the scope into semi-independent areas' },
    { title: 'Investigate', detail: 'one agent per area, observation-only, in parallel' },
    { title: 'Completeness', detail: 'critic names coverage gaps; effort-scaled targeted re-investigation' },
    { title: 'Verify', detail: 'per-observation adversarial lenses on the most significant observations; verdicts applied in code (drop/correct), then a cross-area consolidation barrier, with a verification audit trail in the result' },
    { title: 'Synthesize', detail: 'merge/filter/order into structured numbered findings, render the markdown deterministically, and write the file; a degraded or failed run is reflected in the result status and coverage' },
    { title: 'Ground', detail: 'post-synthesis grounding: re-read each finding citation against source and flag any that do not resolve' },
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

const scope = P.scope
if (!scope) {
  log('No scope provided. Pass args.scope (the area to investigate).')
  return { status: 'failed', error: 'scope is required', findingsCount: 0 }
}
const focus = P.focus ||
  'problems, gaps, risks, inconsistencies, surprising patterns, missing pieces, and opportunities for improvement'
const EFFORT_LEVELS = ['low', 'medium', 'high']
// `effort` is an OPTIONAL ceiling/bias. When absent, the planner allocates
// effort adaptively per area; when set, it caps each area's effort.
const effortCeiling = EFFORT_LEVELS.includes(P.effort) ? P.effort : null
const sessionId = P.sessionId || 'latest'
const outPath = P.outPath || '/tmp/assessment-' + sessionId + '.md'

const MAX_AREAS = 8
// A plan-critic reviews the decomposition before fan-out, but only once there are
// enough areas for coverage/overlap problems to be real; below this a 1-2 area split
// can't meaningfully be mis-divided, so the critic is skipped.
const PLAN_CRITIC_MIN_AREAS = 3
// Completeness-critic loop: max critic rounds scale with overall effort, so
// simple scopes never pay for it. Each round may surface a few gap areas, hard-
// capped so initial + gap areas can never run away.
const EFFORT_ROUNDS = { low: 0, medium: 1, high: 2 }
const MAX_GAPS_PER_ROUND = 3
const MAX_TOTAL_AREAS = MAX_AREAS + 4
const EFFORT_GUIDANCE = {
  low: '1-2 targeted reads; confirm the load-bearing facts and move on — do not go deep.',
  medium: '5-10 tool calls; survey the area, then dig into whatever looks noteworthy.',
  high: 'Exhaustive — follow every thread, read adjacent code, check edge cases; spend as many tool calls as the area genuinely warrants.',
}
const VERIFY_INTENSITY = {
  low: 'Effort is low — keep verification light; independently check only the single most load-bearing claim.',
  medium: 'Cross-reference overlapping claims across areas and spot-check the most significant numeric claim.',
  high: 'Be thorough — cross-reference every overlapping claim, spot-check each significant numeric claim, and independently re-derive the most consequential findings.',
}
// Adversarial verification: the most significant observations are each probed by
// perspective-diverse skeptic lenses before a consolidation barrier. Effort sets
// the lens COUNT (low skips the fan-out entirely); significance sets WHICH
// observations get the lenses (top-K). Both caps keep cost bounded regardless of
// observation count, and a consolidation agent preserves the cross-reference and
// numeric spot-check the single-pass verifier did.
const MAX_VERIFY_TARGETS = 6
// Post-synthesis grounding re-reads each finding's cited source. Bounded like the verify
// stage: only the top-K significance-ordered findings are grounded, so cost and wall-clock
// stay flat regardless of how many findings synthesis emits.
const MAX_GROUND_TARGETS = 6
const VERIFY_LENSES = {
  grounding: 'Grounding/citation accuracy. Independently re-derive this observation\'s cited evidence from source using your read-only tools. Do the named files, line numbers, and values actually exist and say what the observation claims? Verdict "drop" if the evidence is fabricated or does not support the claim; "correct" if it is partially right with a fixable inaccuracy; "holds" if fully grounded.',
  overclaim: 'Over-claim / significance inflation. Judge whether the observation\'s framing and significance are justified by its evidence, or inflated. Is a "high" significance genuinely load-bearing, or is this working-as-designed, minor, or speculative? Verdict "correct" to downgrade or reframe; "drop" if it is not a real issue; "holds" if proportionate.',
  reliability: 'Reliability / truncation. Judge whether this observation could rest on tool output that was truncated, timed out, or silently failed. Use your tools to check whether the underlying source is larger or different than the evidence implies. Record any concern in reliabilityConcern; verdict "drop" if the basis is likely unreliable; "holds" if solid.',
}
const EFFORT_LENSES = {
  low: [],
  medium: ['grounding', 'reliability'],
  high: ['grounding', 'overclaim', 'reliability'],
}
// Shared read-only framing for the tool-using sub-agents (investigator + the two
// verifiers): one identical statement of the toolset and the primary-source
// discipline, so these roles cannot drift on how they phrase it. Each role keeps its
// own output discipline (observation-only / no fixes / no new findings) inline.
const READ_ONLY_TOOLS =
  'You have read-only tools (Read, Grep, Glob, Bash). Use them to consult primary sources directly: ' +
  'read the actual files and run the actual searches rather than relying on memory or inference.'
// Cap a planner-proposed effort at the optional user ceiling (low < medium < high).
const clampEffort = (proposed, ceiling) => {
  const p = EFFORT_LEVELS.indexOf(proposed)
  const safe = p === -1 ? EFFORT_LEVELS.indexOf('medium') : p
  if (!ceiling) return EFFORT_LEVELS[safe]
  return EFFORT_LEVELS[Math.min(safe, EFFORT_LEVELS.indexOf(ceiling))]
}

// Retry a bare critical-path agent() call once on throw. parallel() swallows a
// throw to null, but a bare `await agent()` on the critical path (planner, synth)
// propagates uncaught and kills the whole run; one retry absorbs a transient
// failure. Returns null if both attempts throw — the caller decides how to degrade.
const withRetry = async (label, fn) => {
  try { return await fn() }
  catch (e1) {
    log('Stage "' + label + '" threw (' + ((e1 && e1.message) || e1) + '); retrying once.')
    try { return await fn() }
    catch (e2) {
      log('Stage "' + label + '" failed after retry (' + ((e2 && e2.message) || e2) + ').')
      return null
    }
  }
}

// Derive the run's status + normalized coverage from the raw degradation signals.
// Pure (signals in, plain object out — no injected globals), so it is the first
// unit to cover when a JS test harness lands.
//   'failed'   — no usable synthesis (planner died, or synth failed after retry).
//   'degraded' — produced output but lost coverage (areas dropped) or skipped/lost verify.
//   'ok'       — no losses (a legitimately empty result is still 'ok'; its document
//                shape is owned elsewhere).
/* test-seam:pure-fn:start */
const degradationSummary = ({ plannedAreas, droppedAreas, synthOk, verifyFailed, verifyLost }) => {
  const status = !synthOk ? 'failed'
    : (droppedAreas.length > 0 || verifyFailed || verifyLost) ? 'degraded'
    : 'ok'
  return { status, coverage: { planned: plannedAreas, completed: plannedAreas - droppedAreas.length, dropped: droppedAreas } }
}
/* test-seam:pure-fn:end */

// Flat scalar audit summary for Phase 3: collapses the run's verification, grounding,
// and funnel signals into a notification-safe set of counts (the nested verification/
// grounding objects are truncated from the completion notification). The observations→
// synthesized→findings funnel is reported as raw counts so the reduction is visible
// without claiming a single "filtered" number (merge/split make it non-linear). Pure
// (signals in, plain object out), so it is unit-tested alongside degradationSummary.
/* test-seam:pure-fn:start */
const summarizeAudit = ({ status, observationCount, synthInputCount, findingsCount, auditActions, grounding, reliabilityFlags }) => {
  const count = (action) => auditActions.filter((a) => a.action === action).length
  return {
    status,
    observations: observationCount,
    synthesized: synthInputCount,
    findings: findingsCount,
    corrected: count('corrected'),
    dropped: count('dropped'),
    flagged: count('flagged'),
    ungrounded: grounding && Array.isArray(grounding.ungrounded) ? grounding.ungrounded.length : 0,
    reliabilityFlags: Array.isArray(reliabilityFlags) ? reliabilityFlags.length : 0,
  }
}
/* test-seam:pure-fn:end */

// Render the final assessment markdown DETERMINISTICALLY from the synthesizer's
// structured output. Formatting — the "### N. Title" finding headings, the
// "**Significance**:" line under each, the three structural h2s, the single-paragraph
// bodies — is owned by code, not the LLM, so the document shape cannot drift: the
// synthesizer supplies only field VALUES. Pure
// (structure in, string out — no injected globals); the prime unit to cover when a JS
// test harness lands. Citations are intentionally NOT rendered (internal grounding only).
/* test-seam:pure-fn:start */
const renderAssessment = ({ assessmentTitle, scopeSummary, areasCovered, findings, summary }) => {
  const parts = [
    '## Assessment: ' + assessmentTitle,
    '',
    '**Scope**: ' + scopeSummary,
    '**Areas covered**: ' + areasCovered,
    '',
    '## Findings',
    '',
  ]
  for (const f of findings) {
    parts.push('### ' + f.number + '. ' + f.title, '**Significance**: ' + f.significance, '', f.body, '')
  }
  parts.push('## Summary', '', summary, '')
  return parts.join('\n')
}
/* test-seam:pure-fn:end */

// ---- Plan -------------------------------------------------------------------
phase('Plan')
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overallQuestion', 'effortRationale', 'areas'],
  properties: {
    overallQuestion: { type: 'string', description: 'The cohesive question this investigation answers' },
    effortRationale: { type: 'string', description: 'One line: how complex the scope is and why this many areas at these effort levels' },
    areas: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_AREAS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'rationale', 'effort'],
        properties: {
          name: { type: 'string' },
          rationale: { type: 'string', description: 'One line: why this facet matters to the overall question' },
          effort: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How much investigation this facet warrants' },
        },
      },
    },
  },
}
const PLAN_REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sound', 'issues'],
  properties: {
    sound: { type: 'boolean', description: 'true if the areas cover the question, are mutually distinct, and the count fits the scope' },
    issues: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'detail'],
        properties: {
          kind: { type: 'string', enum: ['coverage', 'overlap', 'count'] },
          detail: { type: 'string', description: 'One line: the specific gap, overlap, or sizing problem' },
        },
      },
    },
  },
}
const ceilingNote = effortCeiling
  ? 'The user capped effort at "' + effortCeiling + '" — do NOT assign any area a higher effort than that, and lean toward fewer areas.\n'
  : 'No effort cap was given — allocate adaptively to fit the scope you find.\n'
// One source of truth for how to decompose the scope, used for the initial plan and
// for the plan-critic's single revision. `revisionNote` is empty on the first pass and
// carries the critique on a re-plan, so both plans obey identical decomposition rules.
const buildPlanPrompt = (revisionNote) =>
  'You are planning an investigation (an assessment), not performing it.\n\n' +
  'Scope: ' + scope + '\n' +
  'Focus: ' + focus + '\n\n' +
  'First judge how complex this scope actually is, then allocate investigation resources to match — ' +
  'do not over-invest in a simple scope. Scaling rules:\n' +
  '- Narrow / simple scope (a single file, a small config): 1-3 areas.\n' +
  '- Moderate scope (a feature, a module): 4-6 areas.\n' +
  '- Broad / complex scope (a whole subsystem, cross-cutting concerns): up to ' + MAX_AREAS + ' areas.\n' +
  ceilingNote + '\n' +
  'Break the scope into semi-independent areas that TOGETHER cohesively investigate the overall question — ' +
  'facets of one investigation, not a disconnected inventory. Each area should be explorable on its own. ' +
  'For each area give a short name, a one-line rationale, and an effort level (low / medium / high) sized to ' +
  'how much that facet warrants. Also give a one-line effortRationale for the overall allocation. ' +
  (revisionNote || '') +
  'Do NOT investigate yet and do NOT propose fixes.'
const plan = await withRetry('plan', () => agent(buildPlanPrompt(''), { label: 'plan', schema: PLAN_SCHEMA }))
if (!plan) {
  log('Planning failed after retry; cannot investigate.')
  return { status: 'failed', error: 'planning failed', scope, findingsCount: 0 }
}

// Normalize a raw plan's areas: cap the count (logging any drop) and clamp each area's
// effort to the optional user ceiling. Shared by the initial plan and the plan-critic's
// revision so a revised plan can never bypass the bounds.
const finalizeAreas = (raw) => {
  let a = raw
  if (a.length > MAX_AREAS) {
    log('Planner proposed ' + a.length + ' areas; capping at ' + MAX_AREAS +
      ' (dropped: ' + a.slice(MAX_AREAS).map((x) => x.name).join(', ') + ').')
    a = a.slice(0, MAX_AREAS)
  }
  return a.map((x) => ({ ...x, effort: clampEffort(x.effort, effortCeiling) }))
}
// Overall effort = the user ceiling if set, else the most ambitious area's effort.
const deriveOverallEffort = (a) => effortCeiling ||
  EFFORT_LEVELS[Math.max.apply(null, a.map((x) => EFFORT_LEVELS.indexOf(x.effort)))]

let areas = finalizeAreas((plan && plan.areas) || [])
if (!areas.length) {
  log('Planner produced no areas; nothing to investigate.')
  return { status: 'failed', error: 'no areas planned', scope, findingsCount: 0 }
}
let overallEffort = deriveOverallEffort(areas)
/* test-seam:pure-fn:start */
// Select the overall question that frames every post-plan agent. A revised plan's
// question (when a revision is adopted and carries one) supersedes the original
// planner's; absent that, the planner's question, falling back to the raw scope.
// Pure (plans in, string out — no injected globals).
const pickOverallQuestion = ({ plan, revised, scope }) => {
  if (revised && revised.overallQuestion) return revised.overallQuestion
  if (plan && plan.overallQuestion) return plan.overallQuestion
  return scope
}
/* test-seam:pure-fn:end */
let overallQuestion = pickOverallQuestion({ plan, scope })

// ---- Plan critic (gated; one bounded revision) ------------------------------
// Before paying for fan-out, a no-tool critic judges the decomposition for coverage,
// disjointness, and count. Gated on effort + size so simple scopes skip it. On a genuine
// problem one revised plan is requested through the same prompt and bounds; a revision
// that yields nothing usable falls back to the original plan.
if (overallEffort !== 'low' && areas.length >= PLAN_CRITIC_MIN_AREAS) {
  const review = await withRetry('plan-critic', () => agent(
    'You are reviewing a planned decomposition of an investigation (an assessment) BEFORE it runs — ' +
    'not performing it.\n\n' +
    'Scope: ' + scope + '\n' +
    'Overall question: ' + overallQuestion + '\n' +
    'Focus: ' + focus + '\n\n' +
    'Proposed areas (JSON):\n' +
    JSON.stringify(areas.map((a) => ({ name: a.name, rationale: a.rationale })), null, 2) + '\n\n' +
    'Judge the decomposition on three axes:\n' +
    '- coverage: do the areas TOGETHER cover the overall question, or is a material facet left out?\n' +
    '- overlap: do any two areas investigate the same ground (which would duplicate cost)?\n' +
    '- count: is the number of areas sized to the scope, or clearly too many / too few?\n\n' +
    'Name only GENUINE structural problems. Do NOT investigate the scope, do NOT propose fixes, and do NOT ' +
    'invent issues to seem thorough. If the decomposition is sound, set sound=true and return an empty issues list.',
    { label: 'plan-critic', phase: 'Plan', schema: PLAN_REVIEW_SCHEMA }
  ))
  const issues = (review && review.issues) || []
  if (review && review.sound === false && issues.length) {
    log('Plan critic flagged ' + issues.length + ' issue(s) (' + issues.map((i) => i.kind).join(', ') +
      '); revising once.')
    const revisionNote =
      'A prior decomposition of this scope was REJECTED before investigation. Issues found:\n' +
      issues.map((i) => '- [' + i.kind + '] ' + i.detail).join('\n') + '\n' +
      'The rejected areas were: ' + areas.map((a) => a.name).join('; ') + '.\n' +
      'Produce a better decomposition that closes the coverage gaps, makes the areas mutually distinct, and ' +
      'sizes the count to the scope.\n'
    const revised = await withRetry('plan-revise', () => agent(buildPlanPrompt(revisionNote), { label: 'plan-revise', phase: 'Plan', schema: PLAN_SCHEMA }))
    const revisedAreas = finalizeAreas((revised && revised.areas) || [])
    if (revisedAreas.length) {
      areas = revisedAreas
      overallEffort = deriveOverallEffort(areas)
      overallQuestion = pickOverallQuestion({ plan, revised, scope })
      log('Revised plan: ' + areas.length + ' area(s).')
    } else {
      log('Revision produced no usable areas; keeping original plan.')
    }
  } else {
    log('Plan critic: decomposition sound.')
  }
}

const areaNames = areas.map((a) => a.name)
log('Investigating ' + areas.length + ' area(s) at ' + overallEffort + ' effort: ' + areaNames.join(', '))

// ---- Investigate (parallel fan-out, observation-only) -----------------------
phase('Investigate')
const OBS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'observations'],
  properties: {
    area: { type: 'string' },
    observations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'body', 'evidence', 'significance'],
        properties: {
          title: { type: 'string', description: 'Short descriptive title' },
          body: { type: 'string', description: 'Single paragraph: what IS and why noteworthy. No fixes.' },
          evidence: {
            type: 'array',
            items: { type: 'string' },
            description: 'Concrete evidence: file paths, line numbers, values, patterns',
          },
          significance: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
}
// Investigate one area, observation-only. Shared by the initial fan-out and the
// completeness-critic gap rounds so both dispatch an identical prompt/schema/model.
const investigateArea = (a, phaseName) =>
  agent(
    'Investigate the area "' + a.name + '" within this scope: ' + scope + '\n' +
    'Why this area matters: ' + a.rationale + '\n' +
    'Overall question: ' + overallQuestion + '\n' +
    'Other areas in this investigation (context only — do NOT investigate these): ' +
    areaNames.filter((n) => n !== a.name).join('; ') + '\n' +
    'Look for: ' + focus + '\n' +
    'Effort for this area: ' + a.effort + ' — ' + EFFORT_GUIDANCE[a.effort] + '\n\n' +
    READ_ONLY_TOOLS + '\n\n' +
    'OBSERVATION-ONLY. Do NOT suggest fixes, solutions, or what "should" be done. Record only what IS and why ' +
    'it is noteworthy. Every observation MUST include concrete evidence: file paths, line numbers, configuration ' +
    'values, or specific patterns — observations without evidence are opinions, not findings. ' +
    'Set "area" to exactly: ' + a.name,
    { label: (phaseName === 'Completeness' ? 'gap:' : 'area:') + a.name, phase: phaseName, schema: OBS_SCHEMA, model: 'sonnet' }
  )

const droppedAreaNames = []
let dispatchedAreas = areas.length
const investResults = await parallel(
  areas.map((a) => () => investigateArea(a, 'Investigate'))
)
areas.forEach((a, i) => { if (!investResults[i]) droppedAreaNames.push(a.name) })
const investigations = investResults.filter(Boolean)
if (droppedAreaNames.length) {
  log(droppedAreaNames.length + ' area(s) failed to investigate and were dropped: ' + droppedAreaNames.join(', ') + '.')
}
// Flatten investigator results into one observation list (shared by the initial
// fan-out and the completeness gap rounds).
const collectObs = (invs) => invs.flatMap((i) =>
  (i.observations || []).map((o) => ({ area: i.area, title: o.title, body: o.body, evidence: o.evidence, significance: o.significance }))
)
const allObs = collectObs(investigations)
log('Collected ' + allObs.length + ' observation(s) across ' + investigations.length + ' area(s).')
if (!allObs.length) {
  log('No observations produced; writing an empty assessment.')
}

// ---- Completeness critic (effort-scaled, bounded) ---------------------------
// Single-pass investigation can miss a facet the planner never decomposed, or a
// thread an area surfaced but did not own. A bounded critic names genuine gaps;
// each becomes a new area run through the same investigator. Rounds scale with
// effort (low -> none), so simple scopes stay a pure single pass. Verify runs
// after this loop, so it covers the full accumulated observation set.
const criticRounds = EFFORT_ROUNDS[overallEffort] || 0
if (criticRounds > 0 && allObs.length) {
  phase('Completeness')
  const GAP_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['complete', 'gaps'],
    properties: {
      complete: { type: 'boolean', description: 'true if coverage is sufficient and no further investigation is warranted' },
      gaps: {
        type: 'array',
        maxItems: MAX_GAPS_PER_ROUND,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'rationale'],
          properties: {
            name: { type: 'string', description: 'Short name for the uncovered facet (becomes a new area)' },
            rationale: { type: 'string', description: 'One line: what thread/facet is uncovered and why it matters to the overall question' },
          },
        },
      },
    },
  }
  let roundsLeft = criticRounds
  while (roundsLeft-- > 0) {
    const headroom = MAX_TOTAL_AREAS - areaNames.length
    if (headroom <= 0) break
    const critique = await withRetry('completeness-critic', () => agent(
      'You are a completeness critic for an investigation (an assessment). Judge whether the areas already ' +
      'investigated TOGETHER cover the overall question, or whether a material facet was missed.\n\n' +
      'Scope: ' + scope + '\n' +
      'Overall question: ' + overallQuestion + '\n' +
      'Focus: ' + focus + '\n' +
      'Areas already investigated (do NOT propose any of these again): ' + areaNames.join('; ') + '\n\n' +
      'Observations gathered so far (JSON):\n' + JSON.stringify(allObs, null, 2) + '\n\n' +
      'Name only GENUINE gaps: a facet, thread, or area materially relevant to the overall question that the ' +
      'existing areas do not cover — an unplanned thread surfaced by an observation counts. Do NOT restate ' +
      'covered ground, do NOT propose fixes, and do NOT invent gaps to seem thorough. If coverage is already ' +
      'sufficient, set complete=true and return an empty gaps list. At most ' + MAX_GAPS_PER_ROUND + ' gaps.',
      { label: 'completeness-critic', phase: 'Completeness', schema: GAP_SCHEMA }
    ))
    const fresh = ((critique && critique.gaps) || [])
      .filter((g) => g && g.name && !areaNames.includes(g.name))
      .slice(0, headroom)
    if ((critique && critique.complete) || !fresh.length) {
      log('Completeness critic: coverage sufficient — no further investigation.')
      break
    }
    const gapAreas = fresh.map((g) => ({ name: g.name, rationale: g.rationale, effort: clampEffort(overallEffort, effortCeiling) }))
    gapAreas.forEach((a) => areaNames.push(a.name))
    log('Completeness critic: investigating ' + gapAreas.length + ' gap area(s): ' + gapAreas.map((a) => a.name).join(', ') + '.')
    const gapResults = await parallel(
      gapAreas.map((a) => () => investigateArea(a, 'Completeness'))
    )
    dispatchedAreas += gapAreas.length
    gapAreas.forEach((a, i) => { if (!gapResults[i]) droppedAreaNames.push(a.name) })
    const gapInvestigations = gapResults.filter(Boolean)
    const gapObs = collectObs(gapInvestigations)
    allObs.push(...gapObs)
    log('Completeness round added ' + gapObs.length + ' observation(s); ' + allObs.length + ' total across ' + areaNames.length + ' area(s).')
  }
}

// ---- Verify (adversarial lenses on the top-K → verdicts applied in code → cross-area barrier → audit trail) -
phase('Verify')
const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['checksPerformed', 'corrections', 'reliabilityFlags'],
  properties: {
    checksPerformed: { type: 'array', items: { type: 'string' } },
    corrections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'issue', 'correctedClaim'],
        properties: {
          claim: { type: 'string' },
          issue: { type: 'string' },
          correctedClaim: { type: 'string' },
        },
      },
    },
    reliabilityFlags: { type: 'array', items: { type: 'string' } },
    spotCheckedNumber: { type: 'string', description: 'The most significant numeric claim checked, and the result' },
  },
}
// Cross-area consolidation barrier: cross-reference, numeric spot-check, and
// reliability over the (already enforced) observation set. Per-observation lens
// verdicts are applied in code upstream — not folded here. With no probedKeys this
// is byte-identical to the original single-pass verifier, so the low-effort /
// empty-observation path is unchanged.
const verifyConsolidated = (obs, probedKeys) => agent(
  'You are verifying investigation observations before synthesis. ' + READ_ONLY_TOOLS + '\n\n' +
  'Scope: ' + scope + '\n\n' +
  'Observations (JSON):\n' + JSON.stringify(obs, null, 2) + '\n\n' +
  'Perform these checks:\n' +
  '1. Cross-reference claims across areas: where two observations touch the same file, value, or claim, ' +
  'independently verify the shared element. Where areas are disjoint, say so and move on.\n' +
  '2. Spot-check the single most significant numeric claim (a count, frequency, or statistic) by running one ' +
  'independent check.\n' +
  '3. Reliability: flag any observation that appears to rely on tool output that could have been truncated, ' +
  'timed out, or silently failed.\n' +
  (probedKeys && probedKeys.length
    ? 'These observations were already individually probed by adversarial lenses and reconciled: ' +
      probedKeys.join('; ') + '. Give the OTHER observations closer scrutiny and flag anything ' +
      'obviously unsupported.\n'
    : '') +
  VERIFY_INTENSITY[overallEffort] + '\n' +
  'Do NOT add new findings and do NOT suggest fixes. Report only verification results and corrections.',
  { label: 'verify', schema: VERIFY_SCHEMA }
)

// Per-observation skeptic verdict — applied to the observation set in code (applyVerdicts).
const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'confidence', 'rationale'],
  properties: {
    verdict: { type: 'string', enum: ['holds', 'correct', 'drop'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    rationale: { type: 'string', description: 'Why, citing what you independently checked' },
    correction: { type: 'string', description: 'If verdict is "correct": the corrected claim' },
    reliabilityConcern: { type: 'string', description: 'If the basis may be truncated or failed: describe it' },
  },
}

// Apply keyed per-observation lens verdicts to the observation set. Pure: args in,
// plain object out (no injected globals), so it can be unit-tested in isolation.
// Rails: only a high/medium-confidence `drop` removes an observation; a low-confidence
// `drop` and any reliabilityConcern become flags the synthesizer still sees; a `correct`
// is folded as an annotation (the original claim is preserved in the action record),
// never a destructive body rewrite. Across lenses on one observation a qualifying drop
// wins over correct wins over holds.
/* test-seam:pure-fn:start */
const applyVerdicts = (obs, verdicts) => {
  const keyOf = (x) => x.area + ' ' + x.title
  const byObs = new Map()
  verdicts.forEach((v) => { const k = keyOf(v); if (!byObs.has(k)) byObs.set(k, []); byObs.get(k).push(v) })
  const kept = []
  const actions = []
  obs.forEach((o) => {
    const vs = byObs.get(keyOf(o)) || []
    const hardDrop = vs.find((v) => v.verdict === 'drop' && (v.confidence === 'high' || v.confidence === 'medium'))
    if (hardDrop) {
      actions.push({ area: o.area, title: o.title, action: 'dropped', lens: hardDrop.lens, confidence: hardDrop.confidence, rationale: hardDrop.rationale })
      return
    }
    const flags = []
    vs.filter((v) => v.verdict === 'drop').forEach((v) => flags.push('low-confidence drop (' + v.lens + '): ' + v.rationale))
    vs.filter((v) => v.reliabilityConcern).forEach((v) => flags.push('reliability (' + v.lens + '): ' + v.reliabilityConcern))
    const corrections = vs
      .filter((v) => v.verdict === 'correct' && v.correction)
      .map((v) => ({ lens: v.lens, was: o.body, now: v.correction, why: v.rationale }))
    const keptObs = { area: o.area, title: o.title, body: o.body, evidence: o.evidence, significance: o.significance }
    if (corrections.length || flags.length) keptObs.verificationNotes = { corrections, flags }
    kept.push(keptObs)
    if (corrections.length || flags.length) {
      actions.push({ area: o.area, title: o.title, action: corrections.length ? 'corrected' : 'flagged', corrections, flags })
    }
  })
  return { kept, actions }
}
/* test-seam:pure-fn:end */

// Choose which observations get the full adversarial lens set. Significance-first,
// but area-aware: every area with any observation gets at least one slot (its
// highest-significance one) before the remaining budget is filled by global
// significance — so the lens budget can't be monopolised by whichever area the
// planner happened to list first. Pure (observations + budget in, [{o,i}] out;
// the original index i is preserved for per-lens labelling and probedKeys).
/* test-seam:pure-fn:start */
const selectVerifyTargets = (obs, maxK) => {
  const sigRank = { high: 0, medium: 1, low: 2 }
  const rankOf = (x) => (x.significance in sigRank ? sigRank[x.significance] : 3)
  const bySig = obs
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rankOf(a.o) - rankOf(b.o) || a.i - b.i)
  const chosen = []
  const taken = new Set()
  // Floor: one best observation per area, areas ordered by their best's
  // significance (ties: first appearance), capped at the budget.
  const seenArea = new Set()
  for (const t of bySig) {
    if (chosen.length >= maxK) break
    if (seenArea.has(t.o.area)) continue
    seenArea.add(t.o.area); chosen.push(t); taken.add(t.i)
  }
  // Fill the remaining budget by global significance across all areas.
  for (const t of bySig) {
    if (chosen.length >= maxK) break
    if (taken.has(t.i)) continue
    chosen.push(t); taken.add(t.i)
  }
  return chosen
}
/* test-seam:pure-fn:end */

const lenses = EFFORT_LENSES[overallEffort] || []
let verification
let verdicts = []
let auditActions = []
let verifiedObs = allObs
let verifyFailed = false
// Guard the bare consolidation call so a throw degrades the run instead of crashing
// it; the per-lens verdict jobs already self-degrade inside parallel().
const safeVerify = async (obs, probed) => {
  try { return await verifyConsolidated(obs, probed) }
  catch (e) {
    verifyFailed = true
    log('Consolidation verify failed (' + ((e && e.message) || e) + '); continuing without it.')
    return { checksPerformed: [], corrections: [], reliabilityFlags: ['consolidation verification failed and was skipped'] }
  }
}
if (!lenses.length || !allObs.length) {
  // Low effort or no observations: the single-pass verifier over the full set,
  // unchanged. No lens verdicts exist here, so nothing is enforced in code.
  verification = await safeVerify(allObs)
} else {
  // Area-aware target selection: a per-area floor (every area's best observation)
  // then significance-fill, so the top-K lens budget spreads across areas instead
  // of concentrating on whichever one sorts first. Deterministic — no
  // Date/Math.random (both forbidden in the harness).
  const targets = selectVerifyTargets(allObs, MAX_VERIFY_TARGETS)
  log('Adversarial verify: ' + lenses.length + ' lens(es) over the top ' + targets.length +
    ' of ' + allObs.length + ' observation(s).')
  const verdictJobs = []
  targets.forEach(({ o, i }) => lenses.forEach((lens) => verdictJobs.push(() =>
    agent(
      'You are an adversarial verifier applying ONE lens to ONE investigation observation before synthesis. ' +
      READ_ONLY_TOOLS + '\n\n' +
      'Scope: ' + scope + '\n' +
      'Lens — ' + VERIFY_LENSES[lens] + '\n\n' +
      'Observation (JSON):\n' + JSON.stringify(o, null, 2) + '\n\n' +
      'Apply ONLY this lens. Be skeptical and check independently rather than trusting the observation. ' +
      'You may correct an inaccurate CLAIM, but do NOT suggest code fixes and do NOT invent new findings.',
      { label: 'verify:' + lens + '#' + i, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'sonnet' }
    ).then((v) => v && Object.assign({ area: o.area, title: o.title, lens: lens }, v))
  )))
  verdicts = (await parallel(verdictJobs)).filter(Boolean)
  // Enforce the keyed verdicts in code, then verify the reconciled set.
  const reconciled = applyVerdicts(allObs, verdicts)
  verifiedObs = reconciled.kept
  auditActions = reconciled.actions
  log('Collected ' + verdicts.length + ' lens verdict(s); enforcement: ' +
    auditActions.filter((a) => a.action === 'dropped').length + ' dropped, ' +
    auditActions.filter((a) => a.action === 'corrected').length + ' corrected, ' +
    auditActions.filter((a) => a.action === 'flagged').length + ' flagged.')
  const probedKeys = targets.map(({ o }) => o.area + ' / ' + o.title)
  verification = await safeVerify(verifiedObs, probedKeys)
}

// A dispatched-but-empty lens pass is a silent total loss of adversarial
// verification — distinct from a thrown consolidation (verifyFailed). Flag it
// (mirroring safeVerify's skipped-consolidation flag) and degrade the run below.
const verifyLost = lenses.length > 0 && allObs.length > 0 && verdicts.length === 0
if (verifyLost && verification && Array.isArray(verification.reliabilityFlags)) {
  verification.reliabilityFlags.push('adversarial lens verification was dispatched but every verdict was lost; observations were not adversarially checked')
}

// ---- Synthesize + write -----------------------------------------------------
phase('Synthesize')
// The synthesizer returns the assessment as STRUCTURED DATA, not markdown. The workflow
// renders the document from this (renderAssessment), so the LLM never hand-produces the
// "### N." heading shape that used to drift. findingsCount / outPath / the markdown text
// are all derived in code, not returned by the agent.
const SYNTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assessmentTitle', 'scopeSummary', 'areasCovered', 'findings', 'summary'],
  properties: {
    assessmentTitle: { type: 'string', description: 'Short scope description for the document\'s "## Assessment: <...>" header' },
    scopeSummary: { type: 'string', description: 'One line: what was investigated (rendered as the "**Scope**:" value)' },
    areasCovered: { type: 'string', description: 'Comma-separated areas investigated (rendered as the "**Areas covered**:" value)' },
    findings: {
      type: 'array',
      description: 'The findings as structured data, in significance order (most impactful first). The workflow renders the markdown from this — the agent writes no markdown itself.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'title', 'significance', 'body', 'citations'],
        properties: {
          number: { type: 'integer', description: 'Finding number from significance order (1 = most impactful); rendered as the "### N." heading' },
          title: { type: 'string', description: 'Short descriptive finding title; rendered after the number on the heading line' },
          significance: { type: 'string', enum: ['high', 'medium', 'low'], description: 'The finding\'s significance, taken from the highest significance of the observation(s) it synthesizes; rendered as the "**Significance**:" line under the heading.' },
          body: { type: 'string', description: 'A single observation-only paragraph: what was found, where (paths/lines/values), current state, why noteworthy. No sub-bullets, no fixes.' },
          citations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Concrete source locations this finding rests on (file paths, line numbers, values, patterns), carried from the evidence of the observation(s) it synthesizes. INTERNAL — used only to ground the finding against source; never rendered into the document.',
          },
        },
      },
    },
    summary: { type: 'string', description: 'Brief overall assessment paragraph rendered under "## Summary": concentration of problems, recurring root causes, severity. No positive / working-as-designed notes.' },
  },
}
// The rendered document is persisted by a minimal write-agent (the workflow script has no
// filesystem access); it confirms the write so a failed persist degrades the run.
const WRITE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['written', 'path'],
  properties: {
    written: { type: 'boolean', description: 'True iff the document was written to disk' },
    path: { type: 'string', description: 'The path actually written' },
  },
}
const completedAreaNames = areaNames.filter((n) => !droppedAreaNames.includes(n))
const coverageNote = droppedAreaNames.length
  ? 'INCOMPLETE COVERAGE: ' + droppedAreaNames.length + ' planned area(s) failed to investigate and are absent ' +
    'from these observations: ' + droppedAreaNames.join(', ') + '. Note this incompleteness briefly in the Summary; ' +
    'do not imply the assessment is exhaustive.\n\n'
  : ''
const synth = await withRetry('synthesize', () => agent(
  'You are synthesizing investigation observations into a final numbered assessment, returned as STRUCTURED DATA.\n\n' +
  'Scope: ' + scope + '\n' +
  'Areas covered: ' + completedAreaNames.join(', ') + '\n\n' +
  coverageNote +
  'Observations (JSON) — already reconciled against per-observation verification; honor any ' +
  '"verificationNotes" field (applied corrections / reliability flags):\n' + JSON.stringify(verifiedObs, null, 2) + '\n\n' +
  'Cross-area verification results (apply these corrections; drop or fix any claim flagged unreliable):\n' +
  JSON.stringify(verification, null, 2) + '\n\n' +
  'SYNTHESIS RULES:\n' +
  '- Sub-agent numbering is discarded. Each finding number comes from significance order (most impactful first), ' +
  'and each finding carries an explicit significance of high/medium/low — the highest significance among the ' +
  'observations merged into it (the same significance that drives the ordering, now also emitted as a field).\n' +
  '- An observation may become zero findings (filtered), one finding, or be split into several; a finding may ' +
  'aggregate observations from multiple areas.\n' +
  '- Filter for actionability: drop purely informational / working-as-designed observations. A finding must ' +
  'identify a problem, gap, risk, or concrete opportunity. ("X works correctly" is not a finding; "X works ' +
  'correctly and is undocumented" is a documentation gap and qualifies.)\n' +
  '- Merge overlapping observations: same root cause, or the same pattern recurring across files, becomes ONE ' +
  'finding that names every affected location — not one finding per occurrence.\n' +
  '- Split compound issues into separate findings.\n\n' +
  'OBSERVATION-ONLY OUTPUT (critical):\n' +
  '- Each finding describes WHAT was found and WHY it is noteworthy — never HOW to fix it.\n' +
  '- Forbidden anywhere in a finding body: "consider", "should", "could", "would", "must", "ought to", ' +
  '"recommend", "fix by", "migrate to", "replace with", "switch to", or any imperative directed at future ' +
  'action. Mid-sentence modals count: "endpoints that should not be accessible" becomes "endpoints are exposed ' +
  'in config.py". Strip the prescription; keep only the description.\n\n' +
  'OUTPUT — return STRUCTURED DATA only (the schema); do NOT produce markdown and do NOT write any file. ' +
  'The workflow renders the assessment document from your structured output. Provide:\n' +
  '- assessmentTitle, scopeSummary, areasCovered for the document header.\n' +
  '- findings: one entry per finding, in significance order, each with its number, its significance ' +
  '(high/medium/low), a short title, and a body ' +
  'that is a SINGLE observation-only paragraph naming where it was found (paths/lines/values) — the same prose a ' +
  'reader sees under the "### N. Title" heading.\n' +
  '- For each finding, a "citations" list of the concrete source locations it rests on (file paths, line ' +
  'numbers, values, patterns), drawn from the "evidence" of the observation(s) you merged into it. Citations are ' +
  'INTERNAL — used to ground the finding against source; they are never shown to the reader.\n' +
  '- summary: a brief overall assessment paragraph.',
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTH_SCHEMA }
))

const synthStructured = !!(synth && Array.isArray(synth.findings))
const markdown = synthStructured ? renderAssessment(synth) : ''
// The workflow script has no filesystem access, so persisting the rendered document goes
// through a minimal write-agent: one verbatim Write, no reasoning. The file is trustworthy
// only if BOTH the structured synthesis AND this write succeeded.
const wrote = synthStructured
  ? await withRetry('write-assessment', () => agent(
      'Write the following assessment document verbatim to exactly this path using the Write tool: ' + outPath + '\n' +
      'Do NOT edit, reformat, summarize, re-order, or add anything — write it byte-for-byte as given. Then return ' +
      'whether the write succeeded and the path written.\n\n' +
      '----- BEGIN DOCUMENT -----\n' + markdown + '\n----- END DOCUMENT -----',
      { label: 'write-assessment', phase: 'Synthesize', schema: WRITE_SCHEMA }
    ))
  : null
const synthOk = !!(synthStructured && wrote && wrote.written)
const { status, coverage } = degradationSummary({ plannedAreas: dispatchedAreas, droppedAreas: droppedAreaNames, synthOk, verifyFailed, verifyLost })
const finalPath = (wrote && wrote.path) || outPath
const findingsCount = synthStructured ? synth.findings.length : 0
log('Synthesis ' + (synthOk
  ? 'written to ' + finalPath + ' (' + findingsCount + ' findings)'
  : 'FAILED — no trustworthy file') + '; status=' + status + '.')

// ---- Ground (post-synthesis citation grounding; gated; flag-only) -----------
// The synthesizer reshapes observations into findings (merge / split / renumber) with no
// read-only tools, so nothing has re-grounded the FINAL findings against source — the
// pre-synthesis Verify stage only ever saw the observations, not the post-merge findings.
// One read-only agent per finding re-reads that finding's structured citations and flags any
// that do not resolve. Purely additive: it never edits the written .md (the synthesizer's
// file stands) and records results only in the returned audit trail. Bounded to the top-K
// significance-ordered findings and fanned out in parallel (like the verify stage) so cost
// and wall-clock stay flat; gated like the other added stages so a low-effort or zero-
// finding run skips it.
phase('Ground')
const GROUND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ungrounded'],
  properties: {
    ungrounded: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['citation', 'problem', 'detail'],
        properties: {
          citation: { type: 'string', description: 'The specific cited path/line/value that did not resolve' },
          problem: { type: 'string', enum: ['missing', 'mismatch', 'unverifiable'] },
          detail: { type: 'string', description: 'One line: what the source actually shows vs. what was cited' },
        },
      },
    },
  },
}
const synthFindings = (synth && synth.findings) || []
let grounding = { ran: false, checked: 0, ungrounded: [] }
if (overallEffort !== 'low' && synthFindings.length) {
  // Findings are significance-ordered (most impactful first), so the top-K are the ones
  // worth grounding; each runs in its own read-only agent, in parallel.
  const groundTargets = synthFindings.slice(0, MAX_GROUND_TARGETS)
  const groundJobs = groundTargets.map((fnd) => () =>
    agent(
      'You are grounding ONE finding from a finished assessment against source, at the synthesis boundary. ' +
      'You have read-only tools (Read, Grep, Glob, Bash).\n\n' +
      'Scope: ' + scope + '\n\n' +
      'Finding (JSON, with the structured citations it rests on):\n' + JSON.stringify(fnd, null, 2) + '\n\n' +
      'Independently open each cited location and confirm it exists and says what the finding claims. ' +
      'This is a FLAG-ONLY pass: do NOT rewrite the finding, do NOT propose fixes, and do NOT invent new ' +
      'findings. Report ONLY citations that fail to ground:\n' +
      '- "missing": the cited file, or that line region, does not exist.\n' +
      '- "mismatch": the source exists but says something materially different from what the finding claims.\n' +
      '- "unverifiable": the citation is too vague to locate, or its basis could not be checked.\n' +
      'If every citation resolves, return an empty "ungrounded" list.',
      { label: 'ground#' + fnd.number, phase: 'Ground', schema: GROUND_SCHEMA, model: 'sonnet' }
    ).then((r) => r && { findingNumber: fnd.number, ungrounded: r.ungrounded || [] })
  )
  const groundResults = (await parallel(groundJobs)).filter(Boolean)
  const ungrounded = groundResults.flatMap((r) =>
    r.ungrounded.map((u) => Object.assign({ findingNumber: r.findingNumber }, u)))
  grounding = { ran: true, checked: groundResults.length, ungrounded }
  log('Grounding: ' + grounding.checked + ' of ' + synthFindings.length + ' finding(s) checked (top ' +
    groundTargets.length + '), ' + ungrounded.length + ' citation(s) unresolved.')
}

const auditSummary = summarizeAudit({
  status,
  observationCount: allObs.length,
  synthInputCount: verifiedObs.length,
  findingsCount,
  auditActions,
  grounding,
  reliabilityFlags: verification && verification.reliabilityFlags,
})

return {
  scope,
  focus,
  effort: overallEffort,
  areas: areaNames,
  status,
  coverage,
  observationCount: allObs.length,
  findingsCount,
  auditSummary,
  outPath: finalPath,
  markdown,
  ...(synthOk ? {} : { error: 'synthesis failed' }),
  verification: {
    enforced: verdicts.length > 0,
    checks: verification,
    dropped: auditActions.filter((a) => a.action === 'dropped'),
    corrected: auditActions.filter((a) => a.action === 'corrected'),
    flagged: auditActions.filter((a) => a.action === 'flagged'),
    verdicts,
  },
  grounding,
}
