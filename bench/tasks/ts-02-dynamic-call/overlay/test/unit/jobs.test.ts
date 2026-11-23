import test from 'node:test'
import assert from 'node:assert/strict'
import { nightly } from '../../src/jobs.ts'

test('nightly job applies the discount', () => assert.equal(nightly(), 150))
