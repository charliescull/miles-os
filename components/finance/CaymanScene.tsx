'use client'

// WebGL dream-car turntable (finance overhaul v2 §11). Self-contained: the car is built
// procedurally from primitives (no external .glb needed), so it always renders. A detailed-yet-
// minimalist red mid-engine coupe spinning on a glowing podium; a green "money" ring + underglow
// brighten as the goal nears. Mounted only while on-screen and not reduced-motion (see DreamCar).

import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, ContactShadows, RoundedBox } from '@react-three/drei'
import type { Group } from 'three'

// --- materials (functions so each mesh gets its own instance) ---
function Paint() {
  return <meshPhysicalMaterial color="#d81f2c" metalness={0.55} roughness={0.26} clearcoat={1} clearcoatRoughness={0.16} />
}
function Glass() {
  return <meshStandardMaterial color="#0a0f16" metalness={0.6} roughness={0.1} />
}
function Tire() {
  return <meshStandardMaterial color="#0a0a0c" roughness={0.85} metalness={0.1} />
}
function Rim() {
  return <meshStandardMaterial color="#cfd3da" metalness={0.95} roughness={0.22} />
}

function Wheel({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.32, z]} rotation={[Math.PI / 2, 0, 0]}>
      {/* tire */}
      <mesh><cylinderGeometry args={[0.44, 0.44, 0.34, 32]} /><Tire /></mesh>
      {/* rim face (outer side) */}
      <mesh position={[0, z > 0 ? 0.18 : -0.18, 0]}><cylinderGeometry args={[0.26, 0.26, 0.04, 24]} /><Rim /></mesh>
      {/* hub */}
      <mesh position={[0, z > 0 ? 0.2 : -0.2, 0]}><cylinderGeometry args={[0.08, 0.08, 0.06, 16]} /><Rim /></mesh>
    </group>
  )
}

function CarModel() {
  return (
    <group position={[0, 0, 0]}>
      {/* lower chassis */}
      <RoundedBox args={[4.0, 0.6, 1.7]} radius={0.22} smoothness={4} position={[0, 0.38, 0]}><Paint /></RoundedBox>
      {/* fender line (slightly wider) */}
      <RoundedBox args={[3.5, 0.42, 1.82]} radius={0.24} smoothness={4} position={[0, 0.6, 0]}><Paint /></RoundedBox>
      {/* front hood wedge */}
      <RoundedBox args={[1.5, 0.34, 1.56]} radius={0.14} smoothness={4} position={[1.35, 0.66, 0]}><Paint /></RoundedBox>
      {/* rear deck (engine cover) */}
      <RoundedBox args={[1.35, 0.4, 1.6]} radius={0.16} smoothness={4} position={[-1.35, 0.7, 0]}><Paint /></RoundedBox>
      {/* cabin / greenhouse (glass) */}
      <RoundedBox args={[1.75, 0.55, 1.36]} radius={0.2} smoothness={4} position={[-0.1, 1.02, 0]}><Glass /></RoundedBox>
      {/* A-pillar cap in body color to break the glass box */}
      <RoundedBox args={[0.5, 0.5, 1.3]} radius={0.16} smoothness={4} position={[0.72, 1.0, 0]}><Paint /></RoundedBox>
      {/* ducktail spoiler */}
      <RoundedBox args={[0.5, 0.1, 1.55]} radius={0.04} smoothness={3} position={[-1.92, 0.98, 0]}><Paint /></RoundedBox>
      {/* side intakes */}
      <mesh position={[-0.7, 0.55, 0.92]}><boxGeometry args={[0.7, 0.28, 0.06]} /><meshStandardMaterial color="#141414" roughness={0.7} /></mesh>
      <mesh position={[-0.7, 0.55, -0.92]}><boxGeometry args={[0.7, 0.28, 0.06]} /><meshStandardMaterial color="#141414" roughness={0.7} /></mesh>
      {/* headlights (emissive) */}
      <mesh position={[2.02, 0.68, 0.55]}><sphereGeometry args={[0.12, 16, 16]} /><meshStandardMaterial color="#eaf6ff" emissive="#bfe6ff" emissiveIntensity={2.2} /></mesh>
      <mesh position={[2.02, 0.68, -0.55]}><sphereGeometry args={[0.12, 16, 16]} /><meshStandardMaterial color="#eaf6ff" emissive="#bfe6ff" emissiveIntensity={2.2} /></mesh>
      {/* full-width taillight bar (emissive red — GTS signature) */}
      <mesh position={[-2.0, 0.72, 0]}><boxGeometry args={[0.07, 0.14, 1.35]} /><meshStandardMaterial color="#ff2233" emissive="#ff2233" emissiveIntensity={2.4} /></mesh>
      {/* wheels */}
      <Wheel x={1.35} z={0.9} />
      <Wheel x={1.35} z={-0.9} />
      <Wheel x={-1.35} z={0.9} />
      <Wheel x={-1.35} z={-0.9} />
    </group>
  )
}

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null)
  // Start on the rear-3/4 (ducktail + taillight bar), sweep to profile.
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.4 })
  return <group ref={ref} rotation={[0, Math.PI * 0.75, 0]}>{children}</group>
}

export default function CaymanScene({ progress }: { progress: number }) {
  const rim = 0.8 + progress * 2.5       // cyan HUD rim brightens toward the goal
  const money = 0.6 + progress * 2.4     // green underglow / ring intensity

  return (
    <Canvas camera={{ position: [4.4, 1.7, 5.2], fov: 38 }} dpr={[1, 1.6]} gl={{ antialias: true }}>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.35} />
      {/* white key */}
      <spotLight position={[4, 7, 4]} angle={0.5} penumbra={0.8} intensity={1.3} color="#ffffff" />
      {/* cyan rim (HUD) */}
      <spotLight position={[-4, 3, -4]} angle={0.6} penumbra={1} intensity={rim} color="#4cc9ff" />
      {/* green money underglow */}
      <pointLight position={[0, -0.25, 0]} intensity={money} color="#22c55e" distance={6} />

      <group position={[0, -0.15, 0]}>
        <Turntable><CarModel /></Turntable>

        {/* glowing podium */}
        <mesh position={[0, -0.42, 0]}>
          <cylinderGeometry args={[1.9, 2.1, 0.6, 64]} />
          <meshStandardMaterial color="#05070a" emissive="#0a2a1c" emissiveIntensity={0.3 + progress * 0.6} metalness={0.9} roughness={0.35} />
        </mesh>
        {/* green "money" progress ring on the podium surface */}
        <mesh position={[0, -0.11, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.62, 0.035, 16, 90]} />
          <meshStandardMaterial color="#39ff9a" emissive="#22c55e" emissiveIntensity={money} />
        </mesh>

        <ContactShadows position={[0, -0.11, 0]} opacity={0.55} scale={9} blur={2.6} far={4} color="#031a10" />
      </group>

      <Environment preset="night" />
    </Canvas>
  )
}
