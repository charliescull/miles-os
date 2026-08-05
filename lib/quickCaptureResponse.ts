export type QuickCaptureReplayState = 'processed' | 'in_progress' | undefined

export function quickCaptureHttpStatus(state: QuickCaptureReplayState): number {
  if (state === 'in_progress') return 202
  if (state === 'processed') return 200
  return 201
}
