export const meta = {
  name: 'assess-investigate',
  description: 'Autonomous investigation core for the assess skill: plan areas, investigate each in parallel, cross-verify, synthesize a numbered observation-only assessment, and write it to disk',
  whenToUse: 'Invoked by the assess skill (by path) once scope/focus/depth are resolved. Runs Phases 2-4 headless; the skill keeps Phase 0-1 (scope resolution + interview).',
  phases: [
    { title: 'Plan', detail: 'break the scope into semi-independent areas' },
    { title: 'Investigate', detail: 'one agent per area, observation-only, in parallel' },
    { title: 'Verify', detail: 'cross-reference overlapping claims and spot-check numbers' },
    { title: 'Synthesize', detail: 'merge/filter/order into numbered findings and write the file' },
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
  return { error: 'scope is required', findingsCount: 0 }
}
const focus = P.focus ||
  'problems, gaps, risks, inconsistencies, surprising patterns, missing pieces, and opportunities for improvement'
const depth = P.depth || 'standard' // quick | standard | comprehensive
const sessionId = P.sessionId || 'latest'
const outPath = P.outPath || '/tmp/assessment-' + sessionId + '.md'

const AREA_GUIDANCE = {
  quick: '3 areas at most; surface-level',
  standard: '4 to 6 areas',
  comprehensive: '6 to 8 areas, including edge cases and cross-cutting concerns',
}[depth] || '4 to 6 areas'

// ---- Plan -------------------------------------------------------------------
phase('Plan')
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overallQuestion', 'areas'],
  properties: {
    overallQuestion: { type: 'string', description: 'The cohesive question this investigation answers' },
    areas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'rationale'],
        properties: {
          name: { type: 'string' },
          rationale: { type: 'string', description: 'One line: why this facet matters to the overall question' },
        },
      },
    },
  },
}
const plan = await agent(
  'You are planning an investigation (an assessment), not performing it.\n\n' +
  'Scope: ' + scope + '\n' +
  'Focus: ' + focus + '\n' +
  'Depth: ' + depth + ' — aim for ' + AREA_GUIDANCE + '.\n\n' +
  'Break the scope into semi-independent areas that TOGETHER cohesively investigate the overall question — ' +
  'facets of one investigation, not a disconnected inventory. Each area should be explorable on its own. ' +
  'For each area give a short name and a one-line rationale. Do NOT investigate yet and do NOT propose fixes.',
  { label: 'plan', schema: PLAN_SCHEMA }
)

const areas = (plan && plan.areas) || []
if (!areas.length) {
  log('Planner produced no areas; nothing to investigate.')
  return { error: 'no areas planned', scope, findingsCount: 0 }
}
const areaNames = areas.map((a) => a.name)
log('Investigating ' + areas.length + ' area(s): ' + areaNames.join(', '))

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
const investigations = (await parallel(areas.map((a) => () =>
  agent(
    'Investigate the area "' + a.name + '" within this scope: ' + scope + '\n' +
    'Why this area matters: ' + a.rationale + '\n' +
    'Overall question: ' + (plan.overallQuestion || scope) + '\n' +
    'Other areas in this investigation (context only — do NOT investigate these): ' +
    areaNames.filter((n) => n !== a.name).join('; ') + '\n' +
    'Look for: ' + focus + '\n' +
    'Depth: ' + depth + '\n\n' +
    'OBSERVATION-ONLY. Do NOT suggest fixes, solutions, or what "should" be done. Record only what IS and why ' +
    'it is noteworthy. Every observation MUST include concrete evidence: file paths, line numbers, configuration ' +
    'values, or specific patterns — observations without evidence are opinions, not findings. Survey before ' +
    'going deep. Set "area" to exactly: ' + a.name,
    { label: 'area:' + a.name, phase: 'Investigate', schema: OBS_SCHEMA }
  )
))).filter(Boolean)

if (investigations.length < areas.length) {
  log((areas.length - investigations.length) + ' area(s) failed to investigate and were dropped.')
}
const allObs = investigations.flatMap((i) =>
  (i.observations || []).map((o) => ({ area: i.area, title: o.title, body: o.body, evidence: o.evidence, significance: o.significance }))
)
log('Collected ' + allObs.length + ' observation(s) across ' + investigations.length + ' area(s).')
if (!allObs.length) {
  log('No observations produced; writing an empty assessment.')
}

// ---- Verify (barrier: needs every observation at once) ----------------------
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
const verification = await agent(
  'You are verifying investigation observations before synthesis. You have read-only tools (Read, Grep, Glob, Bash).\n\n' +
  'Scope: ' + scope + '\n\n' +
  'Observations (JSON):\n' + JSON.stringify(allObs, null, 2) + '\n\n' +
  'Perform these checks:\n' +
  '1. Cross-reference claims across areas: where two observations touch the same file, value, or claim, ' +
  'independently verify the shared element. Where areas are disjoint, say so and move on.\n' +
  '2. Spot-check the single most significant numeric claim (a count, frequency, or statistic) by running one ' +
  'independent check.\n' +
  '3. Reliability: flag any observation that appears to rely on tool output that could have been truncated, ' +
  'timed out, or silently failed.\n' +
  (depth === 'quick' ? 'Depth is quick — keep verification light; check only the most load-bearing claim.\n' : '') +
  'Do NOT add new findings and do NOT suggest fixes. Report only verification results and corrections.',
  { label: 'verify', schema: VERIFY_SCHEMA }
)

// ---- Synthesize + write -----------------------------------------------------
phase('Synthesize')
const SYNTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['markdown', 'findingsCount', 'outPath'],
  properties: {
    markdown: { type: 'string' },
    findingsCount: { type: 'integer' },
    outPath: { type: 'string' },
  },
}
const synth = await agent(
  'You are synthesizing investigation observations into a final numbered assessment, then writing it to disk.\n\n' +
  'Scope: ' + scope + '\n' +
  'Areas covered: ' + areaNames.join(', ') + '\n\n' +
  'Observations (JSON):\n' + JSON.stringify(allObs, null, 2) + '\n\n' +
  'Verification results (apply corrections; drop or fix any claim flagged unreliable):\n' +
  JSON.stringify(verification, null, 2) + '\n\n' +
  'SYNTHESIS RULES:\n' +
  '- Sub-agent numbering is discarded. Each finding number comes from significance order (most impactful first).\n' +
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
  'OUTPUT FORMAT — produce exactly this Markdown (h3 finding headings are "### N. Title" — number and short ' +
  'title only, no bold, no em dash, no body text on the heading line; finding bodies are a single plain ' +
  'paragraph with no sub-bullets):\n\n' +
  '## Assessment: <scope description>\n\n' +
  '**Scope**: <what was investigated>\n' +
  '**Areas covered**: <comma-separated areas>\n\n' +
  '## Findings\n\n' +
  '### 1. <short descriptive title>\n\n' +
  '<single paragraph: what was found, where (paths/lines/values), current state, why noteworthy>\n\n' +
  '### 2. <...>\n\n' +
  '## Summary\n\n' +
  '<N findings. Brief overall assessment: concentration of problems, recurring root causes, severity. No ' +
  'positive or working-as-designed notes.>\n\n' +
  'AFTER composing the assessment, WRITE it verbatim to exactly this path using the Write tool: ' + outPath + '\n' +
  'Then return the markdown, the integer finding count, and the outPath.',
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTH_SCHEMA }
)

const finalPath = (synth && synth.outPath) || outPath
log('Assessment written to ' + finalPath + ' (' + ((synth && synth.findingsCount) || 0) + ' findings).')

return {
  scope,
  focus,
  depth,
  areas: areaNames,
  observationCount: allObs.length,
  findingsCount: (synth && synth.findingsCount) || 0,
  outPath: finalPath,
  markdown: (synth && synth.markdown) || '',
}
