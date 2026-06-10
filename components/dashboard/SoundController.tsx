'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { primeAudio, setAmbientSection, type Section } from '@/lib/sound'

function sectionFor(pathname: string): Section {
  if (pathname.startsWith('/health')) return 'health'
  if (pathname.startsWith('/finance')) return 'finance'
  if (pathname.startsWith('/crm')) return 'crm'
  if (pathname.startsWith('/review')) return 'review'
  if (pathname === '/') return 'home'
  return null
}

/**
 * Drives the per-section ambient bed. Audio stays silent until the first user
 * gesture (autoplay policy); after that, ambient follows route changes.
 * Renders nothing.
 */
export default function SoundController() {
  const pathname = usePathname()
  const primed = useRef(false)

  // start audio on first gesture
  useEffect(() => {
    const onGesture = () => {
      if (primed.current) return
      primed.current = true
      primeAudio(sectionFor(pathname))
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
    window.addEventListener('pointerdown', onGesture)
    window.addEventListener('keydown', onGesture)
    return () => {
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
  }, [pathname])

  // follow route changes once primed
  useEffect(() => {
    if (primed.current) setAmbientSection(sectionFor(pathname))
  }, [pathname])

  return null
}
