import test from 'node:test'
import assert from 'node:assert/strict'
import { legacyWithTax } from '../../src/legacy/tax.ts'

test('legacy tax adds 7%', () => assert.equal(legacyWithTax(100), 107))
