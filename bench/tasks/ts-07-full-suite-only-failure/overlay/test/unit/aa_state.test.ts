import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('writes some state', () => {
  fs.mkdirSync('.state', { recursive: true })
  fs.writeFileSync('.state/leftover.txt', 'x')
  assert.ok(fs.existsSync('.state/leftover.txt'))
})
