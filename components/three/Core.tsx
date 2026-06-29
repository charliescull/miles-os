'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { seededRandom } from '@/components/hud'

/**
 * FINANCE organ: a net-worth core.
 * Dense cyan point sphere that breathes; on the systolic beat it flashes a
 * signal tint by daily P/L sign (green up / red down) — only the *accent*
 * flashes, the core stays cyan. Ticker nodes orbit, sized by position weight.
 */

const UP = new THREE.Color('#3fe08a')
const DOWN = new THREE.Color('#f0533f')
const WHITE = new THREE.Color('#7fc4ff') // resting core tint — Jarvis cyan

interface Ticker { weight: number }

function buildCore(count: number): Float32Array {
  const rnd = seededRandom('finance-core')
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1
    const phi = rnd() * Math.PI * 2
    const r = Math.cbrt(rnd()) * 0.9 // fill the volume, denser look
    const s = Math.sqrt(1 - u * u)
    pos[i * 3] = s * Math.cos(phi) * r
    pos[i * 3 + 1] = u * r
    pos[i * 3 + 2] = s * Math.sin(phi) * r
  }
  return pos
}

function buildOrbit(tickers: Ticker[]): { pos: Float32Array; sizes: Float32Array; phases: Float32Array; radii: Float32Array; incl: Float32Array } {
  const rnd = seededRandom('finance-orbit')
  const n = tickers.length
  const pos = new Float32Array(n * 3)
  const sizes = new Float32Array(n)
  const phases = new Float32Array(n)
  const radii = new Float32Array(n)
  const incl = new Float32Array(n)
  const maxW = Math.max(1, ...tickers.map(t => t.weight))
  for (let i = 0; i < n; i++) {
    phases[i] = rnd() * Math.PI * 2
    radii[i] = 1.5 + rnd() * 0.7
    incl[i] = (rnd() - 0.5) * 0.9
    sizes[i] = 4 + (tickers[i].weight / maxW) * 22
  }
  return { pos, sizes, phases, radii, incl }
}

export default function Core({
  pnlSign = 0,
  tickers = [],
  paused = false,
}: {
  pnlSign?: number
  tickers?: Ticker[]
  paused?: boolean
}) {
  const corePos = useMemo(() => buildCore(2000), [])
  const orbit = useMemo(() => buildOrbit(tickers.length ? tickers : [{ weight: 1 }]), [tickers])
  const groupRef = useRef<THREE.Group>(null)
  const coreMatRef = useRef<THREE.PointsMaterial>(null)
  const orbitGeomRef = useRef<THREE.BufferGeometry>(null)

  const tintColor = pnlSign > 0 ? UP : pnlSign < 0 ? DOWN : WHITE

  useFrame((state, delta) => {
    if (paused) return
    const t = state.clock.elapsedTime
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.08

    // slow "market pulse" ~ every 4s; flash the tint on the crest
    const pulse = Math.pow(Math.max(0, Math.sin(t * (Math.PI / 2))), 6)
    if (coreMatRef.current) {
      coreMatRef.current.opacity = 0.4 + pulse * 0.5
      coreMatRef.current.color.copy(WHITE).lerp(tintColor, pulse * (pnlSign === 0 ? 0 : 0.9))
    }

    // advance orbiting tickers
    const op = orbit.pos
    for (let i = 0; i < op.length / 3; i++) {
      const ang = orbit.phases[i] + t * 0.5 * (1 - orbit.radii[i] * 0.2)
      const r = orbit.radii[i]
      op[i * 3] = Math.cos(ang) * r
      op[i * 3 + 1] = Math.sin(ang) * r * orbit.incl[i]
      op[i * 3 + 2] = Math.sin(ang) * r
    }
    if (orbitGeomRef.current) orbitGeomRef.current.attributes.position.needsUpdate = true
  })

  return (
    <group ref={groupRef}>
      {/* core */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[corePos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={coreMatRef}
          color="#7fc4ff"
          size={0.022}
          sizeAttenuation
          transparent
          opacity={0.45}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* orbiting ticker nodes — sized by position weight */}
      <points>
        <bufferGeometry ref={orbitGeomRef}>
          <bufferAttribute attach="attributes-position" args={[orbit.pos, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[orbit.sizes, 1]} />
        </bufferGeometry>
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          vertexShader={`
            attribute float aSize;
            void main() {
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = aSize / -mv.z * 4.0;
              gl_Position = projectionMatrix * mv;
            }
          `}
          fragmentShader={`
            void main() {
              vec2 c = gl_PointCoord - vec2(0.5);
              float d = length(c);
              if (d > 0.5) discard;
              gl_FragColor = vec4(0.55, 0.78, 1.0, smoothstep(0.5, 0.0, d));
            }
          `}
        />
      </points>
    </group>
  )
}
