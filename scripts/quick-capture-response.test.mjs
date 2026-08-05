import assert from 'node:assert/strict'
import test from 'node:test'
import { quickCaptureHttpStatus } from '../lib/quickCaptureResponse.ts'

test('new quick captures return created', () => {
  assert.equal(quickCaptureHttpStatus(undefined), 201)
})

test('completed replays return ok', () => {
  assert.equal(quickCaptureHttpStatus('processed'), 200)
})

test('in-progress replays remain retryable', () => {
  assert.equal(quickCaptureHttpStatus('in_progress'), 202)
})
