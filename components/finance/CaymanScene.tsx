'use client'

// Dream-car turntable (finance overhaul v2 §11) — a sleek, sculpted supercar on a dark reflective
// studio floor. Self-contained (no external .glb): the body is built from blended ellipsoids for
// smooth curves (not boxes), with chrome multi-spoke wheels, a glass canopy, and slim LED accents.
// Moody, cinematic lighting; a faint green "money" ring on the floor brightens with progress.

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, ContactShadows } from '@react-three/drei'
import type { Group } from 'three'

// --- materials (functions → fresh instance per mesh) ---
function Paint() {
  return <meshPhysicalMaterial color="#a8141f" metalness={0.65} roughness={0.26} clearcoat={1} clearcoatRoughness={0.16} />
}
function Glass() {
  return <meshPhysicalMaterial color="#06080c" metalness={0.5} roughness={0.05} clearcoat={1} clearcoatRoughness={0.1} />
}
function Chrome() {
  return <meshStandardMaterial color="#dfe3ea" metalness={1} roughness={0.13} />
}
function Tire() {
  return <meshStandardMaterial color="#0a0a0c" roughness={0.9} metalness={0.05} />
}
function DarkTrim() {
  return <meshStandardMaterial color="#0c0d10" metalness={0.4} roughness={0.6} />
}

// A smooth ellipsoid (unit sphere scaled) — the building block for the curvy body.
function Blob({ p, s, children }: { p: [number, number, number]; s: [number, number, number]; children: React.ReactNode }) {
  return (
    <mesh position={p} scale={s}>
      <sphereGeometry args={[1, 48, 32]} />
      {children}
    </mesh>
  )
}

function Wheel({ x, z }: { x: number; z: number }) {
  const spokes = Array.from({ length: 10 })
  const face = z > 0 ? 0.16 : -0.16
  return (
    <group position={[x, 0.34, z]} rotation={[Math.PI / 2, 0, 0]}>
      {/* tire */}
      <mesh><cylinderGeometry args={[0.47, 0.47, 0.3, 44]} /><Tire /></mesh>
      {/* rim dish + hub */}
      <mesh position={[0, face, 0]}><cylinderGeometry args={[0.31, 0.31, 0.05, 36]} /><Chrome /></mesh>
      <mesh position={[0, face, 0]}><cylinderGeometry args={[0.09, 0.09, 0.07, 20]} /><Chrome /></mesh>
      {/* multi-spoke */}
      {spokes.map((_, i) => (
        <mesh key={i} position={[0, face, 0]} rotation={[0, (i / spokes.length) * Math.PI * 2, 0]}>
          <boxGeometry args={[0.045, 0.02, 0.5]} />
          <Chrome />
        </mesh>
      ))}
    </group>
  )
}

function CarBody() {
  return (
    <group>
      {/* main lower body */}
      <Blob p={[0, 0.42, 0]} s={[2.55, 0.34, 1.08]}><Paint /></Blob>
      {/* shoulder line */}
      <Blob p={[-0.15, 0.6, 0]} s={[2.15, 0.32, 0.98]}><Paint /></Blob>
      {/* long low nose */}
      <Blob p={[1.75, 0.44, 0]} s={[1.05, 0.27, 0.88]}><Paint /></Blob>
      {/* tail mass */}
      <Blob p={[-1.9, 0.5, 0]} s={[0.9, 0.3, 1.02]}><Paint /></Blob>
      {/* front fender bulges */}
      <Blob p={[1.35, 0.5, 0.6]} s={[0.72, 0.33, 0.5]}><Paint /></Blob>
      <Blob p={[1.35, 0.5, -0.6]} s={[0.72, 0.33, 0.5]}><Paint /></Blob>
      {/* muscular rear haunches */}
      <Blob p={[-1.25, 0.56, 0.66]} s={[0.9, 0.4, 0.56]}><Paint /></Blob>
      <Blob p={[-1.25, 0.56, -0.66]} s={[0.9, 0.4, 0.56]}><Paint /></Blob>
      {/* glass canopy (raked, fastback) */}
      <Blob p={[-0.15, 0.84, 0]} s={[1.08, 0.4, 0.82]}><Glass /></Blob>
      <Blob p={[0.55, 0.66, 0]} s={[0.5, 0.3, 0.8]}><Glass /></Blob>

      {/* front splitter + side sills + rear diffuser (sharp dark accents) */}
      <mesh position={[1.85, 0.16, 0]}><boxGeometry args={[1.2, 0.05, 1.7]} /><DarkTrim /></mesh>
      <mesh position={[0, 0.24, 0.99]}><boxGeometry args={[2.3, 0.07, 0.08]} /><DarkTrim /></mesh>
      <mesh position={[0, 0.24, -0.99]}><boxGeometry args={[2.3, 0.07, 0.08]} /><DarkTrim /></mesh>
      <mesh position={[-2.08, 0.2, 0]}><boxGeometry args={[0.5, 0.08, 1.75]} /><DarkTrim /></mesh>
      {/* subtle ducktail */}
      <mesh position={[-2.0, 0.72, 0]}><boxGeometry args={[0.4, 0.05, 1.55]} /><Paint /></mesh>

      {/* slim LED headlight blades (emissive, understated) */}
      <mesh position={[2.32, 0.46, 0.52]}><boxGeometry args={[0.05, 0.05, 0.44]} /><meshStandardMaterial color="#eaf6ff" emissive="#bfe6ff" emissiveIntensity={1.6} /></mesh>
      <mesh position={[2.32, 0.46, -0.52]}><boxGeometry args={[0.05, 0.05, 0.44]} /><meshStandardMaterial color="#eaf6ff" emissive="#bfe6ff" emissiveIntensity={1.6} /></mesh>
      {/* full-width taillight bar */}
      <mesh position={[-2.26, 0.56, 0]}><boxGeometry args={[0.05, 0.07, 1.3]} /><meshStandardMaterial color="#ff2233" emissive="#ff2233" emissiveIntensity={1.8} /></mesh>

      <Wheel x={1.4} z={0.92} />
      <Wheel x={1.4} z={-0.92} />
      <Wheel x={-1.4} z={0.92} />
      <Wheel x={-1.4} z={-0.92} />
    </group>
  )
}

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame((state, dt) => {
    if (!ref.current) return
    ref.current.rotation.y += dt * 0.32
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.025 // slow cinematic bob
  })
  return <group ref={ref} rotation={[0, Math.PI * 0.78, 0]}>{children}</group>
}

export default function CaymanScene({ progress }: { progress: number }) {
  const money = 0.5 + progress * 2.6 // green floor-ring / underglow intensity

  return (
    <Canvas camera={{ position: [5.2, 1.45, 5.9], fov: 30 }} dpr={[1, 1.8]} gl={{ antialias: true }}>
      <color attach="background" args={['#05060a']} />
      <fog attach="fog" args={['#05060a', 9, 20]} />
      <ambientLight intensity={0.28} />
      {/* cinematic key + cool rim */}
      <spotLight position={[5, 8, 3]} angle={0.5} penumbra={0.9} intensity={1.15} color="#ffffff" />
      <spotLight position={[-6, 3.5, -4]} angle={0.6} penumbra={1} intensity={0.9} color="#5bd0ff" />
      {/* green money underglow */}
      <pointLight position={[0, -0.15, 0]} intensity={money} color="#22c55e" distance={8} />

      <group position={[0, -0.35, 0]}>
        <Turntable><CarBody /></Turntable>

        {/* dark reflective studio floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]}>
          <circleGeometry args={[7, 64]} />
          <meshStandardMaterial color="#05060a" metalness={0.72} roughness={0.38} />
        </mesh>
        {/* faint green progress ring on the floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.11, 0]}>
          <torusGeometry args={[2.2, 0.02, 16, 110]} />
          <meshStandardMaterial color="#39ff9a" emissive="#22c55e" emissiveIntensity={money} />
        </mesh>
        <ContactShadows position={[0, -0.11, 0]} opacity={0.6} scale={11} blur={2.8} far={5} color="#000000" />
      </group>

      <Environment preset="warehouse" />
    </Canvas>
  )
}
