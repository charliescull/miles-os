'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { seededRandom } from '@/components/hud'
import { softSprite } from './sprite'

/**
 * HOME organ: a procedural neural brain.
 * Red point-cloud cortex with sulci wrinkles, a faint blue synapse lattice, and
 * bright blue light pulses that walk the edge graph (neurons firing). All
 * geometry is generated once from a fixed seed — no assets, fully deterministic.
 *
 * `liveliness` (0..1) drives firing density + speed; wire it to real activity.
 */

const POINT_COUNT = 4400
const EDGE_DIST = 0.21
const MAX_EDGES_PER_POINT = 3

interface BrainGraph {
  positions: Float32Array
  linePositions: Float32Array
  edges: [number, number][]
  adjacency: number[][] // vertex -> edge indices
}

function buildBrain(seed: string): BrainGraph {
  const rnd = seededRandom(seed)
  const pts: THREE.Vector3[] = []

  // Cortex: points on a wrinkled twin-hemisphere ellipsoid
  const cortexCount = Math.floor(POINT_COUNT * 0.86)
  for (let i = 0; i < cortexCount; i++) {
    // uniform direction
    const u = rnd() * 2 - 1
    const phi = rnd() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    let x = s * Math.cos(phi)
    let y = u
    let z = s * Math.sin(phi)

    // sulci — layered sinusoidal wrinkles on the radius
    const theta = Math.atan2(z, x)
    const r =
      1 +
      0.05 * Math.sin(7 * theta + 1.7) * Math.sin(9 * Math.asin(u)) +
      0.035 * Math.sin(13 * theta) * Math.cos(5 * u * Math.PI)

    x *= r; y *= r; z *= r

    // ellipsoid proportions (x lateral, y vertical, z anterior)
    x *= 1.0; y *= 0.78; z *= 1.22

    // hemispheres: push laterally off the midline → sagittal fissure
    const side = x >= 0 ? 1 : -1
    x = side * (Math.abs(x) * 0.92 + 0.07)

    // flatten the base
    if (y < 0) y *= 0.74

    pts.push(new THREE.Vector3(x, y, z))
  }

  // Cerebellum: a denser small lobe tucked under the posterior
  const cbCount = POINT_COUNT - cortexCount
  for (let i = 0; i < cbCount; i++) {
    const u = rnd() * 2 - 1
    const phi = rnd() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const r = 1 + 0.08 * Math.sin(16 * phi) // tight horizontal folia ridges
    pts.push(new THREE.Vector3(
      s * Math.cos(phi) * 0.42 * r,
      u * 0.26 * r - 0.52,
      s * Math.sin(phi) * 0.34 * r - 0.92,
    ))
  }

  const positions = new Float32Array(pts.length * 3)
  pts.forEach((p, i) => p.toArray(positions, i * 3))

  // Synapse edges: near-neighbor pairs, capped per point so density stays calm
  const edges: [number, number][] = []
  const edgeCount = new Int8Array(pts.length)
  // spatial hash for O(n·k) neighbor lookup
  const cell = EDGE_DIST
  const grid = new Map<string, number[]>()
  const key = (p: THREE.Vector3) =>
    `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`
  pts.forEach((p, i) => {
    const k = key(p)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k)!.push(i)
  })
  const distSq = EDGE_DIST * EDGE_DIST
  for (let i = 0; i < pts.length; i++) {
    if (edgeCount[i] >= MAX_EDGES_PER_POINT) continue
    const p = pts[i]
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`)
      if (!bucket) continue
      for (const j of bucket) {
        if (j <= i || edgeCount[i] >= MAX_EDGES_PER_POINT || edgeCount[j] >= MAX_EDGES_PER_POINT) continue
        if (p.distanceToSquared(pts[j]) < distSq) {
          edges.push([i, j])
          edgeCount[i]++; edgeCount[j]++
        }
      }
    }
  }

  const linePositions = new Float32Array(edges.length * 6)
  edges.forEach(([a, b], e) => {
    pts[a].toArray(linePositions, e * 6)
    pts[b].toArray(linePositions, e * 6 + 3)
  })

  const adjacency: number[][] = Array.from({ length: pts.length }, () => [])
  edges.forEach(([a, b], e) => { adjacency[a].push(e); adjacency[b].push(e) })

  return { positions, linePositions, edges, adjacency }
}

interface Pulse {
  edge: number
  from: number // vertex index the pulse left from (defines direction)
  t: number
  speed: number
}

export default function Brain({
  liveliness = 0.5,
  paused = false,
}: {
  liveliness?: number
  paused?: boolean
}) {
  const graph = useMemo(() => buildBrain('miles-brain-v1'), [])
  const sprite = useMemo(() => softSprite(), [])
  const groupRef = useRef<THREE.Group>(null)
  const pulseGeomRef = useRef<THREE.BufferGeometry>(null)
  const pointsMatRef = useRef<THREE.PointsMaterial>(null)

  const pulseCount = Math.max(8, Math.round(8 + liveliness * 18))
  const pulses = useRef<Pulse[]>([])
  const pulsePositions = useMemo(() => new Float32Array(pulseCount * 3), [pulseCount])
  const rndRef = useRef(seededRandom('miles-pulses'))

  function respawn(p: Pulse) {
    const rnd = rndRef.current
    p.edge = Math.floor(rnd() * graph.edges.length)
    p.from = graph.edges[p.edge][rnd() < 0.5 ? 0 : 1]
    p.t = 0
    p.speed = 0.8 + rnd() * 1.4
  }

  if (pulses.current.length !== pulseCount) {
    pulses.current = Array.from({ length: pulseCount }, () => {
      const p: Pulse = { edge: 0, from: 0, t: 0, speed: 1 }
      respawn(p)
      p.t = rndRef.current() // de-sync starts
      return p
    })
  }

  useFrame((state, delta) => {
    if (paused) return
    const t = state.clock.elapsedTime

    // DRIFT: a clear, steady spin (the brain visibly rotates) + a slow nod
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * (0.20 + liveliness * 0.06)
      groupRef.current.rotation.x = Math.sin(t * 0.12) * 0.06
    }

    // ambient luminance breathing — keeps the red tissue under the bloom threshold
    if (pointsMatRef.current) {
      pointsMatRef.current.opacity = 0.30 + Math.sin(t * 0.5) * 0.07
    }

    // neurons firing: pulses walk the synapse graph
    const speedScale = 0.9 + liveliness * 1.3
    const a = new THREE.Vector3(), b = new THREE.Vector3()
    pulses.current.forEach((p, i) => {
      p.t += delta * p.speed * speedScale
      if (p.t >= 1) {
        // continue from the vertex we arrived at, or respawn if dead-end
        const [va, vb] = graph.edges[p.edge]
        const arrived = p.from === va ? vb : va
        const next = graph.adjacency[arrived].filter(e => e !== p.edge)
        if (next.length === 0 || rndRef.current() < 0.25) {
          respawn(p)
        } else {
          p.edge = next[Math.floor(rndRef.current() * next.length)]
          p.from = arrived
          p.t = 0
        }
      }
      const [va, vb] = graph.edges[p.edge]
      const fromIdx = p.from === va ? va : vb
      const toIdx = p.from === va ? vb : va
      a.fromArray(graph.positions, fromIdx * 3)
      b.fromArray(graph.positions, toIdx * 3)
      a.lerp(b, p.t).toArray(pulsePositions, i * 3)
    })
    if (pulseGeomRef.current) {
      pulseGeomRef.current.attributes.position.needsUpdate = true
    }
  })

  return (
    // initial yaw gives the 3/4 profile — the most brain-like first frame
    // (also the still frame under reduced motion)
    <group ref={groupRef} rotation={[0.12, -0.55, 0]} scale={1.18}>
      {/* cortex: dense soft-sprite cloud, tinted RED — reads as fleshy tissue */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[graph.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={pointsMatRef}
          color="#ff3a2f"
          map={sprite}
          size={0.052}
          sizeAttenuation
          transparent
          opacity={0.32}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* synapse lattice — faint blue connective web so the firing reads as a
          neural network, not floating dots. Kept under the bloom threshold. */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[graph.linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color="#2f8fff"
          transparent
          opacity={0.06}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      {/* firing neurons — bright BLUE blooms walking the synapse graph */}
      <points>
        <bufferGeometry ref={pulseGeomRef}>
          <bufferAttribute attach="attributes-position" args={[pulsePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#5cc6ff"
          map={sprite}
          size={0.17}
          sizeAttenuation
          transparent
          opacity={1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}
