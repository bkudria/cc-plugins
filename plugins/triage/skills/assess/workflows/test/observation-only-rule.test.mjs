// Unit suite for the shared observation-only rule in ../investigate.js.
//
// The observation-only discipline — describe what IS, never prescribe a fix — used to be
// re-typed inline at every role with divergent wording (the modal ban lived only at the
// synthesizer). It is now a single role-aware rule: one shared base plus composable per-role
// clauses, with the consequence-description vs. prescription distinction defined once. These
// tests lock that single-sourcing and the modal distinction, loading the rule out of
// investigate.js via the source loader in ./_load.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { helpers } from './_load.mjs'

const { observationOnlyRule, OBS_ONLY_BASE } = helpers

const ROLES = ['investigator', 'synthesizer', 'verifier', 'grounding']

test('observationOnlyRule is a callable accessor over a shared base string', () => {
  assert.equal(typeof observationOnlyRule, 'function')
  assert.equal(typeof OBS_ONLY_BASE, 'string')
  assert.ok(OBS_ONLY_BASE.length > 0)
})

test('the shared base forbids fixes / solutions / prescriptions', () => {
  assert.match(OBS_ONLY_BASE, /fix|solution|prescription/i)
})

test('every role rule is built on the one shared base (single source of truth)', () => {
  for (const role of ROLES) {
    assert.ok(
      observationOnlyRule(role).includes(OBS_ONLY_BASE),
      `role "${role}" must embed the shared OBS_ONLY_BASE`
    )
  }
  // An unrecognized role falls back to the bare base rather than silently dropping the rule.
  assert.equal(observationOnlyRule('plan-critic'), OBS_ONLY_BASE)
})

test('synthesizer and investigator encode the consequence-vs-prescription distinction', () => {
  for (const role of ['synthesizer', 'investigator']) {
    const rule = observationOnlyRule(role)
    // A forbidden, action-directed modal...
    assert.match(rule, /switch to/i, `role "${role}" should forbid action-directed modals`)
    // ...alongside an explicitly-permitted descriptive/consequence modal.
    assert.match(rule, /could expose/i, `role "${role}" should permit descriptive consequence modals`)
  }
})

test('the rule does not categorically ban descriptive modals (regression guard)', () => {
  // A revert to a flat word-ban would delete the "this consequence is allowed" clause and
  // fail here — "could" must appear as a permitted consequence, not a blanket prohibition.
  const rule = observationOnlyRule('synthesizer')
  assert.match(rule, /allowed|fine|acceptable/i)
  assert.match(rule, /could expose/i)
})

test('verifier and grounding carry their role-specific clauses', () => {
  assert.match(observationOnlyRule('verifier'), /new findings/i)
  assert.match(observationOnlyRule('grounding'), /flag-only/i)
})
