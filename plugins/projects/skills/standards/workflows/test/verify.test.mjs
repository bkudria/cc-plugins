// Unit suite for the pure functions in ../verify.js.
//
// verify.js fans out one haiku verifier per pending standard and counts how many
// ran. Each verifier is told "your chat reply is ignored" and does its work by
// Write-ing a JSON verdict file, so a successful verifier typically ends its turn
// with no closing text and returns "" to the harness. parallel() yields null only
// for an agent that died (terminal API error / skipped). countDispatched must
// therefore count every non-null result — INCLUDING "" — and drop only the deaths;
// failedIds is its complement, naming WHICH standards died (by pairing each result
// with its pending entry by position) so the shortfall log is actionable rather than
// a bare number. Both are pure (plain arrays in, no injected globals), so they are
// unit-testable in isolation via the source loader in ./_load.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { helpers } from './_load.mjs'

const { countDispatched, failedIds } = helpers

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

test('failedIds names only the died standard, treating silent-success "" as dispatched', () => {
  // The regression-shaped case: results[i] pairs with pending[i] by position. The ""
  // verifier wrote its verdict and succeeded; only the null (died) entry is named.
  assert.deepEqual(
    failedIds(['{"met":true}', '', null], [{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
    ['c']
  )
})

test('failedIds names every standard when all verifiers died', () => {
  assert.deepEqual(failedIds([null, null], [{ id: 'x' }, { id: 'y' }]), ['x', 'y'])
})

test('failedIds names nothing when every verifier silently succeeded', () => {
  assert.deepEqual(failedIds(['', '', ''], [{ id: 'a' }, { id: 'b' }, { id: 'c' }]), [])
})

test('failedIds treats undefined like a death', () => {
  assert.deepEqual(failedIds(['ok', undefined], [{ id: 'a' }, { id: 'b' }]), ['b'])
})

test('failedIds preserves pending order when naming multiple deaths', () => {
  assert.deepEqual(
    failedIds([null, 'ok', null], [{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
    ['a', 'c']
  )
})

test('failedIds of an empty fan-out is empty', () => {
  assert.deepEqual(failedIds([], []), [])
})

// Verifier agent options. Each standard's check is narrow, so verifiers run on the
// cheap haiku tier. Effort is pinned to high: at lower effort haiku more often takes a
// tool's exit code at face value (e.g. passing a lint run over a project with no source
// files), and an unpinned agent would inherit whatever effort the calling session runs at.
const { verifierOptions, diedIndices, mergeRetried } = helpers

test('verifierOptions pins verifiers to haiku at high effort', () => {
  const o = verifierOptions('base/lockfile')
  assert.equal(o.model, 'haiku')
  assert.equal(o.effort, 'high')
})

test('verifierOptions labels the agent by standard id under the Verify phase', () => {
  assert.deepEqual(
    { label: verifierOptions('base/lockfile').label, phase: verifierOptions('base/lockfile').phase },
    { label: 'verify:base/lockfile', phase: 'Verify' }
  )
})

// One in-script retry pass: verifiers that died (null/undefined) are dispatched once
// more and their slots replaced, so a transient API error doesn't surface as a false
// FAIL at --merge.
test('diedIndices returns the positions of dead verifiers, keeping silent-success ""', () => {
  assert.deepEqual(diedIndices(['ok', null, '', undefined]), [1, 3])
})

test('diedIndices of an all-success fan-out is empty', () => {
  assert.deepEqual(diedIndices(['', 'x']), [])
})

test('mergeRetried replaces only the retried slots, in order', () => {
  assert.deepEqual(mergeRetried(['a', null, 'c', null], [1, 3], ['b', null]), ['a', 'b', 'c', null])
})

test('mergeRetried leaves the input array unmodified', () => {
  const results = [null]
  mergeRetried(results, [0], ['x'])
  assert.deepEqual(results, [null])
})
