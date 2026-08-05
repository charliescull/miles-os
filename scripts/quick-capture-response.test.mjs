import assert from 'node:assert/strict'
import test from 'node:test'
import { quickCaptureHttpStatus } from '../lib/quickCaptureResponse.ts'
import { appendDailyCapture, mergeDailyLogCapture } from '../lib/router/captureDedupe.ts'

test('new quick captures return created', () => {
  assert.equal(quickCaptureHttpStatus(undefined), 201)
})

test('completed replays return ok', () => {
  assert.equal(quickCaptureHttpStatus('processed'), 200)
})

test('in-progress replays remain retryable', () => {
  assert.equal(quickCaptureHttpStatus('in_progress'), 202)
})

test('keyed daily captures do not append a replay', () => {
  const first = { id: 'capture-1', text: 'remember this', ts: '2026-08-05T00:00:00.000Z', idempotency_key: 'mobile-1' }
  const replay = { ...first, ts: '2026-08-05T00:01:00.000Z' }
  const captures = appendDailyCapture([first], replay)
  assert.deepEqual(captures, [first])
})

test('unkeyed daily captures retain append behavior', () => {
  const first = { text: 'remember this', ts: '2026-08-05T00:00:00.000Z' }
  const second = { ...first, ts: '2026-08-05T00:01:00.000Z' }
  assert.equal(appendDailyCapture([first], second).length, 2)
})

test('daily capture merge preserves unrelated notes', () => {
  const notes = { habits: { water: 3 }, nutrition: { calories: 1200 } }
  const merged = mergeDailyLogCapture(notes, {
    text: 'remember this',
    ts: '2026-08-05T00:00:00.000Z',
  })
  assert.deepEqual(merged.habits, notes.habits)
  assert.deepEqual(merged.nutrition, notes.nutrition)
  assert.equal(merged.captures.length, 1)
})
