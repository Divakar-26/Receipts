import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('starts from a clean state', () => {
  try {
    assert.ok(!fs.existsSync('.state'))
  } finally {
    fs.rmSync('.state', { recursive: true, force: true })
  }
})
