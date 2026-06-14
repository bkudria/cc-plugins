// Loads the pure helper functions out of verify.js for unit testing.
//
// verify.js is a Workflow script: the runtime strips its `export` and wraps the
// body in a function, so it legally contains a top-level `return` and calls
// injected globals (phase/agent/parallel/log/...). That makes it impossible to
// `import` here directly. Instead we read the source, slice out the
// marker-delimited pure-function regions (which reference no injected globals),
// and evaluate just those — so the shipping code itself is what gets tested, with
// no duplication and no build step.
//
// Each pure function is wrapped in verify.js like:
//   /* test-seam:pure-fn:start */
//   const countDispatched = (...) => { ... }
//   /* test-seam:pure-fn:end */
// The returned bag contains exactly the top-level `const NAME =` declarations
// found inside those regions, so it grows as functions are marked.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SOURCE = fileURLToPath(new URL('../verify.js', import.meta.url))
const REGION = /\/\* test-seam:pure-fn:start \*\/([\s\S]*?)\/\* test-seam:pure-fn:end \*\//g

const src = readFileSync(SOURCE, 'utf8')
const regions = [...src.matchAll(REGION)].map((m) => m[1])
if (!regions.length) {
  throw new Error('no test-seam:pure-fn regions found in verify.js — the seam markers are missing')
}

const body = regions.join('\n')
// Only top-level declarations (column 0) — inner block-scoped consts are indented
// and must not leak into the returned bag.
const names = [...body.matchAll(/^const\s+([A-Za-z0-9_]+)\s*=/gm)].map((m) => m[1])
// `new Function` here evaluates first-party, version-controlled source from the
// sibling verify.js (the code under test) — never external or untrusted input.
// This is the same trust model as any test runner loading its own source; there
// is no injection surface (no caller-supplied data reaches this string).
const factory = new Function(`${body}\nreturn { ${names.join(', ')} }`)

export const helpers = factory()
