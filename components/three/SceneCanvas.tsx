'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useReducedMotion } from '@/components/hud'

/**
 * The shared organ stage: black void, soft CRT bloom, perf-respectful.
 * - Pauses the render loop when the tab is hidden or the canvas scrolls off-screen.
 * - Reduced motion: renders on demand (a still frame) instead of looping.
 * - dpr capped at 1.75 so bloom stays cheap on hiDPI.
 *
 * Every section organ (brain, heart, constellation, core) mounts inside this.
 */
export default function SceneCanvas({
  children,
  className = '',
  camera = { position: [0, 0, 4] as [number, number, number], fov: 45 },
  bloomIntensity = 0.55,
}: {
  children: ReactNode
  className?: string
  camera?: { position: [number, number, number]; fov: number }
  bloomIntensity?: number
}) {
  const reduced = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [tabVisible, setTabVisible] = useState(true)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 })
    io.observe(el)
    const onVis = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  const running = visible && tabVisible && !reduced

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <Canvas
        camera={camera}
        dpr={[1, 1.75]}
        frameloop={running ? 'always' : reduced ? 'demand' : 'never'}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <color attach="background" args={['#000000']} />
        {children}
        <EffectComposer>
          {/* threshold keeps the dim cortex OUT of bloom — only pulses and
              dense overlaps ignite. "Lit, not blurry." */}
          <Bloom
            intensity={bloomIntensity}
            luminanceThreshold={0.32}
            luminanceSmoothing={0.25}
            mipmapBlur
            radius={0.6}
          />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
