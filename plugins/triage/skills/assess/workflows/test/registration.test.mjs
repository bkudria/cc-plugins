// The assess skill dispatches investigate.js by its registered plugin workflow
// name, because Workflow rejects a scriptPath outside the session's directories.
// The name is assembled from three files that must agree: plugin.json registers
// the script, the script's meta.name names it, and SKILL.md calls it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const pluginRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const manifest = JSON.parse(readFileSync(resolve(pluginRoot, '.claude-plugin/plugin.json'), 'utf8'))
const investigatePath = fileURLToPath(new URL('../investigate.js', import.meta.url))
const skill = readFileSync(fileURLToPath(new URL('../../SKILL.md', import.meta.url)), 'utf8')

const registeredPaths = () =>
  [].concat(manifest.workflows ?? []).map((p) => resolve(pluginRoot, p))

const metaName = () =>
  readFileSync(investigatePath, 'utf8').match(/export const meta = \{\s*name:\s*'([^']+)'/)[1]

test('plugin.json registers investigate.js as a plugin workflow', () => {
  assert.ok(registeredPaths().includes(investigatePath))
})

test('SKILL.md dispatches the workflow by its registered plugin name', () => {
  const name = `${manifest.name}:${metaName()}`
  assert.ok(skill.includes(`name: "${name}"`), `SKILL.md should call Workflow with name: "${name}"`)
})
