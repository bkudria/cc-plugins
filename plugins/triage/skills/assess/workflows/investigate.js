export const meta = {
  name: 'assess-investigate',
  description: 'Autonomous investigation core for the assess skill: plan areas, investigate each in parallel, check coverage for gaps, cross-verify, synthesize a numbered observation-only assessment and write it to disk, then ground finding citations against source',
  whenToUse: 'Invoked by the assess skill (by path) once scope/focus/effort are resolved. Runs Phases 2-4 headless; the skill keeps Phase 0-1 (scope resolution + interview).',
  phases: [
    { title: 'Plan', detail: 'break the scope into semi-independent areas' },
    { title: 'Digest', detail: 'read the source once; share an orientation map with the area investigators' },
    { title: 'Investigate', detail: 'one agent per area, observation-only, in parallel' },
    { title: 'Completeness', detail: 'critic names coverage gaps; effort-scaled targeted re-investigation' },
    { title: 'Verify', detail: 'per-observation adversarial lenses on the most significant observations; verdicts applied in code (drop/correct), then a cross-area consolidation barrier, with a verification audit trail in the result' },
    { title: 'Synthesize', detail: 'merge/filter/order into structured numbered findings, render the markdown deterministically, and write the file; a degraded or failed run is reflected in the result status and coverage' },
    { title: 'Ground', detail: 'post-synthesis grounding: re-read each finding citation against source, flag any that do not resolve, and re-write the file to correct any finding whose body contradicts source' },
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
/* test-seam:pure-fn:start */
const EFFORT_LEVELS = ['low', 'medium', 'high']
/* test-seam:pure-fn:end */
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
// The source digest reads the source ONCE and shares an orientation map with the area
// investigators so they target their reads instead of each re-ingesting the whole source. It
// only pays off when there is fan-out to amortize across, so it is gated to runs with at least
// this many areas (a single area would just mean two full reads — digest + lone investigator —
// instead of one).
const DIGEST_MIN_AREAS = 2
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
// Extra budget reserved above the per-area floor for the global-significance fill, so a
// high-area run isn't limited to one observation per area: the budget is area-count + this,
// leaving these slots for the globally-top observations the floor skipped. Tunable; at 4 the
// budget reaches MAX_TOTAL_AREAS (12) by ~8 areas.
const VERIFY_GLOBAL_FILL_HEADROOM = 4
// Post-synthesis grounding re-reads each finding's cited source. Bounded like the verify
// stage: only the top-K significance-ordered findings are grounded, so cost and wall-clock
// stay flat regardless of how many findings synthesis emits.
const MAX_GROUND_TARGETS = 6
const VERIFY_LENSES = {
  grounding: 'Grounding/citation accuracy. Independently re-derive this observation\'s cited evidence from source using your read-only tools. Do the named files, line numbers, and values actually exist and say what the observation claims? Verdict "drop" if the evidence is fabricated or does not support the claim; "correct" if it is partially right with a fixable inaccuracy; "holds" if fully grounded.',
  overclaim: 'Over-claim / significance inflation. Judge whether the observation\'s framing and significance are justified by its evidence, or inflated. Is a "high" significance genuinely load-bearing, or is this working-as-designed, minor, or speculative? Verdict "drop" (confidence high or medium) if it is working-as-designed or not a real issue — this removes it. Verdict "correct" with correctedSignificance set to the LOWER level (high→medium or medium→low) when the issue is real but its significance is inflated — significance is only ever lowered, never raised; add a "correction" only if the claim wording itself also needs fixing. Verdict "holds" if proportionate.',
  reliability: 'Reliability / truncation. Judge whether this observation could rest on tool output that was truncated, timed out, or silently failed. Use your tools to check whether the underlying source is larger or different than the evidence implies. Record any concern in reliabilityConcern; verdict "drop" if the basis is likely unreliable; "holds" if solid.',
}
const EFFORT_LENSES = {
  low: [],
  medium: ['grounding', 'reliability'],
  high: ['grounding', 'overclaim', 'reliability'],
}
// Shared read-only framing for the tool-using sub-agents (investigator, the two
// verifiers, and grounding): one identical statement of the toolset, the primary-source
// discipline, and the search-breadth guardrail, so these roles cannot drift on how they
// phrase it. The observation-only output discipline is shared the same way, just below
// (observationOnlyRule).
const READ_ONLY_TOOLS =
  'You have read-only tools (Read, Grep, Glob, Bash). Use them to consult primary sources directly: ' +
  'read the actual files and run the actual searches rather than relying on memory or inference. ' +
  'Confine every filesystem search to the scope under investigation — the specific directories, ' +
  'repository, or paths it names. Never launch an unbounded traversal of the home directory or the ' +
  'filesystem root (e.g. `find /`, `find ~`, or a recursive search rooted at `/` or `$HOME`): such ' +
  'scans are pathologically slow and, on macOS, block on per-application data-access permission ' +
  'prompts. If you cannot locate a path, narrow from a known root rather than scanning everything.'
/* test-seam:pure-fn:start */
// Shared observation-only discipline: describe what IS, never prescribe a fix. One base shared by
// every role, composed with per-role clauses, with the consequence-description vs. prescription
// distinction defined once — so the wording cannot drift the way it did when each role restated it
// inline and only the synthesizer carried the modal ban.
const OBS_ONLY_BASE =
  'Record only what IS and why it is noteworthy — never a fix, solution, or what should be done. ' +
  'Strip any prescription; keep only the description.'
// A modal is forbidden only when it directs the reader toward a change; a modal describing a
// consequence is allowed. This is the distinction the synthesizer's flat word-ban could not make.
const OBS_ONLY_MODALS =
  ' Forbidden: language that directs future action — "consider", "recommend", "fix by", "migrate to", ' +
  '"replace with", "switch to", or a modal that prescribes a change ("should be lowered", "could ' +
  'switch to"). Descriptive modals about how the code or system behaves are allowed: "the ' +
  'unparameterized query could expose the database" is a consequence and is fine; "could switch to ' +
  'parameterized queries" is a prescription and is forbidden. Mid-sentence modals count: "endpoints ' +
  'that should not be accessible" becomes "endpoints are exposed in config.py".'
const observationOnlyRule = (role) => {
  switch (role) {
    case 'investigator':
    case 'synthesizer':
      return OBS_ONLY_BASE + OBS_ONLY_MODALS
    case 'verifier':
      return OBS_ONLY_BASE + ' Do NOT add new findings; report only verification results and corrections.'
    case 'grounding':
      return OBS_ONLY_BASE + ' Do NOT invent new findings. When the source contradicts the finding, you MAY ' +
        'return a corrected, observation-only body for THAT finding; otherwise leave it untouched.'
    default:
      return OBS_ONLY_BASE
  }
}
/* test-seam:pure-fn:end */
// Cap a planner-proposed effort at the optional user ceiling (low < medium < high).
/* test-seam:pure-fn:start */
const clampEffort = (proposed, ceiling) => {
  const p = EFFORT_LEVELS.indexOf(proposed)
  const safe = p === -1 ? EFFORT_LEVELS.indexOf('medium') : p
  if (!ceiling) return EFFORT_LEVELS[safe]
  return EFFORT_LEVELS[Math.min(safe, EFFORT_LEVELS.indexOf(ceiling))]
}
/* test-seam:pure-fn:end */

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
//   'failed'   — no usable synthesis (planner died, or synth failed after retry), or an
//                empty-observation run that ALSO lost coverage (a broken run, not a
//                legitimately empty one).
//   'degraded' — produced output but lost coverage (areas dropped), skipped/lost verify,
//                or shipped findings whose citations did not ground.
//   'ok'       — no losses (a legitimately empty result is still 'ok'; its document
//                shape is owned elsewhere).
/* test-seam:pure-fn:start */
const degradationSummary = ({ plannedAreas, droppedAreas, synthOk, verifyFailed, verifyLost, ungrounded, noObservations }) => {
  const lostCoverage = droppedAreas.length > 0 || verifyFailed || verifyLost || ungrounded > 0
  const status = !synthOk ? 'failed'
    : (noObservations && lostCoverage) ? 'failed'
    : lostCoverage ? 'degraded'
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
    groundCorrected: grounding && Array.isArray(grounding.corrected) ? grounding.corrected.length : 0,
    reliabilityFlags: Array.isArray(reliabilityFlags) ? reliabilityFlags.length : 0,
  }
}
/* test-seam:pure-fn:end */

// Disclose run-level reliability shortfalls in the audit trail: advisory critics (plan,
// completeness) that crashed on both attempts and so silently no-op'd, and adversarial
// verification that came back PARTIAL (some lens verdicts lost but not all — total loss is
// handled separately by verifyLost). Pure (signals in, flag strings out); these flags surface
// in the result but do not, by themselves, change the run status.
/* test-seam:pure-fn:start */
const runReliabilityFlags = ({ planCriticFailed, completenessCriticFailed, verdictsReceived, verdictsExpected }) => {
  const flags = []
  if (planCriticFailed) flags.push('plan critic failed after retry; the decomposition was not validated')
  if (completenessCriticFailed) flags.push('completeness critic failed after retry; coverage sufficiency was not validated')
  if (verdictsExpected > 0 && verdictsReceived > 0 && verdictsReceived < verdictsExpected) {
    flags.push('adversarial verification was partial: ' + verdictsReceived + ' of ' + verdictsExpected + ' lens verdict(s) returned')
  }
  return flags
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

// Splice post-synthesis grounding corrections into the synthesized findings: replace the
// body of each finding whose number has a correction, preserving every other field and every
// other finding, never mutating the input. The corrective re-render after Ground rests on
// this, so it is unit-tested in isolation. A correction whose findingNumber matches no finding
// is ignored; empty corrections return the findings unchanged. Pure (findings + corrections
// in, new findings array out — no injected globals).
/* test-seam:pure-fn:start */
const applyFindingCorrections = (findings, corrections) => {
  const byNumber = new Map(corrections.map((c) => [c.findingNumber, c.correctedBody]))
  return findings.map((f) => (byNumber.has(f.number) ? { ...f, body: byNumber.get(f.number) } : f))
}
/* test-seam:pure-fn:end */

// ---- Plan -------------------------------------------------------------------
phase('Plan')
// Run-level reliability tracking: advisory critics that crashed on both attempts (and so
// silently no-op'd) are recorded here and surfaced as flags near the return.
let planCriticFailed = false
let completenessCriticFailed = false
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
// Scaling rules (area count vs. scope size), shared verbatim by the planner prompt and the plan-
// critic so the critic judges the count against the same baseline the planner allocated against.
const SCALING_RULES =
  'Scaling rules (area count vs. scope size):\n' +
  '- Narrow / simple scope (a single file, a small config): 1-3 areas.\n' +
  '- Moderate scope (a feature, a module): 4-6 areas.\n' +
  '- Broad / complex scope (a whole subsystem, cross-cutting concerns): up to ' + MAX_AREAS + ' areas.\n'
// One source of truth for how to decompose the scope, used for the initial plan and
// for the plan-critic's single revision. `revisionNote` is empty on the first pass and
// carries the critique on a re-plan, so both plans obey identical decomposition rules.
const buildPlanPrompt = (revisionNote) =>
  'You are planning an investigation (an assessment), not performing it.\n\n' +
  'Scope: ' + scope + '\n' +
  'Focus: ' + focus + '\n\n' +
  'First judge how complex this scope actually is, then allocate investigation resources to match — ' +
  'do not over-invest in a simple scope. ' + SCALING_RULES +
  ceilingNote + '\n' +
  'Break the scope into semi-independent areas that TOGETHER cohesively investigate the overall question — ' +
  'facets of one investigation, not a disconnected inventory. Each area should be explorable on its own, and ' +
  'the areas must be mutually distinct: each investigates ground no other area covers, so no two areas ' +
  'duplicate the same work. ' +
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
// Case/whitespace-insensitive area-name key, so a completeness gap that merely re-cases or re-spaces
// an existing area name is treated as the same area (the exact-name filter let such duplicates through).
const normName = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ')
/* test-seam:pure-fn:start */
// Overall effort = the user ceiling when set, else the MEDIAN of the areas' efforts
// (previously the max). The median ignores a lone high outlier, so one area rated
// 'high' no longer escalates the run's cross-cutting QA (extra completeness rounds,
// the overclaim lens, grounding, plan-critic); per-area investigation depth is
// unaffected, since each investigator keys off its own area.effort. Even area counts
// average the two central efforts (ties round toward the more thorough level). Ceiling
// is passed in (not the module closure var) so the pure-fn test seam can load it.
const deriveOverallEffort = (areas, ceiling) => {
  if (ceiling) return ceiling
  const med = EFFORT_LEVELS.indexOf('medium')
  const idx = (areas || []).map((x) => {
    const i = EFFORT_LEVELS.indexOf(x.effort)
    return i === -1 ? med : i
  }).sort((a, b) => a - b)
  if (!idx.length) return EFFORT_LEVELS[med]
  const n = idx.length
  const mid = n % 2 ? idx[(n - 1) / 2] : Math.round((idx[n / 2 - 1] + idx[n / 2]) / 2)
  return EFFORT_LEVELS[mid]
}
/* test-seam:pure-fn:end */

let areas = finalizeAreas((plan && plan.areas) || [])
if (!areas.length) {
  log('Planner produced no areas; nothing to investigate.')
  return { status: 'failed', error: 'no areas planned', scope, findingsCount: 0 }
}
let overallEffort = deriveOverallEffort(areas, effortCeiling)
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
// Before paying for fan-out, a critic judges the decomposition for coverage, disjointness, and
// count from the plan ALONE — it has tools but is instructed not to investigate. Gated on
// effort + size so simple scopes skip it. On a genuine
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
    JSON.stringify(areas.map((a) => ({ name: a.name, rationale: a.rationale, effort: a.effort })), null, 2) + '\n\n' +
    'The planner was given these same scaling rules; hold the area count against them:\n' + SCALING_RULES + '\n' +
    'Judge the decomposition on three axes:\n' +
    '- coverage: do the areas TOGETHER cover the overall question, or is a material facet left out?\n' +
    '- overlap: do any two areas investigate the same ground (which would duplicate cost)?\n' +
    '- count: is the number of areas sized to the scope per the scaling rules above, or clearly too ' +
    'many (a single-file scope split into many areas is over-decomposed) / too few? Many low-effort ' +
    'areas on a narrow scope is a sign of over-decomposition.\n\n' +
    'Judge ONLY from the plan above — you have tools but must NOT read files, run commands, or ' +
    'investigate the scope; reach your verdict from the areas, rationales, efforts, and scaling rules ' +
    'alone. Name only GENUINE structural problems, do NOT propose fixes, and do NOT invent issues to ' +
    'seem thorough. If the decomposition is sound, set sound=true and return an empty issues list.',
    { label: 'plan-critic', phase: 'Plan', schema: PLAN_REVIEW_SCHEMA }
  ))
  const issues = (review && review.issues) || []
  if (!review) {
    planCriticFailed = true
    log('Plan critic unavailable (failed after retry); proceeding with the original decomposition.')
  } else if (review.sound === false && issues.length) {
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
      overallEffort = deriveOverallEffort(areas, effortCeiling)
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

/* test-seam:pure-fn:start */
// Render the one-time source digest into the orientation block injected into every area
// investigator's prompt. The digest is shared ORIENTATION, not a source replacement:
// investigators still read source for depth, so the block points them at landmarks rather
// than standing in for it. Returns '' for a missing/empty digest, so a failed or skipped
// digest degrades to today's behaviour (investigators read source unaided).
const renderOrientation = (digest) => {
  const marks = (digest && digest.landmarks) || []
  if (!marks.length) return ''
  const lines = marks.map((m) => '- ' + m.location + ' — ' + m.what + ' (' + m.relevance + ')')
  return 'Shared source orientation map (the source was read once for the whole investigation; ' +
    'use these landmarks to target your reads — they are a guide, not a substitute, so still ' +
    'confirm against source):\n' +
    (digest.overview ? digest.overview + '\n' : '') +
    lines.join('\n')
}
/* test-seam:pure-fn:end */

// ---- Source digest (one-time orientation map; shared by the area investigators) ----------
// One cheap-tier agent absorbs the single expensive full-source read (and any chunking a large
// source needs) ONCE, then hands every area investigator a shared orientation map so they target
// their reads instead of each re-ingesting the whole source. Gated to runs with real fan-out
// (>= DIGEST_MIN_AREAS areas) and off at low effort, where a quick scan should not pay a front
// barrier. The map is advisory: verify and grounding keep full raw-source access (they re-derive
// citations against actual source), and investigators still read source for depth — so a failed or
// skipped digest degrades cleanly to unaided investigation (renderOrientation returns '').
const DIGEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overview', 'landmarks'],
  properties: {
    overview: { type: 'string', description: '1-3 sentences orienting the reader to the source as a whole' },
    landmarks: {
      type: 'array',
      // Bounded: the map is re-sent to every investigator, so an unbounded map would recreate the
      // payload duplication it removes. Keep it a compact set of the load-bearing landmarks.
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['location', 'what', 'relevance'],
        properties: {
          location: { type: 'string', description: 'Concrete pointer: file path with an optional line range, e.g. src/foo.js:120-145' },
          what: { type: 'string', description: 'What is at this location' },
          relevance: { type: 'string', description: 'Why it matters to the investigation / which thread it bears on' },
        },
      },
    },
  },
}
let orientation = ''
if (overallEffort !== 'low' && areas.length >= DIGEST_MIN_AREAS) {
  phase('Digest')
  // Non-critical: a thrown or null digest must not abort the run, and we deliberately do not
  // retry — a front-loaded optional step should not add a serial retry barrier to every run.
  let digest = null
  try {
    digest = await agent(
      'You are the source digest for a parallel investigation (an assessment). A team of ' +
      'investigators is about to examine this scope; you read the source ONCE so they do not each ' +
      're-ingest it.\n' +
      'Scope: ' + scope + '\n' +
      'Overall question: ' + overallQuestion + '\n' +
      'Areas the investigators will examine (orient toward these — do NOT investigate or judge them ' +
      'yourself): ' + areaNames.join('; ') + '\n' +
      'Surface landmarks relevant to: ' + focus + '\n\n' +
      READ_ONLY_TOOLS + '\n\n' +
      'Read the source in full once (chunk large files across multiple reads rather than truncating). ' +
      'Produce a compact orientation map: for each load-bearing landmark give a concrete location ' +
      '(file path + line range), what is there, and why it matters. This is ORIENTATION, not findings: ' +
      'point investigators at where things are so they can target their reads — do NOT draw conclusions, ' +
      'judge significance, or propose anything. Keep it compact and point to the source; do not reproduce it.',
      { label: 'source-digest', phase: 'Digest', schema: DIGEST_SCHEMA, model: 'sonnet' }
    )
  } catch (e) {
    digest = null
  }
  orientation = renderOrientation(digest)
  log(orientation
    ? 'Source orientation map: ' + ((digest && digest.landmarks) || []).length + ' landmark(s) shared with investigators.'
    : 'Source digest produced no usable map; investigators will read source unaided.')
}

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
          body: { type: 'string', description: 'Single paragraph: what IS and why noteworthy. ' + OBS_ONLY_BASE },
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
// ---- model-tier strategy ----------------------------------------------------
// Two tiers. The mechanical / IO-bound roles pin `model: 'sonnet'` (the cheap tier):
// the source digest ('source-digest'), the area & gap investigators (here), the per-lens
// verifiers ('verify:<lens>#i'), the grounding agents ('ground#n'), and the verbatim
// write-agent ('write-assessment') — they
// read, cross-check, or transcribe; none reason about the assessment as a whole. The
// judgment roles omit `model` and inherit the caller's top tier (Opus in production):
// the planner, plan-critic/revise, completeness-critic, consolidation verifier ('verify'),
// and synthesizer.
// Known limitation: under evals the harness pins ONE base model (evals.yaml:
// `model: claude-sonnet-4-5`), which overrides per-agent inheritance — so the judgment
// roles also run on the base and the two-tier split is never exercised by evals. It is a
// production cost optimization; its structure is locked instead by the deterministic
// harness (workflows/test/orchestration.test.mjs, "model tiers" test).
// Investigate one area, observation-only. Shared by the initial fan-out and the
// completeness-critic gap rounds so both dispatch an identical prompt/schema/model.
const investigateArea = (a, phaseName) =>
  agent(
    'Investigate the area "' + a.name + '" within this scope: ' + scope + '\n' +
    'Why this area matters: ' + a.rationale + '\n' +
    'Overall question: ' + overallQuestion + '\n' +
    (orientation ? orientation + '\n\n' : '') +
    'Other areas in this investigation (context only — do NOT investigate these): ' +
    areaNames.filter((n) => n !== a.name).join('; ') + '\n' +
    'Look for: ' + focus + '\n' +
    'Effort for this area: ' + a.effort + ' — ' + EFFORT_GUIDANCE[a.effort] + '\n\n' +
    READ_ONLY_TOOLS + '\n\n' +
    'OBSERVATION-ONLY. ' + observationOnlyRule('investigator') + ' Every observation MUST include concrete ' +
    'evidence: file paths, line numbers, configuration values, or specific patterns — observations without ' +
    'evidence are opinions, not findings. Set "area" to exactly: ' + a.name,
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
/* test-seam:pure-fn:start */
const collectObs = (invs) => invs.flatMap((i) =>
  (i.observations || []).map((o) => ({ area: i.area, title: o.title, body: o.body, evidence: o.evidence, significance: o.significance }))
)
/* test-seam:pure-fn:end */
const allObs = collectObs(investigations)
log('Collected ' + allObs.length + ' observation(s) across ' + investigations.length + ' area(s).')
if (!allObs.length) {
  log('No observations produced; writing an empty assessment.')
}

// ---- Completeness critic (effort-scaled, bounded) ---------------------------
// Single-pass investigation can miss a facet the planner never decomposed, or a
// thread an area surfaced but did not own. A bounded critic names genuine gaps;
// each becomes a new area run through the same investigator. Rounds scale with
// effort (low -> none), so simple scopes stay a pure single pass, and a round that
// surfaces no new observations ends the loop early (diminishing returns) rather than
// re-pay another serial barrier. Verify runs after this loop, so it covers the full
// accumulated observation set.
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
          required: ['name', 'rationale', 'effort'],
          properties: {
            name: { type: 'string', description: 'Short name for the uncovered facet (becomes a new area)' },
            rationale: { type: 'string', description: 'One line: what thread/facet is uncovered and why it matters to the overall question' },
            effort: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How much investigation this gap genuinely needs, sized the way a planner sizes an area: a binary or single-value lookup is low; a facet needing broad reading across many threads is high. This sets the gap area’s own effort — it is not forced to the run’s overall effort.' },
          },
        },
      },
    },
  }
  let roundsLeft = criticRounds
  while (roundsLeft-- > 0) {
    const headroom = MAX_TOTAL_AREAS - areaNames.length
    if (headroom <= 0) break
    // The critic judges coverage and names uncovered facets — it does not re-verify claims, so it
    // does not need each observation's full prose body. Projecting to title/evidence/significance
    // preserves the coverage + thread signal while bounding the payload re-sent in full every round.
    const critiqueObs = allObs.map((o) => ({ area: o.area, title: o.title, significance: o.significance, evidence: o.evidence }))
    const critique = await withRetry('completeness-critic', () => agent(
      'You are a completeness critic for an investigation (an assessment). Judge whether the areas already ' +
      'investigated TOGETHER cover the overall question, or whether a material facet was missed.\n\n' +
      'Scope: ' + scope + '\n' +
      'Overall question: ' + overallQuestion + '\n' +
      'Focus: ' + focus + '\n' +
      'Areas already investigated (do NOT propose any of these again): ' + areaNames.join('; ') + '\n\n' +
      'Observations gathered so far (JSON):\n' + JSON.stringify(critiqueObs, null, 2) + '\n\n' +
      'Name only GENUINE gaps: a facet, thread, or area materially relevant to the overall question that the ' +
      'existing areas do not cover — an unplanned thread surfaced by an observation counts. A gap must be a ' +
      'facet none of the existing areas covers, not the same theme under a different name. Do NOT restate ' +
      'covered ground, do NOT propose fixes, and do NOT invent gaps to seem thorough. For each gap, set ' +
      'effort to how much investigation it genuinely needs, sized the way a planner sizes an area: a binary ' +
      'or single-value lookup is low; a facet needing broad reading across many threads is high. If coverage ' +
      'is already sufficient, set complete=true and return an empty gaps list. At most ' + MAX_GAPS_PER_ROUND + ' gaps.',
      { label: 'completeness-critic', phase: 'Completeness', schema: GAP_SCHEMA }
    ))
    if (!critique) {
      completenessCriticFailed = true
      log('Completeness critic unavailable (failed after retry); stopping gap rounds.')
      break
    }
    const fresh = ((critique && critique.gaps) || [])
      .filter((g) => g && g.name && !areaNames.some((n) => normName(n) === normName(g.name)))
      .slice(0, headroom)
    if ((critique && critique.complete) || !fresh.length) {
      log('Completeness critic: coverage sufficient — no further investigation.')
      break
    }
    // A gap runs at the effort the critic sized it to — capped by the user ceiling, exactly like an
    // initial planner area (finalizeAreas). It is NOT forced to the run's overall effort, so a binary
    // gap stays cheap even when another area pushed overallEffort to high. clampEffort defaults a
    // missing/unrecognized effort to medium.
    const gapAreas = fresh.map((g) => ({ name: g.name, rationale: g.rationale, effort: clampEffort(g.effort, effortCeiling) }))
    log('Completeness critic: investigating ' + gapAreas.length + ' gap area(s): ' + gapAreas.map((a) => a.name).join(', ') + '.')
    const gapResults = await parallel(
      gapAreas.map((a) => () => investigateArea(a, 'Completeness'))
    )
    dispatchedAreas += gapAreas.length
    // A gap joins areaNames only once it has produced coverage: a covered area counts against the
    // ceiling and is not re-proposed, while a failed one is recorded as dropped only — leaving its
    // budget slot free and its facet open for the critic to re-propose in a later round.
    gapAreas.forEach((a, i) => {
      if (gapResults[i]) areaNames.push(a.name)
      else droppedAreaNames.push(a.name)
    })
    const gapInvestigations = gapResults.filter(Boolean)
    const gapObs = collectObs(gapInvestigations)
    allObs.push(...gapObs)
    log('Completeness round added ' + gapObs.length + ' observation(s); ' + allObs.length + ' total across ' + areaNames.length + ' area(s).')
    // Diminishing returns: a round that investigated its gaps successfully yet surfaced no new
    // observations means coverage has stopped growing — a further round would re-pay the serial
    // critic+investigation barrier for nothing, so stop here. A round whose gaps all FAILED
    // (gapInvestigations empty) is degradation, not diminishing returns: it falls through so the
    // next round can retry the facet (see the dropped-gap re-proposal above).
    if (gapInvestigations.length && !gapObs.length) {
      log('Completeness round surfaced no new observations — stopping early (diminishing returns).')
      break
    }
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
  'When verifying a specific claim, re-read the cited source rather than relying solely on the body text shown ' +
  'here (bodies may be excerpted).\n' +
  observationOnlyRule('verifier'),
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
    correctedSignificance: { type: 'string', enum: ['high', 'medium', 'low'], description: 'If verdict is "correct" and the significance is inflated: the corrected, LOWER level (high→medium or medium→low). Downgrade-only — an equal or higher level is ignored.' },
    reliabilityConcern: { type: 'string', description: 'If the basis may be truncated or failed: describe it' },
  },
}

// Apply keyed per-observation lens verdicts to the observation set. Pure: args in,
// plain object out (no injected globals), so it can be unit-tested in isolation.
// Rails: only a high/medium-confidence `drop` removes an observation; a low-confidence
// `drop` and any reliabilityConcern become flags the synthesizer still sees; a `correct`
// is folded as an annotation (the original claim is preserved in the action record),
// never a destructive body rewrite, and may lower an inflated significance via
// correctedSignificance (downgrade-only — never raised). Across lenses on one observation
// a qualifying drop wins over correct wins over holds.
// Two outputs, two shapes: `kept` feeds the verifier/synthesizer prompts and carries a PROJECTED
// correction (lens/now/why) — no `was` (it duplicates the body already at the observation root) and
// no significanceDowngrade record (the corrected significance is already on the root field). The
// `actions` audit record keeps the FULL before/after provenance (`was` and significanceDowngrade).
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
    // Significance downgrade (downgrade-only): a `correct` verdict may lower an
    // inflated significance via correctedSignificance, never raise it. Rank ascends
    // by severity (high < medium < low); a strictly larger rank is a real downgrade.
    const sigRank = { high: 0, medium: 1, low: 2 }
    const rankOf = (s) => (s in sigRank ? sigRank[s] : -1)
    const downgrades = vs.filter((v) =>
      v.verdict === 'correct' && v.correctedSignificance && rankOf(v.correctedSignificance) > rankOf(o.significance))
    // Most-severe downgrade wins (largest rank), so no lens's downgrade is overridden by a milder one.
    const downgrade = downgrades.reduce((best, v) =>
      (!best || rankOf(v.correctedSignificance) > rankOf(best.correctedSignificance) ? v : best), null)
    const significance = downgrade ? downgrade.correctedSignificance : o.significance
    const significanceDowngrade = downgrade
      ? { lens: downgrade.lens, was: o.significance, now: significance, why: downgrade.rationale }
      : null
    // The kept observation feeds the verifier/synthesizer prompts, so its verificationNotes carry a
    // PROJECTED correction (lens/now/why) without `was` — `was` duplicates the body already present
    // at the observation root — and without the significanceDowngrade record, since the corrected
    // significance is already on the root field. The full before/after provenance lives in `actions`.
    const keptCorrections = corrections.map((c) => ({ lens: c.lens, now: c.now, why: c.why }))
    const keptObs = { area: o.area, title: o.title, body: o.body, evidence: o.evidence, significance }
    if (keptCorrections.length || flags.length) {
      keptObs.verificationNotes = { corrections: keptCorrections, flags }
    }
    kept.push(keptObs)
    if (corrections.length || flags.length || significanceDowngrade) {
      const action = { area: o.area, title: o.title, action: (corrections.length || significanceDowngrade) ? 'corrected' : 'flagged', corrections, flags }
      if (significanceDowngrade) action.significanceDowngrade = significanceDowngrade
      actions.push(action)
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

// Size the adversarial-lens budget so every area gets a floor slot AND the global-
// significance fill keeps headroom above it. The budget is area-count + headroom, never
// below the minimum and never above the total-area cap. Without the headroom the budget
// equalled the area count once area-count reached the minimum, so the per-area floor
// (selectVerifyTargets) consumed every slot and the global fill was starved to zero — only
// one observation per area was ever probed. Caps and headroom are passed in (not referenced
// as module constants) so the pure-fn test seam can load it.
/* test-seam:pure-fn:start */
const verifyTargetBudget = (distinctAreaCount, minBudget, maxCap, headroom) =>
  Math.min(maxCap, Math.max(minBudget, distinctAreaCount + headroom))
/* test-seam:pure-fn:end */

// The consolidation verifier is told which observations were "already probed and
// reconciled" so it scrutinises the others. Key that off the verdicts that
// actually returned, not the dispatched targets: on a lost verdict (wholly or
// partly) applyVerdicts leaves the observation unreconciled, so claiming it was
// probed would steer scrutiny away from a never-checked observation. An
// observation counts as probed when at least one of its lens verdicts returned.
/* test-seam:pure-fn:start */
const selectProbedKeys = (targets, verdicts) => {
  const probed = new Set(verdicts.map((v) => v.area + ' / ' + v.title))
  return targets
    .map(({ o }) => o.area + ' / ' + o.title)
    .filter((k) => probed.has(k))
}
// The consolidation verifier reasons over claim content, so it can't take a body-stripped
// projection like the completeness critic does — but a generous excerpt caps the worst-case
// (single largest, Opus-tier) payload while preserving each observation's load-bearing opening.
// The verifier re-reads cited source for anything it needs in full.
const VERIFY_BODY_EXCERPT_CHARS = 1200
const excerptForVerify = (obs) => obs.map((o) =>
  typeof o.body === 'string' && o.body.length > VERIFY_BODY_EXCERPT_CHARS
    ? { ...o, body: o.body.slice(0, VERIFY_BODY_EXCERPT_CHARS) + ' …[body excerpted; re-read cited source for full detail]' }
    : o)
/* test-seam:pure-fn:end */

const lenses = EFFORT_LENSES[overallEffort] || []
let verification
let verdicts = []
let verdictsExpected = 0
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
  // of concentrating on whichever one sorts first. The budget is the area count plus
  // VERIFY_GLOBAL_FILL_HEADROOM (bounded by MAX_TOTAL_AREAS): every area keeps a floor
  // slot even when completeness pushes the count past MAX_VERIFY_TARGETS, and the
  // headroom leaves slots for the global fill so a hot area's second observation is
  // still probed instead of the floor consuming the whole budget.
  // Deterministic — no Date/Math.random (both forbidden in the harness).
  const distinctAreas = new Set(allObs.map((o) => o.area)).size
  const targets = selectVerifyTargets(allObs, verifyTargetBudget(distinctAreas, MAX_VERIFY_TARGETS, MAX_TOTAL_AREAS, VERIFY_GLOBAL_FILL_HEADROOM))
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
      'You may correct an inaccurate CLAIM. ' + observationOnlyRule('verifier'),
      { label: 'verify:' + lens + '#' + i, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'sonnet' }
    ).then((v) => v && Object.assign({ area: o.area, title: o.title, lens: lens }, v))
  )))
  verdictsExpected = verdictJobs.length
  verdicts = (await parallel(verdictJobs)).filter(Boolean)
  // Enforce the keyed verdicts in code, then verify the reconciled set.
  const reconciled = applyVerdicts(allObs, verdicts)
  verifiedObs = reconciled.kept
  auditActions = reconciled.actions
  log('Collected ' + verdicts.length + ' lens verdict(s); enforcement: ' +
    auditActions.filter((a) => a.action === 'dropped').length + ' dropped, ' +
    auditActions.filter((a) => a.action === 'corrected').length + ' corrected, ' +
    auditActions.filter((a) => a.action === 'flagged').length + ' flagged.')
  const probedKeys = selectProbedKeys(targets, verdicts)
  verification = await safeVerify(excerptForVerify(verifiedObs), probedKeys)
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
          body: { type: 'string', description: 'A single observation-only paragraph: what was found, where (paths/lines/values), current state, why noteworthy. No sub-bullets. ' + OBS_ONLY_BASE },
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
// Empty-observation runs skip the (expensive) synthesizer entirely — there is nothing to
// synthesize — and render a deterministic empty assessment below; the cheap write-agent still
// persists it so Phase 3 has a file to read.
const synth = allObs.length ? await withRetry('synthesize', () => agent(
  'You are synthesizing investigation observations into a final numbered assessment, returned as STRUCTURED DATA.\n\n' +
  'Scope: ' + scope + '\n' +
  'Areas covered: ' + completedAreaNames.join(', ') + '\n\n' +
  coverageNote +
  'Observations (JSON) — already reconciled against per-observation verification; honor any ' +
  '"verificationNotes" field (applied corrections / reliability flags):\n' + JSON.stringify(verifiedObs) + '\n\n' +
  'Cross-area verification corrections (apply these):\n' +
  JSON.stringify((verification && verification.corrections) || []) + '\n\n' +
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
  'SOURCE FIDELITY (critical):\n' +
  '- You cannot open source — you see only the observations above. Every claim in a finding body must be ' +
  'supported by the observation(s) you merge into it. Do NOT introduce paths, line numbers, values, counts, ' +
  'or details that are not present in those observations, and do NOT generalize beyond what they state. When ' +
  'you merge or rephrase, preserve the specific paths/lines/values from the observation evidence exactly — an ' +
  'invented or drifted specific will not match the source it is later grounded against.\n\n' +
  'OBSERVATION-ONLY OUTPUT (critical):\n' +
  observationOnlyRule('synthesizer') + '\n\n' +
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
)) : null

// On the empty-observation path synth is null and the document is rendered deterministically;
// otherwise it is rendered from the synthesizer's structured output.
const synthStructured = allObs.length === 0 || !!(synth && Array.isArray(synth.findings))
// `markdown` is the document the run returns; the corrective Ground stage below may re-render
// it (and re-write the file) when grounding finds a fixable mismatch, so it is reassignable.
let markdown = allObs.length === 0
  ? renderAssessment({ assessmentTitle: scope, scopeSummary: scope, areasCovered: completedAreaNames.join(', ') || 'none', findings: [], summary: 'The investigation completed but produced no observations.' })
  : (synthStructured ? renderAssessment(synth) : '')
// The workflow script has no filesystem access, so persisting the rendered document goes
// through a minimal write-agent: one verbatim Write, no reasoning. The file is trustworthy
// only if BOTH the structured synthesis AND this write succeeded.
// Dispatch the persist but DO NOT await it here: the write has no dependency on the Ground
// fan-out below (ground agents receive their finding data inline, not via the file), so it runs
// concurrently with grounding instead of as a serial barrier ahead of it. withRetry runs the
// agent synchronously on its first attempt, so the document is captured at dispatch time; only
// the resolution is deferred — joined below, before anything reads the result.
const writePromise = synthStructured
  ? withRetry('write-assessment', () => agent(
      'Write the following assessment document verbatim to exactly this path using the Write tool: ' + outPath + '\n' +
      'Do NOT edit, reformat, summarize, re-order, or add anything — write it byte-for-byte as given. Then return ' +
      'whether the write succeeded and the path written.\n\n' +
      '----- BEGIN DOCUMENT -----\n' + markdown + '\n----- END DOCUMENT -----',
      // Cheap tier: a verbatim Write with no reasoning (see model-tier strategy above).
      { label: 'write-assessment', phase: 'Synthesize', schema: WRITE_SCHEMA, model: 'sonnet' }
    ))
  : Promise.resolve(null)
const findingsCount = synth && Array.isArray(synth.findings) ? synth.findings.length : 0

// ---- Ground (post-synthesis citation grounding; gated; corrective) ----------
// The synthesizer reshapes observations into findings (merge / split / renumber) with no
// read-only tools, so nothing has re-grounded the FINAL findings against source — the
// pre-synthesis Verify stage only ever saw the observations, not the post-merge findings.
// One read-only agent per finding re-reads that finding's structured citations, flags any
// that do not resolve, and — when a mismatch means the body itself contradicts source —
// returns a corrected body. Corrected findings are spliced back in, the document is
// re-rendered, and the file is re-written once (the sole exception to "the synthesizer's
// file stands"); everything else is additive audit trail. Only a PERSISTED correction clears
// a finding from the degrading set — a failed re-write leaves the original wrong body, so
// those findings stay ungrounded. Bounded to the top-K significance-ordered findings and
// fanned out in parallel (like the verify stage) so cost and wall-clock stay flat; gated like
// the other added stages so a low-effort or zero-finding run skips it.
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
    correctedBody: { type: 'string', description: 'If a "mismatch" means the finding\'s body states something the source contradicts: the finding\'s body rewritten so every claim matches what the source actually shows — the same single observation-only paragraph, changing only what was wrong. Omit when nothing in the body needs fixing.' },
  },
}
const synthFindings = (synth && synth.findings) || []
let grounding = { ran: false, checked: 0, ungrounded: [], corrected: [] }
let rewriteFailed = false
// The persist (write-assessment) is in flight concurrently with the grounding fan-out below;
// these capture its joined result so synthOk can be computed once the write has settled.
let wrote = null
let writeJoined = false
if (overallEffort !== 'low' && synthFindings.length) {
  // Findings are significance-ordered (most impactful first), so the top-K are the ones
  // worth grounding; each runs in its own read-only agent, in parallel.
  const groundTargets = synthFindings.slice(0, MAX_GROUND_TARGETS)
  const groundJobs = groundTargets.map((fnd) => () =>
    agent(
      'You are grounding ONE finding from a finished assessment against source, at the synthesis boundary. ' +
      READ_ONLY_TOOLS + '\n\n' +
      'Scope: ' + scope + '\n\n' +
      'Finding (JSON, with the structured citations it rests on):\n' + JSON.stringify(fnd, null, 2) + '\n\n' +
      'Independently open each cited location and confirm it exists and says what the finding claims. ' +
      observationOnlyRule('grounding') + ' Report every citation that fails to ground in "ungrounded":\n' +
      '- "missing": the cited file, or that line region, does not exist.\n' +
      '- "mismatch": the source exists but says something materially different from what the finding claims.\n' +
      '- "unverifiable": the citation is too vague to locate, or its basis could not be checked.\n' +
      'When a "mismatch" means the finding\'s body states something the source contradicts, ALSO return a ' +
      '"correctedBody" — the body rewritten so every claim matches what the source actually shows, in the same ' +
      'single observation-only paragraph, changing only what was wrong and keeping the rest verbatim. ' +
      'If every citation resolves, return an empty "ungrounded" list and no "correctedBody".',
      { label: 'ground#' + fnd.number, phase: 'Ground', schema: GROUND_SCHEMA, model: 'sonnet' }
    ).then((r) => r && { findingNumber: fnd.number, ungrounded: r.ungrounded || [], correctedBody: r.correctedBody })
  )
  const groundResults = (await parallel(groundJobs)).filter(Boolean)
  const detected = groundResults.flatMap((r) =>
    r.ungrounded.map((u) => Object.assign({ findingNumber: r.findingNumber }, u)))
  // Splice any corrected bodies back into the findings, re-render, and re-write the file — but
  // only count a correction once it is actually persisted, so a failed re-write keeps those
  // findings in the degrading set rather than silently claiming a fix that never landed.
  const correctable = groundResults
    .filter((r) => r.correctedBody)
    .map((r) => ({ findingNumber: r.findingNumber, correctedBody: r.correctedBody }))
  let correctedNumbers = []
  // Join the persist that has been in flight alongside the grounding fan-out before the corrective
  // re-write below, which overwrites the same path and must never race the initial write.
  wrote = await writePromise
  writeJoined = true
  const synthOk = !!(synthStructured && wrote && wrote.written)
  if (correctable.length && synthOk) {
    const correctedMarkdown = renderAssessment({ ...synth, findings: applyFindingCorrections(synthFindings, correctable) })
    const rewrote = await withRetry('rewrite-assessment', () => agent(
      'Write the following CORRECTED assessment document verbatim to exactly this path using the Write tool, ' +
      'overwriting the existing file: ' + outPath + '\n' +
      'Do NOT edit, reformat, summarize, re-order, or add anything — write it byte-for-byte as given. Then return ' +
      'whether the write succeeded and the path written.\n\n' +
      '----- BEGIN DOCUMENT -----\n' + correctedMarkdown + '\n----- END DOCUMENT -----',
      // Cheap tier: a verbatim Write with no reasoning (see model-tier strategy above).
      { label: 'rewrite-assessment', phase: 'Ground', schema: WRITE_SCHEMA, model: 'sonnet' }
    ))
    if (rewrote && rewrote.written) {
      markdown = correctedMarkdown
      correctedNumbers = correctable.map((c) => c.findingNumber)
      log('Corrective grounding: re-wrote ' + correctedNumbers.length + ' finding(s) against source.')
    } else {
      rewriteFailed = true
      log('Corrective grounding: ' + correctable.length + ' correction(s) found but the re-write failed; the original document stands.')
    }
  }
  const ungrounded = detected.filter((u) => !correctedNumbers.includes(u.findingNumber))
  grounding = { ran: true, checked: groundResults.length, ungrounded, corrected: correctedNumbers }
  log('Grounding: ' + grounding.checked + ' of ' + synthFindings.length + ' finding(s) checked (top ' +
    groundTargets.length + '), ' + correctedNumbers.length + ' corrected, ' + ungrounded.length + ' citation(s) unresolved.')
}

// Join the initial persist (a no-op if the grounding path already awaited it) and compute synthOk
// after the overlapped fan-out — it gates both the corrective re-write above and the status below.
if (!writeJoined) wrote = await writePromise
const synthOk = !!(synthStructured && wrote && wrote.written)
const finalPath = (wrote && wrote.path) || outPath
log('Synthesis ' + (synthOk
  ? 'written to ' + finalPath + ' (' + findingsCount + ' findings)'
  : 'FAILED — no trustworthy file') + '.')

// Status is derived only now — after grounding — so ungrounded citations can degrade the run
// (grounding runs post-synthesis). An empty-observation run that also lost coverage escalates to
// 'failed'; a legitimately empty one stays 'ok'. Reliability flags merge the run-level signals
// (critic nulls, partial verification) with the verify-stage flags into one surfaced list; they
// disclose shortfalls in the audit trail but do not, by themselves, set the status.
const { status, coverage } = degradationSummary({
  plannedAreas: dispatchedAreas,
  droppedAreas: droppedAreaNames,
  synthOk,
  verifyFailed,
  verifyLost,
  ungrounded: grounding.ungrounded.length,
  noObservations: allObs.length === 0,
})
const reliabilityFlags = [
  ...runReliabilityFlags({ planCriticFailed, completenessCriticFailed, verdictsReceived: verdicts.length, verdictsExpected }),
  ...(rewriteFailed ? ['post-synthesis corrections were found but the corrective re-write failed; the original document stands'] : []),
  ...((verification && verification.reliabilityFlags) || []),
]
log('Run status=' + status + (reliabilityFlags.length ? '; ' + reliabilityFlags.length + ' reliability flag(s).' : '.'))
// Audit summary is built from the surfaced signals — including the merged reliabilityFlags above —
// so its counts match what the result actually exposes. Positioned before the large markdown field
// so it survives notification truncation.
const auditSummary = summarizeAudit({
  status,
  observationCount: allObs.length,
  synthInputCount: verifiedObs.length,
  findingsCount,
  auditActions,
  grounding,
  reliabilityFlags,
})

return {
  scope,
  focus,
  effort: overallEffort,
  areas: areaNames,
  status,
  coverage,
  reliabilityFlags,
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
