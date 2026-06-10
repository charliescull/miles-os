'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { beatPhase, beatEnvelope } from './rhythm'

/**
 * HEALTH organ: a procedural beating heart.
 * A puffy heart silhouette lofted through depth into a rounded surface, drawn
 * as a white wireframe (rings + columns) — same point/line + bloom technique as
 * the brain. Beats on a real cardiac rhythm via the shared `rhythm` module so
 * the EKG overlay stays phase-locked.
 */

const NT = 60 // points around the silhouette
const NV = 18 // depth layers

// Classic 2D heart curve, centered + normalized to ~unit radius.
function heartXY(t: number): [number, number] {
  const x = 16 * Math.pow(Math.sin(t), 3)
  const y =
    13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
  return [x / 17, (y + 2) / 17] // shift so it sits centered, scale to ~[-1,1]
}

interface HeartGeo {
  positions: Float32Array
  linePositions: Float32Array
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
  const idx = (vi: number, ti: number) => vi * NT + (ti % NT)

  const positions = new Float32Array(grid.length * 3)
  grid.forEach((p, i) => p.toArray(positions, i * 3))

  const lines: number[] = []
  // rings (around each depth layer)
  for (let vi = 0; vi < NV; vi++) {
    for (let ti = 0; ti < NT; ti++) {
      const a = grid[idx(vi, ti)], b = grid[idx(vi, ti + 1)]
      lines.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  // columns (through depth) — every other point to keep the mesh airy
  for (let ti = 0; ti < NT; ti += 2) {
    for (let vi = 0; vi < NV - 1; vi++) {
      const a = grid[idx(vi, ti)], b = grid[idx(vi + 1, ti)]
      lines.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  return { positions, linePositions: new Float32Array(lines) }
}

export default function Heart({
  bpm = 64,
  paused = false,
}: {
  bpm?: number
  paused?: boolean
}) {
  const geo = useMemo(() => buildHeart(), [])
  const groupRef = useRef<THREE.Group>(null)
  const pointsMatRef = useRef<THREE.PointsMaterial>(null)

  useFrame((state) => {
    if (paused || !groupRef.current) return
    const t = performance.now() / 1000
    const phase = beatPhase(t, bpm)
    const s = 1 + beatEnvelope(phase)
    groupRef.current.scale.setScalar(s * 1.15)
    // very slow drift so it's never dead-still, but the beat is the motion
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.12) * 0.18
    if (pointsMatRef.current) {
      // brighten on the systolic thump so bloom catches the beat
      pointsMatRef.current.opacity = 0.38 + beatEnvelope(phase) * 4.5
    }
  })

  return (
    <group ref={groupRef} rotation={[0.1, 0, 0]} scale={1.15}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geo.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={pointsMatRef}
          color="#ffffff"
          size={0.02}
          sizeAttenuation
          transparent
          opacity={0.4}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geo.linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.08}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  )
}
