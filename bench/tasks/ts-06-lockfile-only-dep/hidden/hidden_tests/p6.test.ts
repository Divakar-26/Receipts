import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { isNewer } from '../src/versions.ts'

test('isNewer works', () => {
  assert.equal(isNewer('1.2.3', '1.2.0'), true)
  assert.equal(isNewer('1.0.0', '1.0.1'), false)
})

test('semver is declared in package.json', () => {
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  assert.ok(p.dependencies?.semver)
})
