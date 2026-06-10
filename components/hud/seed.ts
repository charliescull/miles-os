// Deterministic pseudo-randomness seeded by string — identical on server and
// client, so HUD furniture (serials, barcodes) never causes hydration drift.

export function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Mulberry32 PRNG from a string seed. Returns a () => number in [0, 1). */
export function seededRandom(seed: string): () => number {
  let a = hashSeed(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SERIAL_CHARS = '0123456789ABCDEFX'

/** Diegetic serial like "A7F-2209-XK" — stable for a given seed. */
export function serialFor(seed: string, groups: number[] = [3, 4, 2]): string {
  const rnd = seededRandom(seed)
  return groups
    .map(len =>
      Array.from({ length: len }, () => SERIAL_CHARS[Math.floor(rnd() * SERIAL_CHARS.length)]).join('')
    )
    .join('-')
}
