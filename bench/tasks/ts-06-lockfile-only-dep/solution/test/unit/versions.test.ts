import test from 'node:test'
import assert from 'node:assert/strict'
import { isNewer } from '../../src/versions.ts'

test('isNewer compares versions', () => assert.equal(isNewer('1.2.3', '1.2.0'), true))
