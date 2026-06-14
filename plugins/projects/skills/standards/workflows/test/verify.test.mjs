// Unit suite for the pure functions in ../verify.js.
//
// verify.js fans out one haiku verifier per pending standard and counts how many
// ran. Each verifier is told "your chat reply is ignored" and does its work by
// Write-ing a JSON verdict file, so a successful verifier typically ends its turn
// with no closing text and returns "" to the harness. parallel() yields null only
// for an agent that died (terminal API error / skipped). countDispatched must
// therefore count every non-null result — INCLUDING "" — and drop only the deaths.
// It is pure (plain array in, number out, no injected globals), so it is
// unit-testable in isolation via the source loader in ./_load.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { helpers } from './_load.mjs'

const { countDispatched } = helpers

test('countDispatched counts a silent-success "" as dispatched and drops only the null death', () => {
  // The regression case: a verifier that wrote its verdict and returned "" is a
  // success, not an error. Only the null (died) entry should be excluded.
  assert.equal(countDispatched(['{"met":true}', '', null]), 2)
})

test('countDispatched counts all-silent-success fan-outs in full', () => {
  assert.equal(countDispatched(['', '', '']), 3)
})

test('countDispatched counts only deaths as not-dispatched', () => {
  assert.equal(countDispatched([null, null]), 0)
})

test('countDispatched counts ordinary non-empty returns', () => {
  assert.equal(countDispatched(['x', 'y']), 2)
})

test('countDispatched treats undefined like a death', () => {
  assert.equal(countDispatched(['', undefined, 'ok']), 2)
})

test('countDispatched of an empty fan-out is zero', () => {
  assert.equal(countDispatched([]), 0)
})
