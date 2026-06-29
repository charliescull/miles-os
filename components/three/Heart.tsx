'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { beatPhase, beatEnvelope } from './rhythm'
import { softSprite } from './sprite'

/**
 * HEALTH organ: a procedural beating heart.
 * A puffy heart silhouette lofted through depth into a rounded surface, drawn
 * as a soft-sprite point volume — same point + bloom technique as the brain.
 * Beats on a real cardiac rhythm via the shared `rhythm` module so the EKG
 * overlay stays phase-locked. Kept small (BASE_SCALE) as a slim HEALTH accent.
 */

const NT = 120 // points around the silhouette
const NV = 40 // depth layers

// Classic 2D heart curve, centered + normalized to ~unit radius.
function heartXY(t: number): [number, number] {
  const x = 16 * Math.pow(Math.sin(t), 3)
  const y =
    13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
  return [x / 17, (y + 2) / 17] // shift so it sits centered, scale to ~[-1,1]
}

interface HeartGeo {
  positions: Float32Array
}

function buildHeart(): HeartGeo {
  const grid: THREE.Vector3[] = []
  const DEPTH = 0.42
  for (let vi = 0; vi < NV; vi++) {
    const v = (vi / (NV - 1)) * 2 - 1 // -1..1
    const f = Math.sqrt(Math.max(0, 1 - v * v)) // round the edges toward poles
    const z = DEPTH * v
    for (let ti = 0; ti < NT; ti++) {
      const t = (ti / NT) * Math.PI * 2
      const [hx, hy] = heartXY(t)
      grid.push(new THREE.Vector3(hx * f, hy * f, z))
    }
  }

  const positions = new Float32Array(grid.length * 3)
  grid.forEach((p, i) => p.toArray(positions, i * 3))
  return { positions }
}

export default function Heart({
  bpm = 64,
  paused = false,
}: {
  bpm?: number
  paused?: boolean
}) {
  const geo = useMemo(() => buildHeart(), [])
  const sprite = useMemo(() => softSprite(), [])
  const groupRef = useRef<THREE.Group>(null)
  const pointsMatRef = useRef<THREE.PointsMaterial>(null)

  // BASE_SCALE keeps the organ small + tidy on the slim HEALTH accent strip.
  const BASE_SCALE = 0.8

  useFrame((state) => {
    if (paused || !groupRef.current) return
    const t = performance.now() / 1000
    const phase = beatPhase(t, bpm)
    const s = 1 + beatEnvelope(phase)
    groupRef.current.scale.setScalar(s * BASE_SCALE)
    // very slow drift so it's never dead-still, but the beat is the motion
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.12) * 0.16
    if (pointsMatRef.current) {
      // brighten on the systolic thump so bloom catches the beat
      pointsMatRef.current.opacity = 0.34 + beatEnvelope(phase) * 4.2
    }
  })

  return (
    <group ref={groupRef} rotation={[0.1, 0, 0]} scale={BASE_SCALE}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geo.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={pointsMatRef}
          color="#ff3b4e"
          map={sprite}
          size={0.04}
          sizeAttenuation
          transparent
          opacity={0.36}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}
