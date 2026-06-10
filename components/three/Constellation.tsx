'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { seededRandom } from '@/components/hud'

/**
 * CRM organ: a slowly rotating relationship constellation.
 * Nodes = people/tasks placed on a sphere shell; hairline edges link near
 * neighbors. A `staleRatio` of nodes are dimmed (contacts gone cold). A few
 * nodes "ping" (brief brightness) so the network feels alive.
 */

interface ConstellationGeo {
  positions: Float32Array
  brightness: Float32Array // per-node base alpha
  linePositions: Float32Array
}

function build(nodeCount: number, staleRatio: number): ConstellationGeo {
  const rnd = seededRandom('crm-constellation')
  const pts: THREE.Vector3[] = []
  const brightness = new Float32Array(nodeCount)

  for (let i = 0; i < nodeCount; i++) {
    // fibonacci-ish sphere with jitter so it reads organic, not gridded
    const u = rnd() * 2 - 1
    const phi = rnd() * Math.PI * 2
    const r = 1.25 + (rnd() - 0.5) * 0.25
    const s = Math.sqrt(1 - u * u)
    pts.push(new THREE.Vector3(s * Math.cos(phi) * r, u * r, s * Math.sin(phi) * r))
    brightness[i] = rnd() < staleRatio ? 0.12 : 0.6 + rnd() * 0.3
  }

  const positions = new Float32Array(pts.length * 3)
  pts.forEach((p, i) => p.toArray(positions, i * 3))

  // link near neighbors (cap per node)
  const lines: number[] = []
  const linkDist = 0.95
  const linkDistSq = linkDist * linkDist
  const degree = new Int8Array(nodeCount)
  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
      if (degree[i] >= 3) break
      if (degree[j] >= 3) continue
      if (pts[i].distanceToSquared(pts[j]) < linkDistSq) {
        lines.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z)
        degree[i]++; degree[j]++
      }
    }
  }
  return { positions, brightness, linePositions: new Float32Array(lines) }
}

export default function Constellation({
  nodeCount = 80,
  staleRatio = 0.3,
  paused = false,
}: {
  nodeCount?: number
  staleRatio?: number
  paused?: boolean
}) {
  const geo = useMemo(() => build(Math.min(220, Math.max(24, nodeCount)), staleRatio), [nodeCount, staleRatio])
  const groupRef = useRef<THREE.Group>(null)

  // per-node animated alpha so we can "ping" without rebuilding geometry
  const alphaAttr = useRef<THREE.BufferAttribute>(null)
  const alphas = useMemo(() => new Float32Array(geo.brightness), [geo])
  const rndRef = useRef(seededRandom('crm-ping'))

  useFrame((state, delta) => {
    if (paused) return
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.08) * 0.12
    }
    // occasional ping on a random non-stale node
    if (rndRef.current() < delta * 1.4) {
      const i = Math.floor(rndRef.current() * geo.brightness.length)
      if (geo.brightness[i] > 0.2) alphas[i] = 1.6
    }
    // relax all alphas toward base
    for (let i = 0; i < alphas.length; i++) {
      alphas[i] += (geo.brightness[i] - alphas[i]) * Math.min(1, delta * 2.5)
    }
    if (alphaAttr.current) alphaAttr.current.needsUpdate = true
  })

  return (
    <group ref={groupRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geo.positions, 3]} />
          <bufferAttribute ref={alphaAttr} attach="attributes-aAlpha" args={[alphas, 1]} />
        </bufferGeometry>
        {/* custom material so per-node alpha works; additive for bloom */}
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{ uSize: { value: 26 } }}
          vertexShader={`
            attribute float aAlpha;
            varying float vAlpha;
            uniform float uSize;
            void main() {
              vAlpha = aAlpha;
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = uSize / -mv.z;
              gl_Position = projectionMatrix * mv;
            }
          `}
          fragmentShader={`
            varying float vAlpha;
            void main() {
              vec2 c = gl_PointCoord - vec2(0.5);
              float d = length(c);
              if (d > 0.5) discard;
              float a = smoothstep(0.5, 0.0, d) * vAlpha;
              gl_FragColor = vec4(1.0, 1.0, 1.0, a);
            }
          `}
        />
      </points>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geo.linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
    </group>
  )
}
