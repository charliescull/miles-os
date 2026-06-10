'use client'

import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { isMuted, setMuted } from '@/lib/sound'

/** TopRail mute control. Reflects + persists the global mute flag. */
export default function MuteToggle() {
  const [muted, setLocal] = useState(false)

  useEffect(() => { setLocal(isMuted()) }, [])

  function toggle() {
    const next = !muted
    setLocal(next)
    setMuted(next)
  }

  return (
    <button
      onClick={toggle}
      title={muted ? 'Unmute' : 'Mute'}
      className="text-[oklch(0.45_0_0)] hover:text-white hover:glow transition-colors"
    >
      {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
    </button>
  )
}
