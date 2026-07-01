'use client'

// WebGL Porsche 718 Cayman on a glowing podium (finance overhaul v2 §11.1). Loaded only when
// public/models/cayman.glb exists (DreamCar probes first) and only while on-screen, so a missing
// model or an offscreen card never costs anything. Rim-light intensity scales with progress.

import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, Environment, ContactShadows } from '@react-three/drei'
import type { Group } from 'three'

function Car() {
  const gltf = useGLTF('/models/cayman.glb')
  return <primitive object={gltf.scene} scale={1.4} position={[0, -0.4, 0]} />
}

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.25 })
  // Start on the rear-3/4 (GTS ducktail + center exhaust), sweeping to profile.
  return <group ref={ref} rotation={[0, Math.PI * 0.75, 0]}>{children}</group>
}

export default function CaymanScene({ progress }: { progress: number }) {
  const rim = 1.5 + progress * 4 // brightens as the goal nears

  return (
    <Canvas camera={{ position: [0, 1.1, 5], fov: 40 }} dpr={[1, 1.6]} gl={{ antialias: true }}>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.25} />
      {/* cyan key rim-light (HUD blue) */}
      <spotLight position={[3, 4, 2]} angle={0.5} penumbra={0.8} intensity={rim} color="#4cc9ff" />
      <spotLight position={[-3, 2, -2]} angle={0.6} penumbra={1} intensity={rim * 0.6} color="#2a7fff" />
      <Suspense fallback={null}>
        <Turntable><Car /></Turntable>
        {/* glowing podium */}
        <mesh position={[0, -0.75, 0]} receiveShadow>
          <cylinderGeometry args={[1.7, 1.9, 0.25, 64]} />
          <meshStandardMaterial color="#05070a" emissive="#0a3a5c" emissiveIntensity={0.4 + progress * 0.8} metalness={0.9} roughness={0.3} />
        </mesh>
        <ContactShadows position={[0, -0.62, 0]} opacity={0.5} scale={8} blur={2.4} far={4} color="#0a2a44" />
        <Environment preset="night" />
      </Suspense>
    </Canvas>
  )
}

useGLTF.preload('/models/cayman.glb')
