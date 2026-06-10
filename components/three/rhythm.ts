// Shared cardiac rhythm — drives both the 3D heart beat and the EKG trace from
// one wall-clock source so they stay phase-locked. All inputs in seconds.

export function beatPhase(t: number, bpm: number): number {
  const period = 60 / bpm
  return (t % period) / period
}

function gauss(x: number, mu: number, sigma: number): number {
  const d = x - mu
  return Math.exp(-(d * d) / (2 * sigma * sigma))
}

/**
 * Beat envelope (lub-dub). Returns a small additive scale ~[0, 0.09].
 * Sharp systolic "lub" at phase 0, softer diastolic "dub" just after.
 */
export function beatEnvelope(phase: number): number {
  const lub = gauss(phase, 0.0, 0.028) + gauss(phase, 1.0, 0.028)
  const dub = gauss(phase, 0.16, 0.04)
  return 0.06 * lub + 0.03 * dub
}

/**
 * Idealized PQRST ECG value in roughly [-0.25, 1] for a given beat phase.
 * R spike at phase ~0.0 to line up with the systolic "lub".
 */
export function ekgValue(phase: number): number {
  // wrap so the spike sits a touch into the window for a visible run-up
  const p = phase
  const P = 0.12 * gauss(p, 0.62, 0.022)        // P wave
  const Q = -0.10 * gauss(p, 0.70, 0.008)       // Q dip
  const R = 1.0 * gauss(p, 0.73, 0.007)         // R spike
  const S = -0.22 * gauss(p, 0.76, 0.010)       // S dip
  const T = 0.22 * gauss(p, 0.88, 0.03)         // T wave
  return P + Q + R + S + T
}
