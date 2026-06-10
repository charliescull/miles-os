'use client'

/**
 * MILES OS sound engine — pure WebAudio synthesis, no samples.
 * Quiet by default ("pleasant on the second listen at 11pm"), globally mutable.
 * AudioContext is created lazily and only ever resumed from a user gesture,
 * so autoplay policy is satisfied by construction.
 *
 * Phase 2: build per-section generative ambient on top of `ctx()`/`master`.
 */

let _ctx: AudioContext | null = null
let _master: GainNode | null = null
let _ambientBus: GainNode | null = null

const MUTE_KEY = 'miles-muted'

export function isMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
}

export function setMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch {}
  if (_master && _ctx) _master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, _ctx.currentTime, 0.05)
}

const MASTER_LEVEL = 0.16 // low by default — whole mix lives under this

/** Call from a user-gesture handler. Returns null if audio unavailable/muted. */
function ensure(): { ctx: AudioContext; master: GainNode } | null {
  if (typeof window === 'undefined') return null
  if (!_ctx) {
    try {
      _ctx = new AudioContext()
      _master = _ctx.createGain()
      _master.gain.value = isMuted() ? 0 : MASTER_LEVEL
      _master.connect(_ctx.destination)
    } catch { return null }
  }
  if (_ctx.state === 'suspended') void _ctx.resume()
  if (_ctx.state !== 'running') return null
  return { ctx: _ctx, master: _master! }
}

/** Soft boot swell — filtered saw pad rising a fifth over ~1.8s. */
export function playBootSwell() {
  const a = ensure(); if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const filt = ctx.createBiquadFilter()
  const g = ctx.createGain()
  osc.type = 'sawtooth'; osc2.type = 'sine'
  osc.frequency.setValueAtTime(55, t)
  osc.frequency.exponentialRampToValueAtTime(82.4, t + 1.8) // A1 → E2
  osc2.frequency.setValueAtTime(220, t)
  osc2.frequency.exponentialRampToValueAtTime(329.6, t + 1.8)
  filt.type = 'lowpass'
  filt.frequency.setValueAtTime(180, t)
  filt.frequency.exponentialRampToValueAtTime(1400, t + 1.8)
  filt.Q.value = 1.2
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.5, t + 1.4)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
  osc.connect(filt); osc2.connect(filt); filt.connect(g); g.connect(master)
  osc.start(t); osc2.start(t); osc.stop(t + 2.7); osc2.stop(t + 2.7)
}

/** Single dry tick — data lines landing. Vary pitch slightly per call. */
export function playTick(pitch = 1) {
  const a = ensure(); if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = 1800 * pitch
  g.gain.setValueAtTime(0.12, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
  osc.connect(g); g.connect(master)
  osc.start(t); osc.stop(t + 0.04)
}

/** One confirm chime — OPERATOR ONLINE. Pure fifth, short tail. */
export function playChime() {
  const a = ensure(); if (!a) return
  const { ctx, master } = a
  const t = ctx.currentTime
  for (const [freq, delay, level] of [[880, 0, 0.3], [1318.5, 0.09, 0.22]] as const) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t + delay)
    g.gain.exponentialRampToValueAtTime(level, t + delay + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.9)
    osc.connect(g); g.connect(master)
    osc.start(t + delay); osc.stop(t + delay + 1)
  }
}

// ─── Per-section generative ambient ─────────────────────────────────────────
// Quiet beds, ≤2 voices each. Gated behind a user gesture (ensure() only runs
// the context after resume). Switch sections with setAmbientSection().

export type Section = 'home' | 'health' | 'finance' | 'crm' | 'review' | null

let _ambientSection: Section = null
let _ambientNodes: { stop: () => void }[] = []
let _ambientTimers: ReturnType<typeof setInterval>[] = []
let _ambientHeartbeatBpm = 64

function teardownAmbient() {
  _ambientTimers.forEach(clearInterval)
  _ambientTimers = []
  _ambientNodes.forEach(n => { try { n.stop() } catch {} })
  _ambientNodes = []
}

function ambientBus(): { ctx: AudioContext; bus: GainNode } | null {
  const a = ensure(); if (!a) return null
  if (!_ambientBus) {
    _ambientBus = a.ctx.createGain()
    _ambientBus.gain.value = 0.5 // ambient sits well under the boot cues
    _ambientBus.connect(a.master)
  }
  return { ctx: a.ctx, bus: _ambientBus }
}

/** A soft detuned drone pad — the shared "machine is alive" floor. */
function startDrone(base: number, level: number) {
  const a = ambientBus(); if (!a) return
  const { ctx, bus } = a
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator()
  const filt = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain()
  o1.type = 'triangle'; o2.type = 'triangle'
  o1.frequency.value = base; o2.frequency.value = base * 1.005
  filt.type = 'lowpass'; filt.frequency.value = 420; filt.Q.value = 0.6
  lfo.frequency.value = 0.06; lfoG.gain.value = 120
  lfo.connect(lfoG); lfoG.connect(filt.frequency)
  g.gain.value = 0
  g.gain.setTargetAtTime(level, ctx.currentTime, 1.5)
  o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(bus)
  o1.start(); o2.start(); lfo.start()
  _ambientNodes.push({ stop: () => {
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
    setTimeout(() => { o1.stop(); o2.stop(); lfo.stop() }, 600)
  }})
}

function blip(freq: number, level: number, dur = 0.18, type: OscillatorType = 'sine') {
  const a = ambientBus(); if (!a) return
  const { ctx, bus } = a
  const t = ctx.currentTime
  const o = ctx.createOscillator(), g = ctx.createGain()
  o.type = type; o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(level, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g); g.connect(bus)
  o.start(t); o.stop(t + dur + 0.02)
}

function noiseTick(level: number) {
  const a = ambientBus(); if (!a) return
  const { ctx, bus } = a
  const t = ctx.currentTime
  const len = Math.floor(ctx.sampleRate * 0.04)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ctx.createBufferSource(); src.buffer = buf
  const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 2600; filt.Q.value = 2
  const g = ctx.createGain(); g.gain.value = level
  src.connect(filt); filt.connect(g); g.connect(bus)
  src.start(t)
}

const PENTA = [0, 2, 4, 7, 9] // pentatonic — pings never clash
function pentaFreq(root: number) {
  const step = PENTA[Math.floor(Math.random() * PENTA.length)] + 12 * Math.floor(Math.random() * 2)
  return root * Math.pow(2, step / 12)
}

export function setAmbientHeartbeatBpm(bpm: number) {
  _ambientHeartbeatBpm = bpm
  if (_ambientSection === 'health') setAmbientSection('health') // restart with new tempo
}

export function setAmbientSection(section: Section) {
  // allow restart for the same section (e.g. tempo change)
  teardownAmbient()
  _ambientSection = section
  const a = ambientBus(); if (!a) return // no audio yet (pre-gesture) — no-op

  switch (section) {
    case 'home':
      startDrone(110, 0.05)
      // airy shimmer: rare high pentatonic blips — should surprise, not loop
      _ambientTimers.push(setInterval(() => { if (Math.random() < 0.4) blip(pentaFreq(440), 0.02, 1.1, 'sine') }, 3400))
      break
    case 'health': {
      startDrone(82, 0.045)
      const period = (60 / _ambientHeartbeatBpm) * 1000
      _ambientTimers.push(setInterval(() => blip(58, 0.05, 0.12, 'sine'), period))
      break
    }
    case 'finance':
      startDrone(98, 0.04)
      // faint market tape: sparse filtered ticks
      _ambientTimers.push(setInterval(() => { if (Math.random() < 0.5) noiseTick(0.022) }, 900))
      break
    case 'crm':
      startDrone(110, 0.04)
      _ambientTimers.push(setInterval(() => { if (Math.random() < 0.25) blip(pentaFreq(523), 0.025, 0.6, 'triangle') }, 2200))
      break
    case 'review':
      startDrone(73.4, 0.05) // low calm hum, no accents
      break
    default:
      break
  }
}

/** Resume audio + (re)start the current section bed. Call from a user gesture. */
export function primeAudio(section: Section) {
  const a = ensure(); if (!a) return
  setAmbientSection(section)
}
